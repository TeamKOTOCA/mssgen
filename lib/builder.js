const fs = require('node:fs');
const path = require('node:path');
const DIST_DIR_NAME = 'dist';
const COMMON_DIR_NAME = 'common';
const SETTINGS_FILE_NAME = 'setting.json';
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

function createWatcher(rootDir) {
  const chokidar = require('chokidar');

  return chokidar.watch(rootDir, {
    ignored: (watchPath) => {
      const relativePath = path.relative(rootDir, watchPath);

      if (!relativePath || relativePath === '.') {
        return false;
      }

      return shouldIgnoreRelativePath(relativePath);
    },
    ignoreInitial: true,
  });
}

function dev(rootDir = process.cwd()) {
  const browserSync = require('browser-sync');
  const bs = browserSync.create();

  const rebuild = () => {
    build(rootDir);
    bs.reload();
  };

  build(rootDir);

  bs.init({
    server: path.join(rootDir, DIST_DIR_NAME),
    files: [path.join(rootDir, DIST_DIR_NAME, '**/*')],
    open: false,
    notify: false,
  });

  const watcher = createWatcher(rootDir);

  watcher.on('all', (eventName, filePath) => {
    info(`${eventName}: ${path.relative(rootDir, filePath)}`);
    rebuild();
  });

  info('watching for changes...');
  return { watcher, bs };
}

module.exports = {
  COMMON_DIR_NAME,
  DIST_DIR_NAME,
  SETTINGS_FILE_NAME,
  build,
  createWatcher,
  dev,
  getSourceFiles,
  injectParts,
  injectSettings,
  isTextFile,
  listFilesRecursively,
  loadParts,
  loadSettings,
  shouldIgnoreRelativePath,
};
