/**
 * Derive the `proto://host` origin of the inbound request from its forwarded
 * headers, or `null` when no host header is present.
 *
 * WHY separate from `siteUrl()`: this is used ONLY for password-reset links so
 * they follow the host actually serving the request (e.g. the Cloudflare
 * workers.dev host vs. Vercel). It deliberately does NOT touch `siteUrl()`'s
 * canonical-first precedence (NEXT_PUBLIC_SITE_URL -> VERCEL_URL -> request
 * origin), which digest/approval emails rely on. Returning `null` signals the
 * caller to fall back to `siteUrl()` when there is no host to follow.
 *
 * Kept plain (no `import "server-only"`): it holds no secrets and stays
 * unit-testable under vitest's node environment.
 */
export function requestOrigin(h: { get(name: string): string | null }): string | null {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
