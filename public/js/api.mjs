/** Appels au serveur OLYCITY Strats (même origine, cookie de session Discord). */

export class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials:'same-origin',
    headers:body === undefined ? {} : { 'Content-Type':'application/json' },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new ApiError(401, 'Session expirée : reconnecte-toi avec Discord.', data);
    throw new ApiError(response.status, data.error || `Erreur ${response.status}`, data);
  }
  return data;
}

/** Utilisateur connecté, ou null s'il faut se connecter. Lève si le serveur est injoignable. */
export async function me() {
  const response = await fetch('/api/me', { credentials:'same-origin' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Serveur ${response.status}`);
  return (await response.json()).user;
}

export const logout = () => api('/auth/logout', { method:'POST' });

/**
 * Suit la liste des strats en direct (Server-Sent Events). EventSource se
 * reconnecte tout seul ; une session expirée recharge la page.
 */
export function subscribe(onItems, { onError, onUnauthorized } = {}) {
  const source = new EventSource('/api/events');
  source.addEventListener('strats', event => {
    try { onItems(JSON.parse(event.data).items); } catch (error) { onError?.(error); }
  });
  source.addEventListener('error', async () => {
    onError?.();
    if (source.readyState === EventSource.CLOSED) {
      // Fermé par le navigateur (401…) : on vérifie la session puis on relance.
      if (!(await me().catch(() => true))) onUnauthorized?.();
      else setTimeout(() => subscribe(onItems, { onError, onUnauthorized }), 5_000);
    }
  });
  return () => source.close();
}
