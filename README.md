# mssgen
Micro SSG Generator. 簡単な仕組みの静的サイトジェネレーターです。

📝 mssgen 実装企画書 (v2: Recursive & Root-based)
1. プロジェクト概要
名称: mssgen (Minimal Static Site Generator)

コンセプト: 「設定ファイルひとつで、プロジェクト全体をテンプレート化する」超軽量ツール。

特徴: 特定の src フォルダを必要とせず、カレントディレクトリ全体を処理対象とする。

2. コア機能
Variable Injection ({key}): setting.json の値を、全テキストファイルの {KEY} 箇所に埋め込む。

Component Embedding ({{parts}}): common/ 内のファイルを {{filename}} で呼び出し、再帰的に展開する。

Recursive Build: サブディレクトリ構造を維持したまま dist/ へ出力。

Smart Copy: テキストファイルは置換処理を行い、画像などのバイナリファイルはそのままコピーする。

Dev Mode: ルート内の変更を監視し、ライブリロード。

3. ディレクトリ構造 (Example)
Plaintext
. (Project Root)
├── index.html        # 置換対象
├── sub-page/
│   └── info.html     # 再帰的に置換・出力対象
├── assets/
│   └── logo.png      # バイナリはそのままコピー
├── common/           # 共通パーツ（distには出力しない）
│   └── header.html
├── setting.json      # 置換データ
└── dist/             # 自動生成される出力先
4. 実装詳細ルール
対象外 (Ignore): dist/, node_modules/, .git/, common/, setting.json, package.json, package-lock.json は処理およびコピーの対象外とする。

バイナリ判定: 拡張子（.jpg, .png, .gif, .pdf, .zip 等）または is-binary-path 的なロジックで判定し、バイナリは置換を通さず fs.copyFileSync する。

置換順序: 常に {{parts}} → {key} の順。

5. Codex への指示用プロンプト
"mssgen" という名前の Node.js 製 CLI ツールを作成してください。

要件:

実行環境: bin/cli.js をエントリポイントとし、mssgen でビルド、mssgen dev で開発モードを起動。

再帰的ビルド (lib/builder.js):

process.cwd()（ルート）の全ファイルを再帰的に走査し、dist/ に構造を維持して出力。

除外: dist, node_modules, .git, common, setting.json, package.json は無視。

置換処理:

common/ 内のファイルを {{fileName}} で埋め込む。

setting.json の値を {KEY} 形式で置換する。

バイナリ対応: 画像等のバイナリファイルは置換処理をスキップし、そのままコピー。

開発モード: chokidar でルートを監視。変更があれば再ビルドし、軽量な内蔵HTTPサーバーとライブリロードでブラウザを更新。

エラーハンドリング: setting.json が読み込めない場合や、common/ パーツが見つからない場合は警告を出すが、処理は続行すること。

依存関係: chokidar, is-binary-path (または同等の判定ロジック) を使用。

## CLI
- `mssgen init`: `setting.json`, `common/`, `common/header.html`, `common/footer.html`, `index.html` のひな形を不足分だけ作成します。
- `mssgen`: 現在のプロジェクトを `dist/` にビルドします。
- `mssgen dev`: 監視付きの開発サーバーを起動します。
