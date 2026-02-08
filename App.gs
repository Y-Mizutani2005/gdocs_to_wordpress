/**
 * App.gs
 * アプリケーションのメインコントローラー
 */

/**
 * ドキュメントを開いたときに実行される関数
 * メニューを追加する
 */
function onOpen() {
  const ui = DocumentApp.getUi();
  ui.createMenu('WordPress入稿')
    .addItem('下書きとして投稿', 'postAsDraft')
    .addSeparator()
    .addItem('カテゴリ・タグ設定', 'showCategorySelector')
    .addItem('設定', 'showSettings')
    .addToUi();
}

/**
 * カテゴリ・タグ選択サイドバーを表示
 */
function showCategorySelector() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('カテゴリ・タグ設定')
    .setWidth(300);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * サイドバーから呼ばれる：WPのカテゴリ・タグを取得
 */
function getTaxonomies() {
  try {
    const client = new WpClient();
    const categories = client.getCategories();
    const tags = client.getTags();
    
    return {
      categories: categories.map(c => ({ id: c.id, name: c.name })),
      tags: tags.map(t => ({ id: t.id, name: t.name }))
    };
  } catch (e) {
    Utils.error('Failed to get taxonomies', e);
    throw e;
  }
}

/**
 * サイドバーから呼ばれる：選択されたカテゴリ・タグをメタデータテーブルに保存
 */
function saveTaxonomiesToMetadata(categories, tags) {
  try {
    const doc = DocumentApp.getActiveDocument();
    const body = doc.getBody();
    
    // メタデータテーブルを探す（なければ作成）
    let table = null;
    let tableIndex = 0;
    
    // 先頭付近を探索
    for (let i = 0; i < Math.min(body.getNumChildren(), 5); i++) {
        const el = body.getChild(i);
        if (el.getType() === DocumentApp.ElementType.TABLE) {
            const t = el.asTable();
            // メタデータテーブルか判定（ヘッダーがあるか、既存のキーがあるか）
            if (t.getNumRows() > 0 && t.getRow(0).getCell(0).getText().match(/key|title|名前/i)) {
                table = t;
                tableIndex = i;
                break;
            }
        }
    }
    
    // なければ先頭に作成
    if (!table) {
        table = body.insertTable(0);
        const header = table.appendTableRow();
        header.appendTableCell('Key');
        header.appendTableCell('Value');
    }
    
    // カテゴリ行、タグ行を探して更新、なければ追加
    _updateMetadataRow(table, 'Category', categories.join(', '));
    _updateMetadataRow(table, 'Tag', tags.join(', '));
    
  } catch (e) {
    Utils.error('Failed to save taxonomies', e);
    throw e;
  }
}

/**
 * メタデータ行を更新または追加するヘルパー
 */
function _updateMetadataRow(table, key, value) {
    const rows = table.getNumRows();
    let found = false;
    const numCells = table.getRow(0).getNumCells();
    
    for (let i = 0; i < rows; i++) {
        const row = table.getRow(i);
        if (row.getNumCells() < 2) continue;
        const currentKey = row.getCell(0).getText().trim();
        
        if (currentKey.toLowerCase() === key.toLowerCase()) {
            row.getCell(1).setText(value);
            found = true;
            break;
        }
    }
    
    if (!found) {
        const row = table.appendTableRow();
        row.appendTableCell(key);
        row.appendTableCell(value);
        // テーブルの列数に合わせて空セルを追加
        for (let j = 2; j < numCells; j++) {
            row.appendTableCell('');
        }
    }
}

/**
 * 設定画面を表示（今回は簡易的にプロンプトで実装）
 * 本格的にはHTMLダイアログが望ましいが、MVPとしてプロパティ設定をサポート
 */
function showSettings() {
  const ui = DocumentApp.getUi();
  const scriptProps = PropertiesService.getScriptProperties();
  
  const currentUrl = scriptProps.getProperty('WP_URL') || '';
  const currentUser = scriptProps.getProperty('WP_USER') || '';
  
  // URL入力
  const urlRes = ui.prompt('WordPress設定', `サイトURLを入力してください (現在: ${currentUrl})`, ui.ButtonSet.OK_CANCEL);
  if (urlRes.getSelectedButton() == ui.Button.OK) {
    const newUrl = urlRes.getResponseText().replace(/\/$/, ''); // 末尾スラッシュ削除
    scriptProps.setProperty('WP_URL', newUrl);
  } else {
    return;
  }

  // ユーザー名入力
  const userRes = ui.prompt('WordPress設定', `ユーザー名を入力してください (現在: ${currentUser})`, ui.ButtonSet.OK_CANCEL);
  if (userRes.getSelectedButton() == ui.Button.OK) {
    scriptProps.setProperty('WP_USER', userRes.getResponseText());
  } else {
    return;
  }
  
  // アプリパスワード入力
  const passRes = ui.prompt('WordPress設定', 'アプリケーションパスワードを入力してください (変更しない場合は空欄)', ui.ButtonSet.OK_CANCEL);
  if (passRes.getSelectedButton() == ui.Button.OK) {
    const newPass = passRes.getResponseText();
    if (newPass) {
      scriptProps.setProperty('WP_APP_PASSWORD', newPass);
    }
  }
  
  ui.alert('設定を保存しました。');
}

/**
 * ドキュメントを解析して下書き投稿するメイン処理
 */
function postAsDraft() {
  const ui = DocumentApp.getUi();
  
  try {
    const doc = DocumentApp.getActiveDocument();
    if (!doc) throw new Error('ドキュメントが開かれていません。');

    // 設定確認
    if (!CONFIG.getAuth() || !CONFIG.WP_URL) {
      ui.alert('設定エラー', 'WordPressの設定が完了していません。「WordPress入稿」>「設定」から設定を行ってください。', ui.ButtonSet.OK);
      return;
    }

    // 処理開始確認（ユーザー体験向上）
    const confirm = ui.alert('投稿確認', '現在のドキュメントをWordPressに下書き投稿しますか？\n（画像が多い場合、数分かかることがあります）', ui.ButtonSet.YES_NO);
    if (confirm != ui.Button.YES) return;

    // トースト通知
    doc.saveAndClose(); // 一旦保存推奨（内容確定のため。ただしGAS実行中は閉じないので、flush的な意味合い）
    // NOTE: saveAndCloseするとスクリプトが止まる場合があるため、DocumentApp.getActiveDocument()で取得したdocを使う限りは不要かもだが念のため。
    // 今回はスクリプト実行継続のためsaveAndCloseは呼ばず進める。

    Utils.log('Process started');
    
    // 1. 解析
    const parser = new DocParser();
    const result = parser.parse(doc);
    Utils.log('Parsed document', { imageCount: result.images.length });

    const client = new WpClient(); // インスタンス化を早める

    // 2. メタデータ処理（アイキャッチ画像があればアップロード）
    let featuredMediaId = 0;
    const metadata = result.metadata;
    
    if (metadata.featuredImage) {
       ui.alert('進捗', 'アイキャッチ画像をアップロードしています...', ui.ButtonSet.OK);
       try {
         const fi = metadata.featuredImage;
         const media = client.uploadMedia(fi.blob, fi.blob.getName(), fi.alt);
         
         // レスポンスの確認とIDの確保
         if (media && media.id) {
           featuredMediaId = parseInt(media.id, 10);
           Utils.log(`Uploaded featured image. ID: ${featuredMediaId}`, media);
         } else {
           Utils.error('Featured image uploaded but ID missing', media);
         }
       } catch (e) {
         Utils.error('Featured image upload failed', e);
         // アイキャッチ失敗しても投稿は継続
       }
    }

    // 3. 画像アップロード & プレースホルダー置換
    let finalHtml = result.html;
    // const client = new WpClient(); // 上で定義済みなので削除

    const totalImages = result.images.length;
    if (totalImages > 0) {
      ui.alert('進捗', `本文画像 ${totalImages}枚のアップロードを開始します...`, ui.ButtonSet.OK);
    }

    // 画像処理
    for (const image of result.images) {
      try {
        // アップロード
        const media = client.uploadMedia(image.blob, image.blob.getName(), image.alt);
        Utils.log(`Uploaded image: ${image.index}`, media);

        // HTML置換
        let imageHtml = '';
        
        // チャットアイコンの場合はシンプルなimgタグ
        if (image.context === 'chat-icon') {
           const iconClass = CONFIG.CLASSES.CHAT_ICON_IMG || 'chat-icon-img';
           imageHtml = `<img src="${media.source_url}" alt="${Utils.escapeHtml(image.alt)}" class="${iconClass} wp-image-${media.id}"/>`;
        } else {
           // 通常画像はGutenberg画像ブロックの形式
           // <figure class="wp-block-image size-large"><img src="..." alt="..." class="wp-image-{id}"/></figure>
           imageHtml = `
<figure class="${CONFIG.CLASSES.IMAGE_FIGURE}">
  <img src="${media.source_url}" alt="${Utils.escapeHtml(image.alt)}" class="wp-image-${media.id}"/>
</figure>`;
        }
        
        // 正規表現で置換 (プレースホルダーの後の改行/空白も許容して除去)
        const regex = new RegExp(`<!-- WP_IMAGE_PLACEHOLDER:${image.index} -->\\s*`, 'g');
        finalHtml = finalHtml.replace(regex, imageHtml);
        
        // APIレート制限回避のためのウェイト
        Utilities.sleep(500);
        
      } catch (e) {
        Utils.error(`Image upload failed for index ${image.index}`, e);
        // 失敗した場合はエラー表示のプレースホルダーを残すか、代替テキストにする
        // 失敗時も正規表現で置換
        const errorRegex = new RegExp(`<!-- WP_IMAGE_PLACEHOLDER:${image.index} -->\\s*`, 'g');
        finalHtml = finalHtml.replace(
          errorRegex,  
          `<p style="color:red; font-weight:bold;">[画像アップロード失敗: ${Utils.escapeHtml(image.alt)}]</p>`
        );
      }
    }

    // 4. 投稿作成
    // メタデータがあれば優先使用
    const postData = {
      title: metadata.title || doc.getName(),
      content: finalHtml,
      ...CONFIG.POST_DEFAULTS
    };

    // メタデータの反映
    if (metadata.slug) postData.slug = metadata.slug;
    
    // カテゴリ・タグの解決
    if ((metadata.categories && metadata.categories.length > 0) || (metadata.tags && metadata.tags.length > 0)) {
        ui.alert('進捗', 'カテゴリ・タグ情報を解決しています...', ui.ButtonSet.OK);
        try {
            const allCats = client.getCategories();
            const allTags = client.getTags();
            
            const catIds = [];
            const tagIds = [];
            
            // カテゴリ解決
            if (metadata.categories) {
                for (const catName of metadata.categories) {
                    const found = allCats.find(c => c.name.toLowerCase() === catName.toLowerCase());
                    if (found) {
                        catIds.push(found.id);
                    } else {
                        Utils.log(`Category not found: ${catName}`);
                    }
                }
            }
            
            // タグ解決
            if (metadata.tags) {
                for (const tagName of metadata.tags) {
                    const found = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
                    if (found) {
                        tagIds.push(found.id);
                    } else {
                        Utils.log(`Tag not found: ${tagName}`);
                    }
                }
            }
            
            if (catIds.length > 0) postData.categories = catIds;
            if (tagIds.length > 0) postData.tags = tagIds;
            
        } catch (e) {
            Utils.error('Taxonomy resolution failed', e);
        }
    }
    
    if (metadata.date) {
      // 日付フォーマットの正規化 (WPは ISO 8601 yyyy-MM-ddTHH:mm:ss を要求)
      const dateObj = new Date(metadata.date);
      if (!isNaN(dateObj.getTime())) {
        postData.date = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
      } else {
        Utils.log(`Invalid date string: ${metadata.date}`);
        // そのまま渡してWP側の判断に任せるか、あるいは現在時刻にするなど。
        // ここではエラーにはせずスルーするが、エラーログは残す
      }
    }
    
    if (metadata.excerpt) postData.excerpt = metadata.excerpt;
    if (featuredMediaId > 0) postData.featured_media = featuredMediaId;

    const post = client.createPost(postData);
    Utils.log('Post created', post);

    // 完了通知
    ui.alert('投稿完了', `下書きを作成しました。\n\nタイトル: ${postData.title}\nID: ${post.id}`, ui.ButtonSet.OK);

  } catch (e) {
    Utils.error('Process failed', e);
    ui.alert('エラー', `処理中にエラーが発生しました。\n\n${e.message}`, ui.ButtonSet.OK);
  }
}
