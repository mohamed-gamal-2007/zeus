/**
 * Safe post-login destination.
 *
 * Reads `?returnTo=` from the current URL and only honours same-origin,
 * root-relative paths — never `//evil.com`, absolute URLs, or auth pages
 * (which would bounce the user in a redirect loop).
 */
const DEFAULT_RETURN_TO = "/";

const AUTH_PAGES = /^\/(login|register|forgot-password|reset-password|auth\/callback)(\/|$|\?)/;

export function safeReturnTo(fallback = DEFAULT_RETURN_TO) {
  let raw = "";
  try {
    raw = new URLSearchParams(window.location.search).get("returnTo") || "";
  } catch {
    return fallback;
  }
  if (!raw) return fallback;

  let target = raw;
  try {
    target = decodeURIComponent(raw);
  } catch {
    // keep the raw value if it isn't valid percent-encoding
  }
  target = target.trim();

  if (!target.startsWith("/")) return fallback; // absolute URL or junk
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback; // protocol-relative
  if (target.includes("://")) return fallback;
  if (AUTH_PAGES.test(target)) return fallback;

  return target;
}

export default safeReturnTo;
