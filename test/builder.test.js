const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFhUVFRUVFRUVFRUVFRUVFRUXFhUVFRUYHSggGBolHRUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lICUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQID/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB6AAAAP/EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEAAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8Af//Z';

globalThis.__MSSGEN_TEST_SHARP__ = (inputPath) => ({
  webp() {
    return {
      async toFile(outputPath) {
        const source = fs.readFileSync(inputPath);
        fs.writeFileSync(outputPath, Buffer.concat([Buffer.from('WEBP'), source]));
      },
    };
  },
});

const {
  build,
  getSourceFiles,
  getWebpRelativePath,
  init,
  injectBuiltByComment,
  injectParts,
  rewriteAssetReferences,
  shouldConvertImageToWebp,
  shouldIgnoreRelativePath,
  splitResourceSuffix,
} = require('../lib/builder');

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

test('shouldIgnoreRelativePath skips only global watch/build exclusions', () => {
  assert.equal(shouldIgnoreRelativePath('dist/index.html'), true);
  assert.equal(shouldIgnoreRelativePath('.mssgen-cache/assets.json'), true);
  assert.equal(shouldIgnoreRelativePath('common/header.html'), false);
  assert.equal(shouldIgnoreRelativePath('setting.json'), false);
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

test('injectBuiltByComment adds the marker once to html output', () => {
  assert.equal(
    injectBuiltByComment('<html><body>Hello</body></html>'),
    `<html><body>Hello<!-- built by mssgen -->\n</body></html>`,
  );
  assert.equal(
    injectBuiltByComment(`<html><body>Hello<!-- built by mssgen -->\n</body></html>`),
    `<html><body>Hello<!-- built by mssgen -->\n</body></html>`,
  );
});

test('splitResourceSuffix separates query strings and hashes', () => {
  assert.deepEqual(splitResourceSuffix('images/hero.png?v=1#top'), {
    pathname: 'images/hero.png',
    suffix: '?v=1#top',
  });
  assert.deepEqual(splitResourceSuffix('images/hero.png'), {
    pathname: 'images/hero.png',
    suffix: '',
  });
});

test('rewriteAssetReferences updates local image links to webp', () => {
  const content = [
    '<img src="./images/photo.png?ver=1">',
    '<script>const poster = "./images/cover.jpg#hero";</script>',
    '<style>.hero{background:url("/images/photo.png")}</style>',
  ].join('\n');
  const convertedAssetMap = new Map([
    ['images/photo.png', 'images/photo.webp'],
    ['images/cover.jpg', 'images/cover.webp'],
  ]);

  const result = rewriteAssetReferences(content, 'index.html', convertedAssetMap);

  assert.match(result, /images\/photo\.webp\?ver=1/);
  assert.match(result, /images\/cover\.webp#hero/);
  assert.match(result, /\/images\/photo\.webp/);
});

test('build converts png and jpg assets to webp and rewrites html/css/js references', async () => {
  const rootDir = makeTempDir();

  fs.writeFileSync(path.join(rootDir, 'setting.json'), JSON.stringify({ TITLE: 'Hello' }));
  fs.writeFileSync(
    path.join(rootDir, 'index.html'),
    '<body>{{header.html}} <img src="./assets/logo.png?cache=1"><script src="./assets/app.js"></script></body>',
  );
  fs.mkdirSync(path.join(rootDir, 'sub-page'), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'sub-page', 'info.html'),
    '<section>{{nested/footer.html}}<img src="../assets/photo.jpg#hero"></section>',
  );
  fs.mkdirSync(path.join(rootDir, 'common', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'common', 'header.html'), '<header>Site</header>');
  fs.writeFileSync(path.join(rootDir, 'common', 'nested', 'footer.html'), '<footer>{TITLE}</footer>');
  fs.mkdirSync(path.join(rootDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'assets', 'logo.png'), Buffer.from(PNG_BASE64, 'base64'));
  fs.writeFileSync(path.join(rootDir, 'assets', 'photo.jpg'), Buffer.from(JPEG_BASE64, 'base64'));
  fs.writeFileSync(
    path.join(rootDir, 'assets', 'app.js'),
    'const hero = "./photo.jpg"; document.body.style.backgroundImage = "url(../assets/logo.png)";',
  );
  fs.writeFileSync(
    path.join(rootDir, 'assets', 'site.css'),
    '.hero { background-image: url("./photo.jpg?size=sm"); }',
  );

  const builtCount = await build(rootDir);

  assert.equal(builtCount, 6);
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'index.html'), 'utf8'),
    '<body><header>Site</header> <img src="assets/logo.webp?cache=1"><script src="./assets/app.js"></script><!-- built by mssgen -->\n</body>',
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'sub-page', 'info.html'), 'utf8'),
    '<section><footer>Hello</footer><img src="../assets/photo.webp#hero"></section>\n<!-- built by mssgen -->',
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'assets', 'app.js'), 'utf8'),
    'const hero = "photo.webp"; document.body.style.backgroundImage = "url(logo.webp)";',
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'assets', 'site.css'), 'utf8'),
    '.hero { background-image: url("photo.webp?size=sm"); }',
  );
  assert.equal(fs.existsSync(path.join(rootDir, 'dist', 'assets', 'logo.png')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'dist', 'assets', 'photo.jpg')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'dist', 'assets', 'logo.webp')), true);
  assert.equal(fs.existsSync(path.join(rootDir, 'dist', 'assets', 'photo.webp')), true);
  assert.ok(fs.statSync(path.join(rootDir, 'dist', 'assets', 'logo.webp')).size > 0);
  assert.ok(fs.statSync(path.join(rootDir, 'dist', 'assets', 'photo.webp')).size > 0);
  assert.equal(shouldConvertImageToWebp('assets/logo.png'), true);
  assert.equal(shouldConvertImageToWebp('assets/photo.jpg'), true);
  assert.equal(getWebpRelativePath('assets/photo.jpg'), 'assets/photo.webp');
});

test('build keeps the previous dist contents available until the next build is ready', async () => {
  const rootDir = makeTempDir();
  const originalSharp = globalThis.__MSSGEN_TEST_SHARP__;

  fs.writeFileSync(path.join(rootDir, 'index.html'), '<body>next</body>');
  fs.mkdirSync(path.join(rootDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'assets', 'logo.png'), Buffer.from(PNG_BASE64, 'base64'));
  fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'dist', 'index.html'), 'previous build');

  let releaseBuild;
  globalThis.__MSSGEN_TEST_SHARP__ = (inputPath) => ({
    webp() {
      return {
        async toFile(outputPath) {
          await new Promise((resolve) => {
            releaseBuild = resolve;
          });
          const source = fs.readFileSync(inputPath);
          fs.writeFileSync(outputPath, Buffer.concat([Buffer.from('WEBP'), source]));
        },
      };
    },
  });

  const buildPromise = build(rootDir);
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(fs.readFileSync(path.join(rootDir, 'dist', 'index.html'), 'utf8'), 'previous build');

  releaseBuild();
  await buildPromise;

  globalThis.__MSSGEN_TEST_SHARP__ = originalSharp;

  assert.match(fs.readFileSync(path.join(rootDir, 'dist', 'index.html'), 'utf8'), /next/);
});

test('build reuses cached webp output when the source image is unchanged', async () => {
  const rootDir = makeTempDir();
  const originalSharp = globalThis.__MSSGEN_TEST_SHARP__;
  let convertCount = 0;

  globalThis.__MSSGEN_TEST_SHARP__ = (inputPath) => ({
    webp() {
      return {
        async toFile(outputPath) {
          convertCount += 1;
          const source = fs.readFileSync(inputPath);
          fs.writeFileSync(outputPath, Buffer.concat([Buffer.from('WEBP'), source]));
        },
      };
    },
  });

  fs.writeFileSync(path.join(rootDir, 'index.html'), '<body><img src="./assets/logo.png"></body>');
  fs.mkdirSync(path.join(rootDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'assets', 'logo.png'), Buffer.from(PNG_BASE64, 'base64'));

  await build(rootDir);
  await build(rootDir);

  globalThis.__MSSGEN_TEST_SHARP__ = originalSharp;

  assert.equal(convertCount, 1);
  assert.equal(fs.existsSync(path.join(rootDir, '.mssgen-cache', 'assets.json')), true);
  assert.equal(fs.existsSync(path.join(rootDir, '.mssgen-cache', 'outputs', 'assets', 'logo.webp')), true);
});

test('init creates the required project scaffold without overwriting existing files', () => {
  const rootDir = makeTempDir();
  fs.writeFileSync(path.join(rootDir, 'index.html'), 'custom');

  const createdPaths = init(rootDir).sort();

  assert.deepEqual(createdPaths, [
    'common/footer.html',
    'common/header.html',
    'setting.json',
  ]);
  assert.equal(fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8'), 'custom');
  assert.match(fs.readFileSync(path.join(rootDir, 'setting.json'), 'utf8'), /SITE_NAME/);
  assert.equal(fs.existsSync(path.join(rootDir, 'common', 'header.html')), true);
  assert.equal(fs.existsSync(path.join(rootDir, 'common', 'footer.html')), true);
});
