/**
 * Content Security Policy for pages. Scripts run only with this request's nonce ('strict-dynamic' lets a
 * trusted script load the map libraries it needs), so an injected inline script is refused. Styles keep
 * 'unsafe-inline': React style props and the map libraries set inline styles, and a style cannot run code.
 */
const MAP_HOSTS =
  "https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://maps.googleapis.com https://maps.gstatic.com https://api.maptiler.com https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org";

export function buildCsp(nonce: string, dev = process.env.NODE_ENV !== "production"): string {
  return [
    "default-src 'self'",
    // Host list is the fallback for browsers without 'strict-dynamic'; modern ones ignore it in favour of the nonce.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://maps.googleapis.com https://maps.gstatic.com https://api.mapbox.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${MAP_HOSTS}${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
