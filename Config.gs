/**
 * Config.gs
 * アプリケーション全体の設定と定数
 */

const CONFIG = {
  // WordPressサイトのURL (末尾のスラッシュなし)
  // 例: 'https://example.com'
  get WP_URL() {
    return PropertiesService.getScriptProperties().getProperty('WP_URL') || '';
  },

  // 認証情報の取得
  getAuth: function() {
    const user = PropertiesService.getScriptProperties().getProperty('WP_USER');
    const token = PropertiesService.getScriptProperties().getProperty('WP_APP_PASSWORD');
    
    if (!user || !token) {
      return null;
    }
    return { user, token };
  },

  // 投稿時のデフォルト設定
  POST_DEFAULTS: {
    status: 'draft',    // 下書きとして保存
    format: 'standard', // 標準フォーマット
    ping_status: 'closed', // ピンバック無効
    comment_status: 'open', // コメント許可
  },

  // 画像・処理設定
  PROCESSING: {
    MAX_IMAGE_WIDTH: 1200,      // 画像のリサイズ上限幅 (px)
    JPEG_QUALITY: 0.85,         // JPEG圧縮率
    MAX_RETRIES: 3,             // APIリトライ回数
    RETRY_DELAY_MS: 1000,       // リトライ待機時間 (ms)
    IMAGE_UPLOAD_LIMIT: 50,     // 1記事あたりの最大画像数
  },

  // HTML生成用CSSクラス定義 (Gutenberg互換 & フック用)
  CLASSES: {
    // 見出し
    H1: 'wp-block-heading',
    H2: 'wp-block-heading',
    H3: 'wp-block-heading',
    H4: 'wp-block-heading',
    H5: 'wp-block-heading',
    H6: 'wp-block-heading',

    // 段落 (空の場合はクラス属性なし)
    P: '', 

    // 画像 (キャプション付き、大型)
    IMAGE_FIGURE: 'wp-block-image size-large',
    
    // リスト (Phase 2用)
    UL: '',
    OL: '',
    
    // 引用 (Phase 2用)
    BLOCKQUOTE: 'wp-block-quote',
    
    // 会話ブロック (Phase 2用)
    CHAT_CONTAINER: 'chat-block',
    CHAT_ROW: 'chat-row',
    CHAT_ICON: 'chat-icon',
    CHAT_BUBBLE: 'chat-bubble',
  }
};
