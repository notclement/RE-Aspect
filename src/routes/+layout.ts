// The whole app runs in the browser (fast, offline-capable PWA). Each route is
// prerendered as an empty shell so Cloudflare Pages can serve it as a static file.
export const ssr = false;
export const prerender = true;
