/**
 * WpClient.gs
 * WordPress REST APIとの通信を担当するクラス
 */

class WpClient {
  constructor() {
    this.baseUrl = CONFIG.WP_URL;
    const auth = CONFIG.getAuth();
    
    if (!auth) {
      throw new Error('WordPress認証情報が設定されていません。');
    }

    this.headers = {
      'Authorization': 'Basic ' + Utilities.base64Encode(auth.user + ':' + auth.token)
    };
  }

  /**
   * 画像をアップロードする
   * @param {Blob} blob - 画像データ
   * @param {string} filename - ファイル名
   * @param {string} altText - 代替テキスト
   * @returns {Object} メディアオブジェクト {id, source_url}
   */
  uploadMedia(blob, filename, altText) {
    const url = `${this.baseUrl}/wp-json/wp/v2/media`;
    
    // Content-Dispositionヘッダーの設定（ファイル名指定のため）
    const headers = {
      ...this.headers,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': blob.getContentType()
    };

    const options = {
      method: 'post',
      headers: headers,
      payload: blob.getBytes(),
      muteHttpExceptions: true
    };

    const response = this._fetchWithRetry(url, options);
    const media = JSON.parse(response.getContentText());

    if (altText) {
      this._updateMediaMeta(media.id, { alt_text: altText });
    }

    return {
      id: media.id,
      source_url: media.source_url || media.guid.rendered
    };
  }

  /**
   * 記事を作成/投稿する
   * @param {Object} postData - 投稿データ
   * @returns {Object} 投稿オブジェクト {id, link}
   */
  createPost(postData) {
    const url = `${this.baseUrl}/wp-json/wp/v2/posts`;
    
    const options = {
      method: 'post',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(postData),
      muteHttpExceptions: true
    };

    const response = this._fetchWithRetry(url, options);
    return JSON.parse(response.getContentText());
  }

  /**
   * アップロード後のメディア情報を更新（altテキストなど）
   */
  _updateMediaMeta(mediaId, meta) {
    const url = `${this.baseUrl}/wp-json/wp/v2/media/${mediaId}`;
    
    const options = {
      method: 'post',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(meta),
      muteHttpExceptions: true
    };

    // メタ更新失敗は致命的ではないのでログ出力のみでエラーにしない
    try {
      this._fetch(url, options);
    } catch (e) {
      Utils.error(`Media meta update failed for ID ${mediaId}`, e);
    }
  }

  /**
   * カテゴリ一覧を取得する
   * @returns {Array} カテゴリオブジェクトの配列
   */
  getCategories() {
    // 100件まで取得（ページネーションが必要なほど多い場合は別途対応が必要）
    const url = `${this.baseUrl}/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc`;
    const options = {
      method: 'get',
      headers: this.headers,
      muteHttpExceptions: true
    };
    
    const response = this._fetchWithRetry(url, options);
    return JSON.parse(response.getContentText());
  }

  /**
   * タグ一覧を取得する
   * @returns {Array} タグオブジェクトの配列
   */
  getTags() {
    // 100件まで取得
    const url = `${this.baseUrl}/wp-json/wp/v2/tags?per_page=100&orderby=count&order=desc`;
    const options = {
      method: 'get',
      headers: this.headers,
      muteHttpExceptions: true
    };
    
    const response = this._fetchWithRetry(url, options);
    return JSON.parse(response.getContentText());
  }

  /**
   * リトライ付きHTTPリクエスト
   */
  _fetchWithRetry(url, options) {
    let lastError;
    
    for (let i = 0; i < CONFIG.PROCESSING.MAX_RETRIES; i++) {
      try {
        return this._fetch(url, options);
      } catch (e) {
        lastError = e;
        Utils.log(`Request failed (Attempt ${i + 1}/${CONFIG.PROCESSING.MAX_RETRIES})`, e.message);
        Utilities.sleep(CONFIG.PROCESSING.RETRY_DELAY_MS);
      }
    }
    
    throw lastError;
  }

  /**
   * HTTPリクエスト実行＆エラー判定
   */
  _fetch(url, options) {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    
    if (code >= 400) {
      const content = response.getContentText();
      let errorMsg = `HTTP Error ${code}`;
      try {
        const json = JSON.parse(content);
        if (json.message) errorMsg += `: ${json.message}`;
        if (json.code) errorMsg += ` (${json.code})`;
      } catch (e) {
        // レスポンスがJSONでない場合はそのまま
        errorMsg += `: ${Utils.truncate(content, 100)}`;
      }
      throw new Error(errorMsg);
    }
    
    return response;
  }
}
