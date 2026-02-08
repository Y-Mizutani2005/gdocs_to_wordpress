# Google Docs to WordPress 入稿ツール 仕様書

## 1. アプリケーション概要

### 1.1 目的
Google Docs で作成した記事を、ボタン一つで WordPress に下書きとして送信できる Google Apps Script (GAS) ベースのツールです。エンジニアでない方でも簡単に利用できるように設計されています。

### 1.2 対象ユーザー
- ブログ記事をGoogle Docsで執筆する方
- WordPressサイトを運営している方
- 技術的な知識がなくても記事入稿を効率化したい方

### 1.3 動作環境
- **クライアント**: Google Docs（ブラウザ版）
- **サーバー**: WordPress（REST API有効）
- **実行環境**: Google Apps Script

---

## 2. 機能一覧

### 2.1 主要機能

| 機能名 | 説明 |
|--------|------|
| **記事の自動変換** | Google Docs の書式（見出し、太字、リストなど）をWordPressのGutenbergブロック形式HTMLに変換 |
| **画像の自動アップロード** | ドキュメント内の画像を自動でWordPressにアップロードし、記事内に配置 |
| **メタデータ設定** | タイトル、スラッグ、投稿日時、抜粋、カテゴリ、タグ、アイキャッチ画像の設定 |
| **目次自動生成** | 記事の見出し（h2-h4）から目次を自動生成し、記事冒頭に挿入 |
| **カテゴリ・タグ選択** | WordPressに登録されているカテゴリ・タグをサイドバーから選択可能 |
| **会話ブロック変換** | 2列テーブルを会話吹き出し形式に変換 |

### 2.2 メニュー構成

```
WordPress入稿
├── 下書きとして投稿
├── ────────────────
├── カテゴリ・タグ設定
└── 設定
```

---

## 3. システムアーキテクチャ

### 3.1 処理フロー

```
[Google Docs] → [GAS] → [WordPress REST API] → [WordPress DB]
```

**詳細フロー:**
1. ドキュメント取得・解析（DocParser）
2. メタデータテーブルの解析
3. 本文のHTML変換
4. 画像抽出 → プレースホルダー埋め込み
5. 画像アップロード（各画像ごとにPOST /wp/v2/media）
6. プレースホルダーを実URLで置換
7. 目次生成・挿入
8. 記事投稿（POST /wp/v2/posts）

### 3.2 モジュール構成

| ファイル | 種類 | 役割 |
|----------|------|------|
| `App.gs` | スクリプト | メインコントローラー、UI制御、メニュー |
| `Config.gs` | スクリプト | 設定・定数管理 |
| `DocParser.gs` | スクリプト | ドキュメント解析・HTML変換ロジック |
| `WpClient.gs` | スクリプト | WordPress REST API通信 |
| `Utils.gs` | スクリプト | 共通ユーティリティ関数 |
| `Sidebar.html` | HTML | カテゴリ・タグ選択サイドバー画面 |

---

## 4. 対応フォーマット

### 4.1 テキスト書式

| Google Docs要素 | 変換後HTML | 備考 |
|-----------------|------------|------|
| 見出し1 | `<h2>` | WordPress標準に合わせてh2から開始 |
| 見出し2 | `<h3>` | - |
| 見出し3 | `<h4>` | - |
| 標準テキスト | `<p>` | - |
| 太字（Ctrl+B） | `<strong>` | - |
| 斜体（Ctrl+I） | `<em>` | - |
| ハイパーリンク | `<a href>` | - |
| 箇条書きリスト | `<ul><li>` | ネスト対応 |
| 番号付きリスト | `<ol><li>` | ネスト対応 |

### 4.2 画像

| 入力形式 | 変換後HTML | 備考 |
|----------|------------|------|
| インライン画像 | `<figure><img></figure>` | Gutenberg互換 |
| テキストの折り返し画像 | `<figure><img></figure>` | 同上 |

**対応画像形式:**
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

### 4.3 特殊要素

| 要素 | 入力方法 | 出力 |
|------|----------|------|
| 会話ブロック | 2列テーブル（左：アイコン、右：セリフ） | カスタムdiv構造 |
| 引用 | インデント | `<blockquote>` |

---

## 5. メタデータ設定

### 5.1 メタデータテーブル形式
ドキュメントの先頭（2行目推奨）に2列のテーブルを作成して設定。

| キー | 値の形式 | 説明 |
|------|----------|------|
| `Title` / `タイトル` | テキスト | 記事タイトル（空欄時はドキュメント名を使用） |
| `Slug` | 英数字とハイフン | URLスラッグ |
| `Date` | `YYYY-MM-DD HH:mm` | 公開予約日時 |
| `Excerpt` | テキスト | 抜粋文 |
| `Category` | カンマ区切り | カテゴリ名（複数可） |
| `Tag` | カンマ区切り | タグ名（複数可） |
| `Featured Image` | 画像を貼り付け | アイキャッチ画像 |

---

## 6. API仕様

### 6.1 WpClient クラス

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| `constructor()` | なし | - | baseUrl・認証ヘッダー初期化 |
| `uploadMedia(blob, filename, altText)` | Blob, string, string | `{id, source_url}` | 画像アップロード |
| `createPost(postData)` | Object | `{id, link}` | 記事作成 |
| `getCategories()` | なし | Array | カテゴリ一覧取得 |
| `getTags()` | なし | Array | タグ一覧取得 |

### 6.2 DocParser クラス

| メソッド | 引数 | 戻り値 | 説明 |
|----------|------|--------|------|
| `parse(doc)` | Document | `{html, images, metadata}` | ドキュメント解析 |
| `parseMetadata(body)` | Body | Object | メタデータテーブル解析 |

### 6.3 プレースホルダー形式
画像は一時的にプレースホルダーとして埋め込み、アップロード後に置換。

```
<!-- WP_IMAGE_PLACEHOLDER:{index} -->
```

---

## 7. 設定・定数

### 7.1 ユーザー設定（PropertiesService）

| プロパティキー | 説明 |
|----------------|------|
| `WP_URL` | WordPressサイトURL（末尾スラッシュなし） |
| `WP_USER` | WordPressユーザー名 |
| `WP_APP_PASSWORD` | アプリケーションパスワード |

### 7.2 処理設定（CONFIG.PROCESSING）

| 設定項目 | デフォルト値 | 説明 |
|----------|-------------|------|
| `MAX_IMAGE_WIDTH` | 1200px | 画像リサイズ上限幅 |
| `JPEG_QUALITY` | 0.85 | JPEG圧縮率 |
| `MAX_RETRIES` | 3 | APIリトライ回数 |
| `RETRY_DELAY_MS` | 1000ms | リトライ待機時間 |
| `IMAGE_UPLOAD_LIMIT` | 50 | 1記事あたりの最大画像数 |

### 7.3 投稿デフォルト設定（CONFIG.POST_DEFAULTS）

| 設定項目 | デフォルト値 |
|----------|-------------|
| `status` | `draft`（下書き） |
| `format` | `standard` |
| `ping_status` | `closed` |
| `comment_status` | `open` |

---

## 8. エラーハンドリング

### 8.1 想定エラーと対処

| エラーコード | 原因 | 対処方法 |
|--------------|------|----------|
| `rest_cannot_create` | 認証失敗 | アプリパスワード再発行 |
| `rest_upload_file_too_big` | ファイルサイズ超過 | 画像圧縮 |
| `HTTP 401` | 認証エラー | 認証情報確認 |
| `HTTP 403` | 権限エラー | ユーザー権限確認 |

### 8.2 ログ出力
- `Utils.log()`: 通常ログ（Logger.log）
- `Utils.error()`: エラーログ（console.error）

---

## 9. 制約事項・制限

| 項目 | 制限 | 備考 |
|------|------|------|
| GAS実行時間 | 最大6分 | 画像50枚以下を想定 |
| UrlFetchサイズ | 最大50MB | 画像5MB/枚以下を推奨 |
| WPアップロード | サーバー依存 | php.ini等の設定に依存 |
| カテゴリ・タグ取得 | 各100件まで | 多い場合はページネーション対応必要 |

---

## 10. セキュリティ

### 10.1 認証方式
- WordPress REST API の Basic認証
- アプリケーションパスワードを使用（通常のログインパスワードは使用しない）

### 10.2 データ保護
- 認証情報は `PropertiesService.getScriptProperties()` に保存
- HTMLエスケープは最低限行い、WordPress側のサニタイズに委任

---

## 11. 依存関係

### 11.1 Google Apps Script サービス
- `DocumentApp` - Google Docsの操作
- `UrlFetchApp` - HTTP通信
- `PropertiesService` - 設定保存
- `HtmlService` - サイドバーUI

### 11.2 外部API
- WordPress REST API v2
  - `/wp/v2/posts` - 記事操作
  - `/wp/v2/media` - メディア操作
  - `/wp/v2/categories` - カテゴリ取得
  - `/wp/v2/tags` - タグ取得

---

## 12. 将来の拡張予定

| Phase | 機能 |
|-------|------|
| Phase 2 | 引用ブロック完全対応 |
| Phase 2 | 会話ブロックの左右配置対応（[L]/[R]マーカー） |
| Phase 3 | 画像キャプション対応 |
| Phase 3 | 複数ドキュメント一括投稿 |

---

## 付録A: ファイル構成

```
gdocs_to_wordpress/
├── App.gs           # メインコントローラー (339行)
├── Config.gs        # 設定・定数 (66行)
├── DocParser.gs     # ドキュメント解析 (550行)
├── WpClient.gs      # WordPress通信 (180行)
├── Utils.gs         # ユーティリティ (75行)
├── Sidebar.html     # サイドバーUI
├── README.md        # 利用マニュアル
├── LICENSE
└── docs/
    ├── project.md       # 設計書
    ├── test_plan.md     # テスト計画
    └── specification.md # 本仕様書
```

---

## 付録B: 変更履歴

| バージョン | 日付 | 変更内容 |
|------------|------|----------|
| v1.0 | - | 初版リリース（MVP） |
| v3.1 | - | 会話ブロック、目次生成対応 |

---

*最終更新日: 2026年1月22日*
