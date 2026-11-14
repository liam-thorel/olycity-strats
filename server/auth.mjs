/**
 * Connexion avec Discord (OAuth2, scopes « identify guilds ») : seuls les
 * membres du serveur Discord OLYCITY entrent. L'appartenance est revérifiée
 * régulièrement, donc retirer quelqu'un du serveur lui coupe l'accès.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { JsonFile } from './store.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const STATE_COOKIE = 'strats_oauth';
const SESSION_COOKIE = 'strats_session';

export function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map(part => part.trim().split('=')).filter(([key]) => key)
    .map(([key, ...rest]) => [key, decodeURIComponent(rest.join('='))]));
}

function cookie(name, value, { maxAge, secure }) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

const hash = value => createHash('sha256').update(value).digest('hex');

function sameToken(left = '', right = '') {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function avatarUrl(user) {
  if (!user.avatar) return '';
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
}

export class Auth {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.secure = config.PUBLIC_URL.startsWith('https://');
    this.file = new JsonFile(join(config.DATA_DIR, 'sessions.json'), { sessions:{} });
    this.redirectUri = `${config.PUBLIC_URL}/auth/callback`;
    this.pending = new Map();
    this.prune();
  }

  get sessions() { return this.file.data.sessions; }

  prune() {
    const now = Date.now();
    for (const [key, session] of Object.entries(this.sessions)) {
      if (session.expiresAt < now) delete this.sessions[key];
    }
    this.file.save();
  }

  loginRedirect() {
    const state = randomBytes(16).toString('hex');
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', this.config.DISCORD_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', 'identify guilds');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'none');
    return { location:url.href, setCookie:cookie(STATE_COOKIE, state, { maxAge:600, secure:this.secure }) };
  }

  async discord(path, token) {
    const response = await this.fetch(`${DISCORD_API}${path}`, {
      headers:{ Authorization:`Bearer ${token}` },
      signal:AbortSignal.timeout(10_000),
    });
    if (response.status === 401) return { unauthorized:true };
    if (!response.ok) throw new Error(`Discord ${response.status}`);
    return { data:await response.json() };
  }

  async tokenRequest(params) {
    const response = await this.fetch(`${DISCORD_API}/oauth2/token`, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body:new URLSearchParams({
        client_id:this.config.DISCORD_CLIENT_ID,
        client_secret:this.config.DISCORD_CLIENT_SECRET,
        ...params,
      }),
      signal:AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return response.json();
  }

  async isMember(token) {
    const result = await this.discord('/users/@me/guilds', token);
    if (result.unauthorized) return null;
    return result.data.some(guild => guild.id === this.config.DISCORD_GUILD_ID);
  }

  /** Fin du parcours OAuth. Renvoie { setCookie } ou { error } ('state', 'token', 'member'). */
  async callback(query, cookies) {
    if (!query.get('code') || !sameToken(query.get('state'), cookies[STATE_COOKIE])) return { error:'state' };
    const tokens = await this.tokenRequest({ grant_type:'authorization_code', code:query.get('code'), redirect_uri:this.redirectUri });
    if (!tokens?.access_token) return { error:'token' };
    const me = await this.discord('/users/@me', tokens.access_token);
    if (!me.data) return { error:'token' };
    if (!(await this.isMember(tokens.access_token))) return { error:'member' };

    const sessionToken = randomBytes(32).toString('hex');
    const now = Date.now();
    this.sessions[hash(sessionToken)] = {
      user:{ id:me.data.id, name:me.data.global_name || me.data.username, avatar:avatarUrl(me.data) },
      accessToken:tokens.access_token,
      refreshToken:tokens.refresh_token,
      tokenExpiresAt:now + tokens.expires_in * 1000,
      checkedAt:now,
      expiresAt:now + this.config.SESSION_DAYS * 86_400_000,
    };
    this.file.save();
    return {
      setCookie:[
        cookie(SESSION_COOKIE, sessionToken, { maxAge:this.config.SESSION_DAYS * 86_400, secure:this.secure }),
        cookie(STATE_COOKIE, '', { maxAge:0, secure:this.secure }),
      ],
    };
  }

  devLogin() {
    const sessionToken = randomBytes(32).toString('hex');
    this.sessions[hash(sessionToken)] = {
      user:{ id:'dev', name:'Dev local', avatar:'' }, dev:true,
      checkedAt:Date.now(), expiresAt:Date.now() + 86_400_000,
    };
    this.file.save();
    return cookie(SESSION_COOKIE, sessionToken, { maxAge:86_400, secure:this.secure });
  }

  logout(cookies) {
    const key = cookies[SESSION_COOKIE] ? hash(cookies[SESSION_COOKIE]) : '';
    if (key && this.sessions[key]) {
      delete this.sessions[key];
      this.file.save();
    }
    return cookie(SESSION_COOKIE, '', { maxAge:0, secure:this.secure });
  }

  /** Revérifie l'appartenance au serveur. false = accès à retirer. */
  async recheck(session) {
    const now = Date.now();
    if (session.tokenExpiresAt < now + 60_000) {
      const tokens = await this.tokenRequest({ grant_type:'refresh_token', refresh_token:session.refreshToken });
      if (!tokens?.access_token) return false;
      session.accessToken = tokens.access_token;
      session.refreshToken = tokens.refresh_token || session.refreshToken;
      session.tokenExpiresAt = now + tokens.expires_in * 1000;
    }
    const member = await this.isMember(session.accessToken);
    if (member === null) return false;
    session.checkedAt = now;
    this.file.save();
    return member;
  }

  /** Utilisateur de la requête, ou null. Revérifie Discord toutes les RECHECK_HOURS. */
  async user(cookies) {
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;
    const key = hash(token);
    const session = this.sessions[key];
    if (!session || session.expiresAt < Date.now()) return null;
    if (!session.dev && Date.now() - session.checkedAt > this.config.RECHECK_HOURS * 3_600_000) {
      // Plusieurs requêtes en même temps (vidéo, flux…) : une seule vérification.
      if (!this.pending.has(key)) this.pending.set(key, this.recheck(session).finally(() => this.pending.delete(key)));
      try {
        if (!(await this.pending.get(key))) {
          delete this.sessions[key];
          this.file.save();
          return null;
        }
      } catch {
        // Discord injoignable : on garde la session, nouvel essai à la prochaine requête.
      }
    }
    return session.user;
  }
}
