# Google Docs to WordPress 自動入稿システム 設計書 (v3.1)

## 1. 概要

Google Docsの記事をGASで解析し、WordPress REST API経由で投稿するシステム。

**設計方針:**
- WordPress Core準拠（`wp_insert_post`, `media_handle_upload`等の内部仕様に従う）
- GAS側で過度なエスケープをせず、WordPress側サニタイズに委任
- Gutenberg互換HTML出力

---

## 2. アーキテクチャ

```
[Google Docs] → [GAS] → [WordPress REST API] → [WordPress DB]
```

**処理フロー:**
1. ドキュメント取得・解析
2. 画像抽出 → プレースホルダー埋め込み
3. 画像アップロード（各画像ごとにPOST /wp/v2/media）
4. プレースホルダーを実URLで置換
5. 記事投稿（POST /wp/v2/posts）

---

## 3. 対応フォーマット

### MVP
| 要素 | 入力 | 出力 |
|------|------|------|
| 見出し1-3 | Docsの見出しスタイル | `<h2>`〜`<h4>` |
| 段落 | 標準テキスト | `<p>` |
| 太字/斜体 | Ctrl+B / Ctrl+I | `<strong>` / `<em>` |
| リンク | ハイパーリンク | `<a href>` |
| 画像 | 挿入画像 | `<figure><img></figure>` |

### Phase 2
| 要素 | 入力 | 出力 |
|------|------|------|
| リスト | 箇条書き/番号付き | `<ul>/<ol>` |
| 会話ブロック | 2列テーブル + [L]/[R] | カスタムdiv構造 |
| 引用 | インデント | `<blockquote>` |

---

## 4. モジュール構成

```
├── Config.gs       # 設定・定数
├── WpClient.gs     # WordPress API通信
├── DocParser.gs    # ドキュメント解析・HTML変換
├── App.gs          # メインコントローラー・UI
└── Utils.gs        # 共通ユーティリティ
```

---

## 5. API設計

### Config.gs

| 定数/関数 | 役割 |
|----------|------|
| `CONFIG.WP_URL` | WordPressサイトURL |
| `CONFIG.getAuth()` | PropertiesServiceから認証情報取得 |
| `CONFIG.POST_DEFAULTS` | 投稿デフォルト設定（status: draft等） |
| `CONFIG.CLASSES` | 会話ブロック用CSSクラス定義 |
| `CONFIG.PROCESSING` | 画像サイズ上限、リトライ設定等 |

---

### WpClient.gs

**class WpClient**

| メソッド | 役割 |
|---------|------|
| `constructor()` | baseUrl・認証ヘッダー初期化 |
| `uploadMedia(blob, filename, altText)` | 画像アップロード → `{id, source_url}` 返却 |
| `createPost(postData)` | 記事作成 → `{id, link}` 返却 |
| `getCategoryIdByName(name)` | カテゴリ名からID解決 |
| `_fetchWithRetry(url, options)` | リトライ付きHTTPリクエスト |
| `_fetch(url, options)` | HTTP実行、WP_Errorパース |
| `_updateMediaMeta(mediaId, meta)` | メディアメタデータ更新 |

**重要仕様:**
- 画像は`Content-Disposition`ヘッダーでファイル名指定
- URL取得は`guid.rendered`ではなく`source_url`を使用

---

### DocParser.gs

**class DocParser**

| プロパティ | 役割 |
|-----------|------|
| `images[]` | 抽出した画像Blob配列 |
| `imageIndex` | プレースホルダー用インデックス |

| メソッド | 役割 |
|---------|------|
| `parse(doc)` | メイン処理 → `{html, images}` 返却 |
| `_processElement(element)` | 要素種別に応じた処理振り分け |
| `_processParagraph(para)` | 段落→見出し/p変換 |
| `_processText(element)` | テキスト装飾処理（太字、斜体、リンク） |
| `_processTextElement(textEl)` | 文字単位でスタイル適用 |
| `_processImage(image)` | Blob抽出、プレースホルダー埋め込み |
| `_processTable(table)` | テーブル処理（会話ブロック判定含む） |
| `_isChatTable(table)` | 2列 + [L]/[R]で会話判定 |
| `_processChatTable(table)` | 会話ブロックHTML生成 |
| `_escapeHtml(text)` | HTMLエスケープ |
| `_getExtension(mimeType)` | MIMEタイプ→拡張子変換 |

**プレースホルダー形式:** `<!-- WP_IMAGE_PLACEHOLDER:{index} -->`

---

### App.gs

| 関数 | 役割 |
|------|------|
| `onOpen()` | メニュー追加（WordPress入稿） |
| `postAsDraft()` | 下書き投稿実行（UIエントリポイント） |
| `processDocument(doc)` | メイン処理オーケストレーション |
| `validateConfig()` | 設定確認 |
| `showSettings()` | 認証情報設定ダイアログ |

---

## 6. 制約事項

| 項目 | 制限 | 対策 |
|------|------|------|
| GAS実行時間 | 6分 | 画像50枚以下を想定 |
| UrlFetchサイズ | 50MB | 画像5MB/枚以下 |
| WPアップロード | サーバー依存 | 事前確認必要 |

---

## 7. エラーハンドリング

| コード | 原因 | 対応 |
|--------|------|------|
| `rest_cannot_create` | 認証失敗 | アプリパスワード再発行 |
| `rest_upload_file_too_big` | サイズ超過 | 画像圧縮 |
| `HTTP 401/403` | 認証/権限エラー | 設定確認 |

**リトライ:** 3回まで、1秒間隔

---

## 8. セキュリティ

- 認証情報は`PropertiesService.getScriptProperties()`で管理
- ソースコードへの直接記述禁止
- WordPressアプリケーションパスワードを使用

---

## 9. 開発ロードマップ

### Phase 1: MVP
- Config.gs, WpClient.gs, DocParser.gs, App.gs
- 基本要素（段落、見出し、太字、斜体、リンク、画像）
- エラーハンドリング基盤

### Phase 2: 拡張
- リスト対応
- 会話ブロック対応
- カテゴリ・タグ解決

### Phase 3: 安定化
- ドライラン機能
- 詳細ログ
- パフォーマンス最適化
