const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {
  build,
  createDevServer,
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
  build(rootDir);

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
