const fs = require('node:fs');
const path = require('node:path');

function warn(message) {
  console.warn(`[mssgen] ${message}`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadSettings(rootDir) {
  const settingsPath = path.join(rootDir, 'setting.json');

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

function loadParts(rootDir) {
  const partsDir = path.join(rootDir, 'src', 'common');

  if (!fs.existsSync(partsDir)) {
    return {};
  }

  return fs.readdirSync(partsDir, { withFileTypes: true }).reduce((parts, entry) => {
    if (!entry.isFile()) {
      return parts;
    }

    const ext = path.extname(entry.name);
    const key = path.basename(entry.name, ext);
    const filePath = path.join(partsDir, entry.name);

    parts[key] = fs.readFileSync(filePath, 'utf8');
    return parts;
  }, {});
}

function injectParts(content, parts) {
  return content.replace(/{{(.*?)}}/g, (_, name) => {
    const key = String(name).trim();

    if (!(key in parts)) {
      warn(`パーツ '${key}' が見つかりません。`);
      return '';
    }

    return parts[key];
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

function getSourceFiles(rootDir) {
  const srcDir = path.join(rootDir, 'src');

  if (!fs.existsSync(srcDir)) {
    warn('src ディレクトリが見つかりません。');
    return [];
  }

  return fs.readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      inputPath: path.join(srcDir, entry.name),
      outputPath: path.join(rootDir, 'dist', entry.name),
      name: entry.name,
    }));
}

function build(rootDir = process.cwd()) {
  const distDir = path.join(rootDir, 'dist');
  ensureDir(distDir);

  const settings = loadSettings(rootDir);
  const parts = loadParts(rootDir);
  const sourceFiles = getSourceFiles(rootDir);

  sourceFiles.forEach(({ inputPath, outputPath, name }) => {
    const source = fs.readFileSync(inputPath, 'utf8');
    const withParts = injectParts(source, parts);
    const result = injectSettings(withParts, settings);

    fs.writeFileSync(outputPath, result, 'utf8');
    console.log(`[mssgen] built: ${name}`);
  });

  return sourceFiles.length;
}

function dev(rootDir = process.cwd()) {
  const chokidar = require('chokidar');
  const browserSync = require('browser-sync');
  const bs = browserSync.create();

  const rebuild = () => {
    build(rootDir);
    bs.reload();
  };

  build(rootDir);

  bs.init({
    server: path.join(rootDir, 'dist'),
    files: [path.join(rootDir, 'dist', '*')],
    open: false,
    notify: false,
  });

  const watcher = chokidar.watch([
    path.join(rootDir, 'src'),
    path.join(rootDir, 'setting.json'),
  ], {
    ignoreInitial: true,
  });

  watcher.on('all', (eventName, filePath) => {
    console.log(`[mssgen] ${eventName}: ${path.relative(rootDir, filePath)}`);
    rebuild();
  });

  console.log('[mssgen] watching for changes...');
  return { watcher, bs };
}

module.exports = {
  build,
  dev,
  injectParts,
  injectSettings,
  loadParts,
  loadSettings,
};
