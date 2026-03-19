const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { URL } = require('node:url');
const DIST_DIR_NAME = 'dist';
const COMMON_DIR_NAME = 'common';
const SETTINGS_FILE_NAME = 'setting.json';
const DEV_SERVER_PORT = Number(process.env.MSSGEN_PORT || 3000);
const LIVE_RELOAD_ENDPOINT = '/__mssgen/livereload';
const WATCH_DEBOUNCE_MS = 50;
const WATCH_POLL_INTERVAL_MS = 250;
const LIVE_RELOAD_SNIPPET = `<script>
(() => {
  const source = new EventSource('${LIVE_RELOAD_ENDPOINT}');
  source.addEventListener('reload', () => window.location.reload());
  source.onerror = () => {
    source.close();
    setTimeout(() => window.location.reload(), 1000);
  };
})();
</script>`;
const BINARY_EXTENSIONS = new Set([
  '.7z', '.avif', '.bmp', '.bz2', '.class', '.doc', '.docx', '.eot', '.exe', '.gif', '.gz',
  '.ico', '.jar', '.jpeg', '.jpg', '.mov', '.mp3', '.mp4', '.pdf', '.png', '.ppt', '.pptx',
  '.rar', '.tar', '.tgz', '.ttf', '.wav', '.webm', '.webp', '.woff', '.woff2', '.xls', '.xlsx',
  '.zip',
]);
const ROOT_IGNORE_NAMES = new Set([
  DIST_DIR_NAME,
  'node_modules',
  '.git',
  COMMON_DIR_NAME,
  SETTINGS_FILE_NAME,
  'package.json',
  'package-lock.json',
]);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function warn(message) {
  console.warn(`[mssgen] ${message}`);
}

function info(message) {
  console.log(`[mssgen] ${message}`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadSettings(rootDir) {
  const settingsPath = path.join(rootDir, SETTINGS_FILE_NAME);

  if (!fs.existsSync(settingsPath)) {
    warn('setting.json が見つからないため、変数置換をスキップします。');
    return {};
  }

  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      warn('setting.json はオブジェクト形式である必要があります。');
      return {};
    }

    return parsed;
  } catch (error) {
    warn(`setting.json の読み込みに失敗しました: ${error.message}`);
    return {};
  }
}

function listFilesRecursively(dirPath, baseDir = dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      return listFilesRecursively(absolutePath, baseDir);
    }

    if (!entry.isFile()) {
      return [];
    }

    return [{
      absolutePath,
      relativePath: path.relative(baseDir, absolutePath),
    }];
  });
}

function loadParts(rootDir) {
  const partsDir = path.join(rootDir, COMMON_DIR_NAME);

  if (!fs.existsSync(partsDir)) {
    return {};
  }

  return listFilesRecursively(partsDir, partsDir).reduce((parts, file) => {
    parts[file.relativePath] = fs.readFileSync(file.absolutePath, 'utf8');
    return parts;
  }, {});
}

function injectParts(content, parts, stack = []) {
  return content.replace(/{{(.*?)}}/g, (_, name) => {
    const key = String(name).trim();

    if (!(key in parts)) {
      warn(`パーツ '${key}' が見つかりません。`);
      return '';
    }

    if (stack.includes(key)) {
      warn(`パーツ '${key}' の再帰参照を検出したため展開を停止しました。`);
      return '';
    }

    return injectParts(parts[key], parts, [...stack, key]);
  });
}

function injectSettings(content, settings) {
  return content.replace(/{(.*?)}/g, (match, name) => {
    const key = String(name).trim();

    if (!(key in settings)) {
      return match;
    }

    return String(settings[key]);
  });
}

function shouldIgnoreRelativePath(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join('/');
  const topLevelName = normalizedPath.split('/')[0];
  return ROOT_IGNORE_NAMES.has(topLevelName);
}

function isTextFile(relativePath) {
  return !BINARY_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function getSourceFiles(rootDir) {
  return listFilesRecursively(rootDir, rootDir)
    .filter((file) => !shouldIgnoreRelativePath(file.relativePath))
    .map((file) => ({
      ...file,
      outputPath: path.join(rootDir, DIST_DIR_NAME, file.relativePath),
    }));
}

function emptyDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function build(rootDir = process.cwd()) {
  const distDir = path.join(rootDir, DIST_DIR_NAME);
  emptyDir(distDir);

  const settings = loadSettings(rootDir);
  const parts = loadParts(rootDir);
  const sourceFiles = getSourceFiles(rootDir);

  sourceFiles.forEach(({ absolutePath, outputPath, relativePath }) => {
    ensureDir(path.dirname(outputPath));

    if (isTextFile(relativePath)) {
      const source = fs.readFileSync(absolutePath, 'utf8');
      const withParts = injectParts(source, parts);
      const result = injectSettings(withParts, settings);
      fs.writeFileSync(outputPath, result, 'utf8');
    } else {
      fs.copyFileSync(absolutePath, outputPath);
    }

    info(`built: ${relativePath}`);
  });

  info(`build complete: ${sourceFiles.length} file(s)`);
  return sourceFiles.length;
}

function createWatcherSnapshot(rootDir) {
  return new Map(
    getSourceFiles(rootDir).map((file) => [
      file.relativePath,
      fs.statSync(file.absolutePath).mtimeMs,
    ]),
  );
}

function diffWatcherSnapshots(previousSnapshot, nextSnapshot) {
  const changes = [];

  for (const [relativePath, nextMtimeMs] of nextSnapshot) {
    if (!previousSnapshot.has(relativePath)) {
      changes.push({ eventName: 'add', relativePath });
      continue;
    }

    if (previousSnapshot.get(relativePath) !== nextMtimeMs) {
      changes.push({ eventName: 'change', relativePath });
    }
  }

  for (const relativePath of previousSnapshot.keys()) {
    if (!nextSnapshot.has(relativePath)) {
      changes.push({ eventName: 'unlink', relativePath });
    }
  }

  return changes.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function createWatcher(rootDir) {
  let currentSnapshot = createWatcherSnapshot(rootDir);
  let closed = false;
  let pendingChanges = [];
  let debounceTimer = null;
  let pollingTimer = null;
  const listeners = new Map();

  const emit = (eventName, filePath) => {
    const handlers = listeners.get(eventName) || [];
    for (const handler of handlers) {
      handler(filePath);
    }

    const allHandlers = listeners.get('all') || [];
    for (const handler of allHandlers) {
      handler(eventName, filePath);
    }
  };

  const flushPendingChanges = () => {
    debounceTimer = null;
    const changes = pendingChanges;
    pendingChanges = [];

    for (const change of changes) {
      emit(change.eventName, path.join(rootDir, change.relativePath));
    }
  };

  const scheduleFlush = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(flushPendingChanges, WATCH_DEBOUNCE_MS);
  };

  const poll = () => {
    if (closed) {
      return;
    }

    try {
      const nextSnapshot = createWatcherSnapshot(rootDir);
      const changes = diffWatcherSnapshots(currentSnapshot, nextSnapshot);

      if (changes.length > 0) {
        currentSnapshot = nextSnapshot;
        pendingChanges.push(...changes);
        scheduleFlush();
      }
    } catch (error) {
      warn(`watch error: ${error.message}`);
    }
  };

  pollingTimer = setInterval(poll, WATCH_POLL_INTERVAL_MS);
  if (typeof pollingTimer.unref === 'function') {
    pollingTimer.unref();
  }

  return {
    close() {
      closed = true;
      if (pollingTimer) {
        clearInterval(pollingTimer);
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    },
    on(eventName, handler) {
      const handlers = listeners.get(eventName) || [];
      handlers.push(handler);
      listeners.set(eventName, handlers);
      return this;
    },
  };
}

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function injectLiveReloadSnippet(html) {
  if (html.includes(LIVE_RELOAD_ENDPOINT)) {
    return html;
  }

  if (html.includes('</body>')) {
    return html.replace('</body>', `${LIVE_RELOAD_SNIPPET}\n</body>`);
  }

  return `${html}\n${LIVE_RELOAD_SNIPPET}`;
}

function resolveRequestPath(rootDir, requestUrl) {
  const distDir = path.join(rootDir, DIST_DIR_NAME);
  const url = new URL(requestUrl, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const safePath = path.normalize(pathname).replace(/^([.][.][/\\])+/, '');
  let filePath = path.join(distDir, safePath);

  if (!filePath.startsWith(distDir)) {
    return null;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!path.extname(filePath)) {
    const htmlPath = `${filePath}.html`;

    if (fs.existsSync(htmlPath)) {
      filePath = htmlPath;
    } else {
      filePath = path.join(filePath, 'index.html');
    }
  }

  return filePath;
}

function createDevServer(rootDir) {
  const clients = new Set();

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === LIVE_RELOAD_ENDPOINT) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    const filePath = resolveRequestPath(rootDir, req.url);

    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const contentType = getContentType(filePath);
    const isHtml = path.extname(filePath).toLowerCase() === '.html';

    if (isHtml) {
      const html = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(injectLiveReloadSnippet(html));
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  const broadcastReload = () => {
    for (const client of clients) {
      client.write('event: reload\ndata: now\n\n');
    }
  };

  return { server, broadcastReload };
}

function dev(rootDir = process.cwd()) {
  const { server, broadcastReload } = createDevServer(rootDir);

  const rebuild = () => {
    build(rootDir);
    broadcastReload();
  };

  build(rootDir);

  server.listen(DEV_SERVER_PORT, () => {
    info(`dev server running at http://127.0.0.1:${DEV_SERVER_PORT}`);
  });

  const watcher = createWatcher(rootDir);

  watcher.on('all', (eventName, filePath) => {
    info(`${eventName}: ${path.relative(rootDir, filePath)}`);
    rebuild();
  });

  info('watching for changes...');
  return { watcher, server };
}

module.exports = {
  COMMON_DIR_NAME,
  DEV_SERVER_PORT,
  DIST_DIR_NAME,
  SETTINGS_FILE_NAME,
  LIVE_RELOAD_ENDPOINT,
  WATCH_DEBOUNCE_MS,
  WATCH_POLL_INTERVAL_MS,
  build,
  createDevServer,
  createWatcher,
  createWatcherSnapshot,
  dev,
  diffWatcherSnapshots,
  getSourceFiles,
  injectLiveReloadSnippet,
  injectParts,
  injectSettings,
  isTextFile,
  listFilesRecursively,
  loadParts,
  loadSettings,
  resolveRequestPath,
  shouldIgnoreRelativePath,
};
