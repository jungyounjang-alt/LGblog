// Token plumbing for the frontend.
// Token is read from URL ?token=xxx on load and persisted to localStorage so the
// partner can bookmark the URL once and revisit without the query string.

const KEY = 'lgblog_token';

function readTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('token');
  if (!t) return null;
  // Persist and clean the URL
  localStorage.setItem(KEY, t);
  params.delete('token');
  const cleaned =
    window.location.pathname +
    (params.toString() ? `?${params.toString()}` : '') +
    window.location.hash;
  window.history.replaceState({}, '', cleaned);
  return t;
}

export function getToken(): string {
  return readTokenFromUrl() ?? localStorage.getItem(KEY) ?? '';
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const token = getToken();
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
  if (!token || !url.startsWith('/api')) return originalFetch(input, init);
  const headers = new Headers(init.headers ?? (typeof input !== 'string' && 'headers' in input ? input.headers : undefined));
  headers.set('X-Token', token);
  return originalFetch(input, { ...init, headers });
};

export type Role = 'admin' | 'partner' | 'public';
export async function fetchRole(): Promise<Role> {
  const r = await fetch('/api/me').then((x) => x.json()).catch(() => ({ role: 'public' }));
  return (r.role as Role) ?? 'public';
}
