/**
 * Where to go after signing in: the `redirect` the proxy added, if it is a path on this site.
 * Anything else (another site, "//evil.com", "/\evil.com") goes home, so the link can't be used to
 * send someone off-site after they sign in.
 */
export function safeRedirect(target: string | null | undefined) {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return "/";
  if (target.startsWith("/auth/")) return "/";
  return target;
}
