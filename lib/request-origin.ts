/**
 * Derive the `proto://host` origin of the inbound request from its forwarded
 * headers, or `null` when there is no host to follow OR the forwarded host is
 * not on the trusted allowlist.
 *
 * WHY separate from `siteUrl()`: this is used ONLY for password-reset links so
 * they follow the host actually serving the request (e.g. the Cloudflare
 * workers.dev host vs. Vercel). It deliberately does NOT touch `siteUrl()`'s
 * canonical-first precedence (NEXT_PUBLIC_SITE_URL -> VERCEL_URL -> request
 * origin), which digest/approval emails rely on.
 *
 * SECURITY: `x-forwarded-host` is client-influenceable (Host-header injection),
 * so an unvalidated value would let an attacker point a victim's reset link at
 * an attacker-controlled domain (T-pwd-02 / T-eoe-03). We therefore accept the
 * host only when it matches the deployment allowlist (localhost, *.workers.dev,
 * *.vercel.app); any other host returns `null`, and the caller falls back to the
 * canonical `siteUrl()`.
 *
 * Kept plain (no `import "server-only"`): it holds no secrets and stays
 * unit-testable under vitest's node environment.
 */
export function requestOrigin(h: { get(name: string): string | null }): string | null {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || !isAllowedHost(host)) return null;
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/**
 * True when `host` (optionally with a port) is a trusted deployment host:
 * localhost / 127.0.0.1 for dev, or a subdomain of workers.dev (Cloudflare) or
 * vercel.app. Suffix checks require the leading dot so look-alikes such as
 * `workers.dev.evil.com` or `evil-workers.dev` are rejected.
 */
function isAllowedHost(host: string): boolean {
  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return hostname.endsWith(".workers.dev") || hostname.endsWith(".vercel.app");
}
