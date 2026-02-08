# gdocs_to_wordpress 対応 WordPressテーマ開発ガイド

## 概要

`gdocs_to_wordpress` が生成するHTMLに対応したWordPressテーマ開発のためのガイドです。

---

## 1. 必須CSSクラス一覧

### 1.1 見出し（Headings）

| 要素 | クラス名 | ID形式 |
|------|---------|--------|
| `<h2>` | `wp-block-heading` | `id="toc-heading-N"` |
| `<h3>` | `wp-block-heading` | `id="toc-heading-N"` |
| `<h4>` | `wp-block-heading` | `id="toc-heading-N"` |

```html
<h2 id="toc-heading-1" class="wp-block-heading">見出しテキスト</h2>
```

---

### 1.2 目次（Table of Contents）

```html
<div class="toc-container">
  <p class="toc-title">目次</p>
  <ul>
    <li class="toc-level-2"><a href="#toc-heading-1">見出し</a></li>
    <li class="toc-level-3"><a href="#toc-heading-2">小見出し</a></li>
    <li class="toc-level-4"><a href="#toc-heading-3">詳細見出し</a></li>
  </ul>
</div>
```

| クラス名 | 説明 |
|---------|------|
| `.toc-container` | 目次全体のラッパー |
| `.toc-title` | 目次タイトル |
| `.toc-level-2/3/4` | 見出しレベル別項目 |

---

### 1.3 会話吹き出しブロック（Chat Bubbles）

2列テーブルが会話形式に変換されます。セリフ（右側セル）の先頭に `[L]` または `[R]` マーカーを含めることで配置を制御できます。

#### 左配置（デフォルト または `[L]`）
```html
<div class="chat-block">
  <div class="chat-row chat-left">
    <div class="chat-icon"><img src="..." /></div>
    <div class="chat-bubble"><p>こんにちは！</p></div>
  </div>
</div>
```

#### 右配置（`[R]` マーカー使用時）
```html
<div class="chat-block">
  <div class="chat-row chat-right">
    <div class="chat-icon"><img src="..." /></div>
    <div class="chat-bubble"><p>はい、こんにちは！</p></div>
  </div>
</div>
```

| クラス名 | 説明 |
|---------|------|
| `.chat-block` | 会話ブロック全体 |
| `.chat-row` | 1つの会話行（左配置） |
| `.chat-row.chat-right` | 右配置の会話行 |
| `.chat-icon` | アイコンエリア |
| `.chat-bubble` | 吹き出しエリア |
| `.chat-icon-img` | アイコン画像（`<img>`タグに付与） |

---

### 1.4 画像（Images）

```html
<figure class="wp-block-image size-large">
  <img src="https://..." alt="..." class="wp-image-123" />
</figure>
```

---

### 1.5 引用ブロック（Blockquote）

インデントされたテキストが引用ブロックに変換されます。

```html
<blockquote class="wp-block-quote">
  <p>引用テキストがここに入ります。</p>
</blockquote>
```

| クラス名 | 説明 |
|---------|------|
| `.wp-block-quote` | 引用ブロック（Gutenberg標準） |

---

### 1.6 標準テーブル（Tables）

3列以上のテーブルなどは、Gutenberg標準のテーブルブロックとして出力されます。

```html
<figure class="wp-block-table">
  <table class="">
    <tr>
      <td>セル内容</td>
      <td>セル内容</td>
    </tr>
  </table>
</figure>
```

| クラス名 | 説明 |
|---------|------|
| `.wp-block-table` | テーブルブロック（Gutenberg標準） |

---

### 1.7 その他の要素

| 要素 | HTML |
|------|------|
| 段落 | `<p>テキスト</p>` |
| 太字 | `<strong>テキスト</strong>` |
| 斜体 | `<em>テキスト</em>` |
| リンク | `<a href="..." target="_blank" rel="noopener">テキスト</a>` |
| 下線 | `<span style="text-decoration: underline;">テキスト</span>` |
| 取消線 | `<del>テキスト</del>` |
| 箇条書き | `<ul><li>...</li></ul>` |
| 番号リスト | `<ol><li>...</li></ol>` |
| 引用 | `<blockquote class="wp-block-quote">...</blockquote>` |

---

## 2. 推奨CSS

```css
/* === 基本設定 === */
:root {
    --primary-color: #0066cc;
    --bg-light: #f8f9fa;
    --text-color: #333;
}

html { scroll-behavior: smooth; }
[id^="toc-heading-"] { scroll-margin-top: 80px; }

/* === 見出し === */
.wp-block-heading {
    margin: 2rem 0 1rem;
    font-weight: 700;
}
h2.wp-block-heading {
    font-size: 1.75rem;
    border-bottom: 3px solid var(--primary-color);
    padding-bottom: 0.5rem;
}
h3.wp-block-heading { font-size: 1.5rem; }
h4.wp-block-heading { font-size: 1.25rem; }

/* === 目次 === */
.toc-container {
    background: var(--bg-light);
    border-radius: 12px;
    padding: 1.5rem 2rem;
    margin: 2rem 0;
    border-left: 4px solid var(--primary-color);
}
.toc-title {
    font-weight: 700;
    font-size: 1.1rem;
    margin: 0 0 1rem;
}
.toc-container ul { list-style: none; padding: 0; margin: 0; }
.toc-container li { margin: 0.4rem 0; }
.toc-container li a {
    text-decoration: none;
    color: var(--text-color);
    transition: color 0.2s;
}
.toc-container li a:hover { color: var(--primary-color); }
.toc-level-2 { padding-left: 0; }
.toc-level-3 { padding-left: 1.5rem; }
.toc-level-4 { padding-left: 3rem; }

/* === 会話ブロック === */
.chat-block { margin: 2rem 0; }
.chat-row {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.5rem;
}
.chat-icon {
    flex-shrink: 0;
    width: 60px;
    height: 60px;
}
.chat-icon img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
}
.chat-bubble {
    background: #f1f3f5;
    border-radius: 18px;
    padding: 1rem 1.25rem;
    max-width: calc(100% - 80px);
    position: relative;
}
.chat-bubble::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 15px;
    border: 8px solid transparent;
    border-right-color: #f1f3f5;
    border-left: 0;
}
.chat-bubble p { margin: 0; line-height: 1.7; }

/* 右配置 */
.chat-row.chat-right { flex-direction: row-reverse; }
.chat-row.chat-right .chat-bubble {
    background: var(--primary-color);
    color: white;
}
.chat-row.chat-right .chat-bubble::before {
    left: auto;
    right: -8px;
    border-left-color: var(--primary-color);
    border-right: 0;
}

/* === 画像 === */
.wp-block-image { margin: 2rem 0; }
.wp-block-image img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
}

/* === 引用ブロック === */
.wp-block-quote {
    margin: 2rem 0;
    padding: 1.25rem 1.5rem;
    border-left: 4px solid var(--primary-color);
    background: var(--bg-light);
    border-radius: 0 8px 8px 0;
    font-style: italic;
    color: #555;
}
.wp-block-quote p {
    margin: 0;
    line-height: 1.8;
}
.wp-block-quote cite {
    display: block;
    margin-top: 0.75rem;
    font-size: 0.9rem;
    color: #777;
    font-style: normal;
}

/* === テーブル === */
.wp-block-table { margin: 2rem 0; overflow-x: auto; }
.wp-block-table table {
    width: 100%;
    border-collapse: collapse;
}
.wp-block-table td {
    border: 1px solid #ddd;
    padding: 0.75rem;
}

/* === レスポンシブ === */
@media (max-width: 767px) {
    .toc-container { padding: 1rem; }
    .toc-level-3 { padding-left: 1rem; }
    .toc-level-4 { padding-left: 2rem; }
    .chat-icon { width: 48px; height: 48px; }
}
```

---

## 3. チェックリスト

### 必須
- [ ] `.toc-container`, `.toc-title`, `.toc-level-*`
- [ ] `.chat-block`, `.chat-row`, `.chat-right`, `.chat-icon`, `.chat-bubble`
- [ ] `.wp-block-heading` + アンカーリンク対応
- [ ] `.wp-block-image.size-large`
- [ ] `.wp-block-quote`（引用ブロック）

### 推奨
- [ ] レスポンシブ対応
- [ ] スムーススクロール
- [ ] ダークモード対応

---

*最終更新: 2026年2月9日*
