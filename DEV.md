# mssgen 開発メモ

このファイルは、mssgen の初期構想・実装メモを退避したものです。
ユーザー向けの使い方は `README.md` を参照してください。

## 概要
- 名称: mssgen (Minimal Static Site Generator)
- コンセプト: 「設定ファイルひとつで、プロジェクト全体をテンプレート化する」超軽量ツール
- 特徴: 特定の `src/` フォルダを必要とせず、カレントディレクトリ全体を処理対象とする

## コア機能
- Variable Injection (`{KEY}`): `setting.json` の値を全テキストファイルの `{KEY}` に埋め込む
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
- 対象外: `dist/`, `node_modules/`, `.git/`, `common/`, `setting.json`, `package.json`, `package-lock.json`
- 置換順序: 常に `{{parts}}` → `{key}`
- バイナリ判定: 画像や圧縮ファイルなどは置換を通さずコピー
- エラー方針: `setting.json` の読み込み失敗や `common/` パーツ未検出は警告を出して継続

## CLI メモ
- `mssgen init`: `setting.json`, `common/`, `common/header.html`, `common/footer.html`, `index.html` のひな形を不足分だけ作成
- `mssgen`: 現在のプロジェクトを `dist/` にビルド
- `mssgen dev`: 監視付きの開発サーバーを起動
