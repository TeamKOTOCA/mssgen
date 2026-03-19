# mssgen
Micro SSG Generator. 簡単な仕組みの静的サイトジェネレーターです。


1. プロジェクト概要
名称: mssgen (Minimal Static Site Generator)

目的: シンプルな {key} 置換と {{parts}} 埋め込み機能を備えた、超軽量な静的サイト生成ツール。

主要ターゲット: Cloudflare Pages + GitHub Actions で複数のランディングページやサブドメインサイトを効率よく管理したい開発者。

2. コア機能 (Core Features)
Variable Injection ({key}): setting.json に定義された値を HTML/JS/CSS 内の {KEY_NAME} と置換する。

Component Embedding ({{parts}}): src/common/*.html の中身を、メインファイルの {{filename}} 箇所に埋め込む。

Build Mode: src/ フォルダ内のファイルを一括処理し、dist/ フォルダに出力する。

Dev Mode (Live Reload): ファイルの変更を監視（Watch）し、自動ビルドとブラウザの即時リフレッシュを行う。

CLI Interface: npx mssgen（ビルド）および npx mssgen dev（開発モード）で動作する。

3. ディレクトリ構造 (Expected Structure)
Plaintext
. (Project Root)
├── src/                # ソースファイル (html, js, css)
│   ├── index.html      # {TITLE} や {{header}} を含む
│   └── common/         # 共通パーツ
│       ├── header.html
│       └── footer.html
├── dist/               # ビルド済みファイル (Auto-generated)
├── setting.json        # 置換用データ
└── package.json        # npm設定
4. 技術スタック (Tech Stack)
Runtime: Node.js

Dependencies:

browser-sync: ローカルサーバー & ライブリロード用

chokidar: 高性能ファイル監視用

Distribution: npm package (CLI tool)

5. 実装詳細ルール
置換順序: {{parts}}（パーツ埋め込み）を先に処理し、その後に {key}（文字列置換）を処理すること。これにより、共通パーツ内に書かれた変数も正しく置換される。

ファイル対象: src/ 直下のファイルのみを dist/ に出力し、common/ などのサブディレクトリは出力に含めない。

正規表現: * Parts: /{{(.*?)}}/g

Settings: /{(.*?)}/g (または setting.json のキーに基づく動的生成)

6. Codex への指示用プロンプト (Prompt for Implementation)
"mssgen" という名前の Node.js 製 CLI ツールを作成してください。

要件:

bin/cli.js を作成し、mssgen（ビルド実行）と mssgen dev（ブラウザ同期開発）のコマンドを使えるようにしてください。

lib/builder.js にコアロジックを実装してください。

process.cwd() を基準に src/ から読み込み、dist/ へ書き出します。

src/common/ 内のファイルを {{fileName}} の形式で読み込んで埋め込む機能。

setting.json 内のキーと値を {KEY} の形式で置換する機能。

dev モードでは browser-sync を使用し、src/ または setting.json が変更されたら再ビルドしてブラウザをリロードしてください。

package.json に bin フィールドを設定し、dependencies に browser-sync と chokidar を含めてください。

コードはシンプルで、エラーハンドリング（ファイルがない場合の警告など）を含めてください。