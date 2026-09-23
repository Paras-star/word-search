/**
 * Standalone production server for Expo static builds.
 *
 * Serves the native and web exports in static-build/:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - Browser routes → web index.html (with a fallback for deep links)
 * - Static files → web export first, native bundles and assets second
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const WEB_ROOT = path.join(STATIC_ROOT, 'web');
const WEB_INDEX = path.join(WEB_ROOT, 'index.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, 'utf-8');
  res.writeHead(200, {
    'content-type': 'application/json',
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
  });
  res.end(manifest);
}

function serveWebIndex(res) {
  const html = fs.readFileSync(WEB_INDEX);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const webPath = path.join(WEB_ROOT, safePath);
  const nativePath = path.join(STATIC_ROOT, safePath);
  if (!webPath.startsWith(WEB_ROOT + path.sep) || !nativePath.startsWith(STATIC_ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  const filePath = [webPath, nativePath].find((candidate) =>
    fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
  if (!filePath) return false;

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'content-type': contentType });
  res.end(content);
  return true;
}

if (!fs.existsSync(WEB_INDEX)) {
  throw new Error('Web export is missing: build Word Hunt before serving it');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || '/';
  }

  if (pathname === '/' || pathname === '/manifest') {
    const platform = req.headers['expo-platform'];
    if (platform === 'ios' || platform === 'android') {
      return serveManifest(platform, res);
    }

    if (pathname === '/') return serveWebIndex(res);
  }

  if (serveStaticFile(pathname, res)) return;
  if (pathname !== '/manifest' && !path.extname(pathname) && !pathname.startsWith('/_expo/')) {
    return serveWebIndex(res);
  }
  res.writeHead(404);
  res.end('Not Found');
});

const port = parseInt(process.env.PORT || '3000', 10);
server.listen(port, '0.0.0.0', () => {
  console.log(`Serving static Expo build on port ${port}`);
});
