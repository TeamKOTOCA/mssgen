const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { build, getSourceFiles, injectParts, shouldIgnoreRelativePath } = require('../lib/builder');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mssgen-'));
}

test('injectParts expands parts recursively', () => {
  const result = injectParts('{{page}}', {
    page: '<main>{{header}}</main>',
    header: '<header>Title</header>',
  });

  assert.equal(result, '<main><header>Title</header></main>');
});

test('shouldIgnoreRelativePath matches README ignore rules', () => {
  assert.equal(shouldIgnoreRelativePath('dist/index.html'), true);
  assert.equal(shouldIgnoreRelativePath('common/header.html'), true);
  assert.equal(shouldIgnoreRelativePath('setting.json'), true);
  assert.equal(shouldIgnoreRelativePath('sub/index.html'), false);
});

test('getSourceFiles collects project files recursively while keeping ignored paths out', () => {
  const rootDir = makeTempDir();
  fs.writeFileSync(path.join(rootDir, 'index.html'), 'top');
  fs.mkdirSync(path.join(rootDir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'sub', 'info.html'), 'nested');
  fs.mkdirSync(path.join(rootDir, 'common'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'common', 'header.html'), 'ignored');
  fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'dist', 'old.html'), 'ignored');

  const files = getSourceFiles(rootDir).map((file) => file.relativePath).sort();

  assert.deepEqual(files, ['index.html', 'sub/info.html']);
});

test('build writes text replacements recursively and copies binary files', () => {
  const rootDir = makeTempDir();

  fs.writeFileSync(path.join(rootDir, 'setting.json'), JSON.stringify({ TITLE: 'Hello' }));
  fs.writeFileSync(path.join(rootDir, 'index.html'), '<body>{{header.html}} {TITLE}</body>');
  fs.mkdirSync(path.join(rootDir, 'sub-page'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'sub-page', 'info.html'), '<section>{{nested/footer.html}}</section>');
  fs.mkdirSync(path.join(rootDir, 'common', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'common', 'header.html'), '<header>Site</header>');
  fs.writeFileSync(path.join(rootDir, 'common', 'nested', 'footer.html'), '<footer>{TITLE}</footer>');
  fs.mkdirSync(path.join(rootDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'assets', 'logo.png'), Buffer.from([0, 1, 2, 3]));

  const builtCount = build(rootDir);

  assert.equal(builtCount, 3);
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'index.html'), 'utf8'),
    '<body><header>Site</header> Hello</body>',
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'sub-page', 'info.html'), 'utf8'),
    '<section><footer>Hello</footer></section>',
  );
  assert.deepEqual(
    fs.readFileSync(path.join(rootDir, 'dist', 'assets', 'logo.png')),
    Buffer.from([0, 1, 2, 3]),
  );
});
