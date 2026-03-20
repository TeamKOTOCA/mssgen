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
  diffWatcherSnapshots,
  injectLiveReloadSnippet,
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
