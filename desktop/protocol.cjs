const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

function resolveRequest(rawUrl, webRoot, data) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'vastu:' || url.hostname !== 'app') return null;
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith('/__plans/')) return data.planPath(pathname.slice('/__plans/'.length));
  const relative = pathname.replace(/^\/+/, '') || 'index.html';
  const candidate = path.resolve(webRoot, relative);
  if (!candidate.startsWith(path.resolve(webRoot) + path.sep)) return null;
  for (const file of [candidate, `${candidate}.html`, path.join(candidate, 'index.html')]) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  if (!path.extname(relative)) return path.join(webRoot, 'index.html');
  return null;
}
function registerProtocol(protocol, net, webRoot, data) {
  protocol.handle('vastu', async request => {
    try {
      const file = resolveRequest(request.url, webRoot, data);
      if (!file) return new Response('Not found', { status: 404 });
      const source = await net.fetch(pathToFileURL(file).href);
      const response = new Response(source.body, {status:source.status, headers:new Headers(source.headers)});
      // Local UI only gets the preload bridge. Plan files are images, never documents.
      response.headers.set('X-Content-Type-Options', 'nosniff');
      if (new URL(request.url).pathname.startsWith('/__plans/')) response.headers.set('Content-Type', {'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[path.extname(file)]);
      else response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; frame-src https:; object-src 'none'; base-uri 'self'");
      return response;
    } catch { return new Response('Not found', { status: 404 }); }
  });
}
module.exports = { registerProtocol, resolveRequest };
