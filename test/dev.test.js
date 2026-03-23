const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {
  WATCH_DEBOUNCE_MS,
  WATCH_POLL_INTERVAL_MS,
  build,
  createDevServer,
  createWatcher,
  createWatcherSnapshot,
  createLiveReloadFallbackHtml,
  diffWatcherSnapshots,
  injectLiveReloadSnippet,
  resolveExistingRequestPath,
  resolveRequestPath,
} = require('../lib/builder');

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mssgen-'));
}

test('injectLiveReloadSnippet adds script before closing body', () => {
  const html = '<html><body><h1>Hello</h1></body></html>';
  const result = injectLiveReloadSnippet(html);

  assert.match(result, /__mssgen\/livereload/);
  assert.ok(result.indexOf('</script>') < result.indexOf('</body>'));
});

test('resolveRequestPath serves directories and extensionless routes from dist', () => {
  const rootDir = makeTempProject();
  fs.mkdirSync(path.join(rootDir, 'dist', 'guide'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'dist', 'guide', 'index.html'), 'guide');
  fs.writeFileSync(path.join(rootDir, 'dist', 'about.html'), 'about');

  assert.equal(resolveRequestPath(rootDir, '/guide/'), path.join(rootDir, 'dist', 'guide', 'index.html'));
  assert.equal(resolveRequestPath(rootDir, '/about'), path.join(rootDir, 'dist', 'about.html'));
});

test('resolveExistingRequestPath returns only existing files', () => {
  const rootDir = makeTempProject();
  fs.mkdirSync(path.join(rootDir, 'dist', 'guide'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'dist', 'guide', 'index.html'), 'guide');

  assert.equal(
    resolveExistingRequestPath(rootDir, '/guide/'),
    path.join(rootDir, 'dist', 'guide', 'index.html'),
  );
  assert.equal(resolveExistingRequestPath(rootDir, '/missing'), null);
});


test('createLiveReloadFallbackHtml returns html that retries via live reload', () => {
  const html = createLiveReloadFallbackHtml('/missing/page');

  assert.match(html, /Rebuilding\.\.\./);
  assert.match(html, /missing\/page/);
  assert.match(html, /__mssgen\/livereload/);
});

test('dev server returns a live-reload fallback html for missing pages', async () => {
  const rootDir = makeTempProject();
  const { server } = createDevServer(rootDir);

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const response = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/missing`, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        contentType: res.headers['content-type'],
        body: data,
      }));
    }).on('error', reject);
  });

  server.close();
  assert.equal(response.statusCode, 404);
  assert.match(response.contentType, /text\/html/);
  assert.match(response.body, /Rebuilding\.\.\./);
  assert.match(response.body, /__mssgen\/livereload/);
});

test('dev server injects live reload script into html responses', async () => {
  const rootDir = makeTempProject();
  fs.writeFileSync(path.join(rootDir, 'index.html'), '<html><body>ok</body></html>');
  await build(rootDir);

  const { server } = createDevServer(rootDir);

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const body = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });

  server.close();
  assert.match(body, /__mssgen\/livereload/);
});

test('dev server serves existing dist output immediately while a rebuild is in progress', async () => {
  const rootDir = makeTempProject();
  const distDir = path.join(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>stale</body></html>');

  let releaseBuild;
  const waitUntilReady = new Promise((resolve) => {
    releaseBuild = resolve;
  });

  const { server } = createDevServer(rootDir, { waitUntilReady });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const startedAt = Date.now();
  const response = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        body: data,
        elapsedMs: Date.now() - startedAt,
      }));
    }).on('error', reject);
  });

  releaseBuild();
  server.close();
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /stale/);
  assert.ok(response.elapsedMs < 50);
});

test('dev server rebuilds once when a missing request arrives before the watcher rebuild finishes', async () => {
  const rootDir = makeTempProject();
  let buildCount = 0;

  fs.writeFileSync(path.join(rootDir, 'index.html'), '<html><body>initial</body></html>');
  await build(rootDir);
  fs.mkdirSync(path.join(rootDir, 'guide'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'guide', 'index.html'), '<html><body>updated</body></html>');

  const { server } = createDevServer(rootDir, {
    triggerBuild: async () => {
      buildCount += 1;
      await build(rootDir);
    },
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const response = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/guide/`, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    }).on('error', reject);
  });

  server.close();
  assert.equal(buildCount, 1);
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /updated/);
});



test('createWatcher emits batched changes once per debounce window', async () => {
  const rootDir = makeTempProject();
  fs.writeFileSync(path.join(rootDir, 'index.html'), '<html><body>ok</body></html>');

  const watcher = createWatcher(rootDir);
  const batchPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.close();
      reject(new Error('watcher did not emit a batch event'));
    }, WATCH_POLL_INTERVAL_MS * 6);

    watcher.on('batch', (changes) => {
      clearTimeout(timeout);
      watcher.close();
      resolve(changes.map(({ eventName, filePath }) => ({
        eventName,
        relativePath: path.relative(rootDir, filePath),
      })));
    });
  });

  setTimeout(() => {
    fs.mkdirSync(path.join(rootDir, 'guide'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'guide', 'index.html'), '<html><body>guide</body></html>');
    fs.writeFileSync(path.join(rootDir, 'index.html'), '<html><body>updated</body></html>');
  }, WATCH_POLL_INTERVAL_MS);

  const changes = await batchPromise;

  assert.deepEqual(changes, [
    { eventName: 'add', relativePath: 'guide/index.html' },
    { eventName: 'change', relativePath: 'index.html' },
  ]);
});

test('diffWatcherSnapshots detects add, change, and unlink events in order', () => {
  const previousSnapshot = new Map([
    ['about.html', 1],
    ['guide/index.html', 2],
  ]);
  const nextSnapshot = new Map([
    ['about.html', 3],
    ['contact.html', 4],
  ]);

  assert.deepEqual(diffWatcherSnapshots(previousSnapshot, nextSnapshot), [
    { eventName: 'change', relativePath: 'about.html' },
    { eventName: 'add', relativePath: 'contact.html' },
    { eventName: 'unlink', relativePath: 'guide/index.html' },
  ]);
});

test('createWatcher watches source files, common parts, and settings without reacting to dist output', async () => {
  const rootDir = makeTempProject();
  fs.writeFileSync(path.join(rootDir, 'index.html'), '<html><body>ok</body></html>');
  fs.mkdirSync(path.join(rootDir, 'common'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'common', 'header.html'), '<header>ok</header>');
  fs.writeFileSync(path.join(rootDir, 'setting.json'), JSON.stringify({ TITLE: 'ok' }));
  await build(rootDir);

  const initialSnapshot = createWatcherSnapshot(rootDir);
  assert.deepEqual([...initialSnapshot.keys()].sort(), ['common/header.html', 'index.html', 'setting.json']);

  const collectSingleEvent = (mutate) => new Promise((resolve, reject) => {
    const watcher = createWatcher(rootDir);
    const timeout = setTimeout(() => {
      watcher.close();
      reject(new Error('watcher did not emit a change event'));
    }, WATCH_POLL_INTERVAL_MS * 6);

    watcher.on('all', (eventName, filePath) => {
      clearTimeout(timeout);
      watcher.close();
      resolve({ eventName, relativePath: path.relative(rootDir, filePath) });
    });

    setTimeout(mutate, WATCH_POLL_INTERVAL_MS);
  });

  const sourceEvent = await collectSingleEvent(() => {
    fs.writeFileSync(path.join(rootDir, 'index.html'), '<html><body>updated</body></html>');
    fs.writeFileSync(path.join(rootDir, 'dist', 'index.html'), 'ignored output');
  });
  await new Promise((resolve) => setTimeout(resolve, WATCH_DEBOUNCE_MS + 20));

  const partEvent = await collectSingleEvent(() => {
    fs.writeFileSync(path.join(rootDir, 'common', 'header.html'), '<header>updated</header>');
  });
  await new Promise((resolve) => setTimeout(resolve, WATCH_DEBOUNCE_MS + 20));

  const settingsEvent = await collectSingleEvent(() => {
    fs.writeFileSync(path.join(rootDir, 'setting.json'), JSON.stringify({ TITLE: 'updated' }));
  });
  await new Promise((resolve) => setTimeout(resolve, WATCH_DEBOUNCE_MS + 20));

  assert.deepEqual(sourceEvent, { eventName: 'change', relativePath: 'index.html' });
  assert.deepEqual(partEvent, { eventName: 'change', relativePath: 'common/header.html' });
  assert.deepEqual(settingsEvent, { eventName: 'change', relativePath: 'setting.json' });
});
