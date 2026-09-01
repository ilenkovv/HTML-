function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/u, "");
}

/**
 * SSR-safe absolute URL builder. Pass origin from a client effect or request.
 * Without an origin on the server, it intentionally returns a relative path.
 */
export function absoluteAppUrl(url: string, origin?: string): string {
  if (/^https?:\/\//iu.test(url)) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  const effectiveOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const cleanOrigin = normalizeOrigin(effectiveOrigin);
  return cleanOrigin ? `${cleanOrigin}${path}` : path;
}
