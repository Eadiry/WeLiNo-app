import { Storage } from './storage';

/**
 * Confirmed real, live evidence this session: `api.allanime.day` (AllManga's
 * backing API) returns `Server: cloudflare` + a body starting with
 * `<!DOCTYPE html><html ...><title>Just a moment...</title>` on a 403 when
 * its JS challenge hasn't been solved. This detection is deliberately
 * duck-typed (status + generic markers) rather than tied to any one
 * source's own convention — confirmed via real bundle inspection that most
 * currently-broken sources (FlameScans, ReaperScans, ZeroScans, MangaPill,
 * ComicExtra) implement neither of Paperback's official per-source
 * Cloudflare-bypass mechanisms at all, so a mechanism that needs zero
 * source cooperation is the only thing that actually helps them.
 */
export function looksCloudflareBlocked(
  status: number,
  headers: Record<string, string> | undefined,
  bodyText?: string,
): boolean {
  if (status !== 403 && status !== 503) return false;
  const server = headers?.['server'] ?? headers?.['Server'];
  if (server?.toLowerCase().includes('cloudflare')) return true;
  if (!bodyText) return false;
  return (
    bodyText.includes('Just a moment') ||
    bodyText.includes('cf-browser-verification') ||
    bodyText.includes('__cf_chl')
  );
}

const CACHE_NAMESPACE = '__cloudflare_bypass__';
const CACHE_TTL_MS = 25 * 60 * 1000; // cf_clearance is time-limited; refresh well before it typically expires.
const cache = new Storage(CACHE_NAMESPACE);

const domainOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/**
 * Resolves a Cloudflare challenge for `url`'s domain and returns a `Cookie`
 * header value to attach to subsequent requests — cached per domain (a
 * fresh solve opens a real WebView, which is slow and visible-ish, so
 * every request on a blocked domain must not re-solve). Returns `undefined`
 * if the bypass fails or times out; callers should surface the original
 * blocked response in that case rather than looping.
 */
export async function resolveCloudflareCookies(
  url: string,
): Promise<string | undefined> {
  const domain = domainOf(url);
  const cached = cache.get(domain) as string | undefined;
  if (cached) return cached;

  // Requires `requestCloudflareBypass` from `CloudflareBypassHost` — a
  // lazy `require()` (not a top-level import) avoids a hard dependency
  // cycle (the host is a React component that itself imports plugin types
  // indirectly via manga screens), and keeps this helper importable from
  // plain test contexts that never mount the host. A dynamic `import()`
  // would do the same thing at runtime but doesn't transform cleanly
  // under Jest's CommonJS setup here.
  const { requestCloudflareBypass } =
    require('@components/CloudflareBypassHost') as typeof import('@components/CloudflareBypassHost');
  try {
    const cookies = await requestCloudflareBypass(url);
    if (cookies.length === 0) return undefined;
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    cache.set(domain, cookieHeader, Date.now() + CACHE_TTL_MS);
    return cookieHeader;
  } catch {
    return undefined;
  }
}
