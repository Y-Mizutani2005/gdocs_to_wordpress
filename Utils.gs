/**
 * Utils.gs
 * 共通ユーティリティ関数
 */

const Utils = {
  /**
   * ログ出力ラッパー
   * 将来的にSpreadsheetや外部ログサービスへの出力に切り替えやすくするため
   */
  log: function(message, data) {
    if (data) {
      Logger.log(`${message}: ${JSON.stringify(data)}`);
    } else {
      Logger.log(message);
    }
  },

  /**
   * エラーログ出力
   */
  error: function(message, error) {
    console.error(`${message}: ${error}`);
    if (error.stack) {
      console.error(error.stack);
    }
  },

  /**
   * HTMLエスケープ処理
   * WordPress側でサニタイズされるが、最低限のエスケープは行う
   */
  escapeHtml: function(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * MIMEタイプから拡張子を取得
   */
  getExtensionFromMime: function(mimeType) {
    const map = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp'
    };
    return map[mimeType] || 'jpg';
  },

  /**
   * サポートするMIMEタイプか確認
   */
  isSupportedMimeType: function(mimeType) {
    return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
  },

  /**
   * 文字列を特定の長さに切り詰める（ログ用など）
   */
  truncate: function(str, length) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substr(0, length) + '...';
  },
  
  /**
   * 現在時刻のフォーマット済み文字列取得
   */
  getTimestamp: function() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
  }
};
