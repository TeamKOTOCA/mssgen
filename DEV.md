# mssgen 開発メモ

このファイルは、mssgen の初期構想・実装メモを退避したものです。
ユーザー向けの使い方は `README.md` を参照してください。

## 概要
- 名称: mssgen (Minimal Static Site Generator)
- コンセプト: 「設定ファイルひとつで、プロジェクト全体をテンプレート化する」超軽量ツール
- 特徴: 特定の `src/` フォルダを必要とせず、カレントディレクトリ全体を処理対象とする

## コア機能
- Variable Injection (`{KEY}`): `setting.json` の `variables` 値を全テキストファイルの `{KEY}` に埋め込む
- WebP除外設定 (`build.webpExclude`): `setting.json` の `build.webpExclude` 配列で指定した `**/assets/` 配下の画像は WebP 変換対象から除外
- Component Embedding (`{{parts}}`): `common/` 内のファイルを `{{filename}}` で呼び出し、再帰的に展開する
- Recursive Build: サブディレクトリ構造を維持したまま `dist/` へ出力する
- Smart Copy: テキストファイルは置換処理を行い、画像などのバイナリファイルはそのままコピーする
- Dev Mode: ルート内の変更を監視し、ライブリロードつきの開発サーバーを起動する

## 例となるディレクトリ構造
```text
. (Project Root)
├── index.html
├── sub-page/
│   └── info.html
├── assets/
│   └── logo.png
├── common/
│   └── header.html
├── setting.json
└── dist/
```

## 実装ルールメモ
- ビルド対象外: `dist/`, `node_modules/`, `.git/`, `common/`, `setting.json`, `package.json`, `package-lock.json`
- 監視対象外: `dist/`, `node_modules/`, `.git/`, `package.json`, `package-lock.json`（`common/`, `setting.json` はライブリロード対象）
- 置換順序: 常に `{{parts}}` → `{key}` → 画像参照の `.webp` 置換
- 画像変換: `**/assets/` 配下の `png`, `jpg`, `jpeg` はビルド時に `sharp` で `webp` へ変換し、HTML/CSS/JS 内のローカル参照も対象が `**/assets/` 配下の場合だけ追従させる（`setting.json` の `build.webpExclude` 指定分は除外）
- ビルドルート: `setting.json` の `build.rootDir`（別名 `build.sourceDir`）でサブディレクトリを指定した場合、`common/`, `assets/`, `webpExclude` などのルート相対処理は指定ディレクトリ起点で扱う
- 除外フォルダー: `setting.json` の `build.excludeDirs` でビルドルート相対のフォルダーを指定し、配下をビルド・監視対象から除外する
- CLI ヘルプ: `help`, `--help`, `<command> --help`, 未知のコマンドでヘルプを表示する
- バイナリ判定: 画像や圧縮ファイルなどは置換を通さずコピー
- エラー方針: `setting.json` の読み込み失敗や `common/` パーツ未検出は警告を出して継続

## CLI メモ
- `mssgen init`: `setting.json`, `common/`, `common/header.html`, `common/footer.html`, `index.html` のひな形を不足分だけ作成
- `mssgen`: 現在のプロジェクトを `dist/` にビルド
- `mssgen dev`: 監視付きの開発サーバーを起動
