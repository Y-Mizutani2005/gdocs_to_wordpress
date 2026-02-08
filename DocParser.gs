/**
 * DocParser.gs
 * Google Docsを解析し、HTMLに変換するクラス
 */

class DocParser {
  constructor() {
    this.toc = [];         // 目次データ
    this.headingIndex = 0; // 見出し用の連番
    this.images = [];      // 抽出した画像データ
    this.imageIndex = 0;   // プレースホルダーのインデックス
  }

  /**
   * ドキュメントを解析する
   * @param {Document} doc - Google Docオブジェクト
   * @returns {Object} { html, images, metadata }
   */
  parse(doc) {
    const body = doc.getBody();
    let children = body.getNumChildren();
    let startIndex = 0;
    
    // 1. メタデータテーブルの解析
    const metadata = this.parseMetadata(body);
    
    // メタデータとして使用されたテーブルがある場合、そのテーブルと
    // それ以前の（空の）要素をスキップする
    if (typeof metadata._tableIndex === 'number' && metadata._tableIndex >= 0) {
      startIndex = metadata._tableIndex + 1;
      
      // テーブル直後の空行もスキップ
      while (startIndex < children) {
        const next = body.getChild(startIndex);
        if (next.getType() === DocumentApp.ElementType.PARAGRAPH && next.asParagraph().getText().trim() === '') {
          startIndex++;
        } else {
          break;
        }
      }
    }

    let html = '';

    for (let i = startIndex; i < children; i++) {
      const element = body.getChild(i);
      const type = element.getType();
      
      // 引用ブロック（ショートコード）の判定
      // [blockquote] または [quote] で開始
      if (type === DocumentApp.ElementType.PARAGRAPH) {
        let text = element.asParagraph().getText().trim();
        // 全角ブラケットの正規化
        text = text.replace(/[［］]/g, m => m === '［' ? '[' : ']');
        const lowerText = text.toLowerCase();

        // 1行完結型の判定 ([blockquote]...[/blockquote])
        // ネスト対応はしない簡易実装
        const singleLineMatch = lowerText.match(/^\[(blockquote|quote)\](.*?)\[\/\1\]$/);
        
        if (singleLineMatch) {
          // コンテンツ部分の処理
          // _processParagraphを通してHTML化し、タグ部分を除去してblockquoteで囲む
          // 注: _processParagraphは <p>...</p> を返す
          let paraHtml = this._processParagraph(element);
          
          // タグの除去 (単純置換だとHTMLタグを壊す恐れがあるが、今回はタグがテキストとして入っている前提)
          // 念のため、生成されたHTMLから [blockquote] と [/blockquote] を除去する
          // タグ自体が装飾されている可能性も考慮し、正規表現で柔軟に
          const tagName = singleLineMatch[1];
          const startTagRegex = new RegExp(`\\[${tagName}\\]`, 'i');
          const endTagRegex = new RegExp(`\\[\\/${tagName}\\]`, 'i');
          
          paraHtml = paraHtml.replace(startTagRegex, '').replace(endTagRegex, '');
          
          html += `<blockquote class="${CONFIG.CLASSES.BLOCKQUOTE || 'wp-block-quote'}">\n${paraHtml}</blockquote>\n`;
          continue;
        }

        // 複数行ブロックの開始判定
        if (lowerText === '[blockquote]' || lowerText === '[quote]') {
          const quoteItems = [];
          i++; // 開始タグをスキップ
          
          while (i < children) {
            const nextElement = body.getChild(i);
            
            // 終了タグチェック
            if (nextElement.getType() === DocumentApp.ElementType.PARAGRAPH) {
              let nextText = nextElement.asParagraph().getText().trim();
              nextText = nextText.replace(/[［］]/g, m => m === '［' ? '[' : ']').toLowerCase();
              
              if (nextText === '[/blockquote]' || nextText === '[/quote]') {
                break; // 終了タグが見つかったらループを抜ける
              }
            }
            
            quoteItems.push(nextElement);
            i++;
          }
          
          html += this._processBlockquoteSequence(quoteItems);
          continue; // 次の要素へ
        }
      }

      // リスト処理の分岐
      if (type === DocumentApp.ElementType.LIST_ITEM) {
        // 連続するリストアイテムを収集
        const listItems = [];
        listItems.push(element.asListItem());
        
        // 次の要素もリストかどうか確認
        while (i + 1 < children && body.getChild(i + 1).getType() === DocumentApp.ElementType.LIST_ITEM) {
          i++; // ループを進める
          listItems.push(body.getChild(i).asListItem());
        }
        
        // まとめて処理
        html += this._processListSequence(listItems);
      } else {
        html += this._processElement(element);
      }
    }
    
    // 目次の生成と挿入
    const tocHtml = this._generateTocHtml();
    if (tocHtml) {
      // 最初の要素の前に挿入するため結合
      html = tocHtml + html;
    }

    return {
      html: html,
      images: this.images,
      metadata: metadata
    };
  }

  /**
   * メタデータテーブルの解析
   * @returns {Object} メタデータオブジェクト
   */
  parseMetadata(body) {
    const defaultMeta = {
      title: '',
      slug: '',
      date: '',
      excerpt: '',
      categories: [],
      tags: [],
      featuredImage: null
    };

    if (body.getNumChildren() === 0) return defaultMeta;

    // 最初の有効な要素（テーブル）を探す
    let table = null;
    let tableIndex = -1;
    
    // 先頭からいくつか要素を見て、最初のテーブルを採用する
    // ただし、あまり後ろまで走査すると本文中のテーブルを誤認する恐れがあるため
    // 先頭5要素または最初のテキスト出現までとする
    const checkLimit = Math.min(body.getNumChildren(), 10);
    
    for (let i = 0; i < checkLimit; i++) {
      const el = body.getChild(i);
      if (el.getType() === DocumentApp.ElementType.TABLE) {
        table = el.asTable();
        tableIndex = i;
        break;
      }
      // 空でないテキスト段落が現れたら、それはもう本文とみなして探索終了
      if (el.getType() === DocumentApp.ElementType.PARAGRAPH) {
         const text = el.asParagraph().getText().trim();
         if (text !== '') break;
      }
    }

    if (!table) {
      return defaultMeta;
    }

    const rows = table.getNumRows();
    const meta = { ...defaultMeta };

    // 最初の行がヘッダーかデータか判定
    // ヘッダーならスキップ、データなら読み込み
    // 判定基準: 1列目の値が 'key' や 'name' などのヘッダーっぽい文字かどうか
    let startRow = 0;
    if (rows > 0) {
      const firstCellText = table.getRow(0).getCell(0).getText().toLowerCase().trim();
      if (['key', 'name', 'field', '項目'].includes(firstCellText)) {
        startRow = 1;
      }
    }

    for (let i = startRow; i < rows; i++) {
      const row = table.getRow(i);
      if (row.getNumCells() < 2) continue;

      const key = row.getCell(0).getText().toLowerCase().trim();
      const cellValue = row.getCell(1);
      
      switch (key) {
        case 'title':
        case 'タイトル':
          meta.title = cellValue.getText().trim();
          break;
        case 'slug':
        case 'スラッグ':
          meta.slug = cellValue.getText().trim();
          break;
        case 'date':
        case '日時':
        case '投稿日時':
          meta.date = cellValue.getText().trim();
          break;
        case 'excerpt':
        case '抜粋':
          meta.excerpt = cellValue.getText().trim();
          break;
        case 'category':
        case 'categories':
        case 'カテゴリ':
        case 'カテゴリー':
          meta.categories = cellValue.getText().split(/,|、/).map(s => s.trim()).filter(s => s);
          break;
        case 'tag':
        case 'tags':
        case 'タグ':
          meta.tags = cellValue.getText().split(/,|、/).map(s => s.trim()).filter(s => s);
          break;
        case 'featured image':
        case 'featured_image':
        case 'eyecatch':
        case 'アイキャッチ':
        case '画像':
          // 画像が含まれているかチェック
          if (cellValue.getNumChildren() > 0) {
            // パラグラフの中の画像を探す
            for (let c = 0; c < cellValue.getNumChildren(); c++) {
              const child = cellValue.getChild(c);
              if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
                 const p = child.asParagraph();
                 for (let pic = 0; pic < p.getNumChildren(); pic++) {
                   const el = p.getChild(pic);
                   // InlineImage check
                   if (el.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
                      meta.featuredImage = this._createImageBlobObj(el.asInlineImage());
                      break; // 1枚だけ
                   }
                 }
                 
                 // PositionedImage check (if no inline image found yet in this paragraph)
                 if (!meta.featuredImage) {
                   const posImages = p.getPositionedImages();
                   if (posImages.length > 0) {
                     meta.featuredImage = this._createImageBlobObj(posImages[0]);
                   }
                 }
              }
              if (meta.featuredImage) break;
            }
          }
           break;
      }
    }
    
    // 使用したテーブルのインデックスを保存
    meta._tableIndex = tableIndex;
    
    return meta;
  }
  
  /**
   * 画像オブジェクト生成ヘルパー
   * _processImageと似ているが、配列には追加せずオブジェクトを返す
   */
  _createImageBlobObj(image) {
    const blob = image.getBlob();
    const contentType = blob.getContentType();
    
    if (!Utils.isSupportedMimeType(contentType)) { // Use Utils helper if available, or manual check
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType)) {
          return null;
        }
    }

    const index = this.imageIndex++; // 連番は共有する
    const ext = Utils.getExtensionFromMime(contentType);
    blob.setName(`featured_image_${index}.${ext}`);
    
    let alt = 'Featured Image';
    if (typeof image.getAltDescription === 'function') {
      alt = image.getAltDescription() || alt;
    } else if (typeof image.getTitle === 'function') { // Fallback for PositionedImage?
      alt = image.getTitle() || alt;
    }
    
    return {
      blob: blob,
      alt: alt,
      index: index
    };
  }

  /**
   * 要素の種類に応じて処理を振り分ける
   */
  _processElement(element) {
    const type = element.getType();
    
    switch (type) {
      case DocumentApp.ElementType.PARAGRAPH:
        return this._processParagraph(element);
      
      case DocumentApp.ElementType.TABLE:
        // メタデータテーブルはparseメソッド側でスキップされるため、
        // ここに来るテーブルは本文中のテーブル。
        return this._processTable(element.asTable());
        
      case DocumentApp.ElementType.LIST_ITEM:
        return this._processListItem(element);

      default:
        return '';
    }
  }

  /**
   * リストアイテムの処理
   */
  _processListItem(listItem) {
    const text = this._processText(listItem);
    const nesting = listItem.getNestingLevel();
    const glyph = listItem.getGlyphType();
    
    // リストの種類判定 (番号付きか箇条書きか)
    // DocumentApp.GlyphType.NUMBER などで判定
    let tag = 'ul';
    if ([
      DocumentApp.GlyphType.NUMBER,
      DocumentApp.GlyphType.LATIN_UPPER,
      DocumentApp.GlyphType.LATIN_LOWER,
      DocumentApp.GlyphType.ROMAN_UPPER,
      DocumentApp.GlyphType.ROMAN_LOWER
    ].includes(glyph)) {
      tag = 'ol';
    }

    // 単純な実装: このパーサーはステートレス（前の要素を記憶しない）ため、
    // 厳密な <ul><li>...</li></ul> のネスト構造を作るのは難しい。
    // WordPress (Gutenberg) は <li> アイテムだけでも、あるいは
    // 連続する <li> を自動的にリストとして認識することがあるが、
    // HTMLとしては正しくない。
    // 簡易的に、ここでは直前の要素との結合などは行わず、
    // <!-- WP_LIST_ITEM:type=ul,level=0 -->... のような中間表現にするか、
    // あるいは毎回 <ul><li>...</li></ul> で囲むか。
    // 毎回囲むとリストが分断される。
    
    // 解決策: 今回は簡易的に `<li>` だけを返し、前後の整合性はCSSやWP側の自動修正に期待するか、
    // もしくは、parse()メソッド内でループ処理する際に連続するリストアイテムをまとめるロジックが必要。
    
    // 現状のアーキテクチャ（要素ごとの処理）を維持しつつリスト対応するには、
    // parse() ループ内でのステート管理が必要。
    // しかし、大掛かりな改修になるため、ここでは「リストマーカー付きのパラグラフ」として出力する妥協案も考えられるが、
    // 要望は「数字リストの表示もうまくいってない」なので、HTMLタグとして正しいリストを出したい。
    
    // → DocParserクラスに `listState` を持たせて、連続処理させるのが良いが、
    // _processElementは単発で呼ばれる。
    // parse()メソッドを改修して、リストアイテムが連続する場合にまとめて処理するように変更する。
    // そのため、ここ（_processListItem）では扱わず、parse()側で処理するよう変更すべきだが、
    // 既存コードを活かすため、_processElementからは「LIST_ITEM_PENDING」のような特殊値を返し、
    // parse()ループ内でバッファリングするアプローチをとる、あるいは
    // _processElement内で「自分の次もリストか？」を確認するのはGASのAPI的にコストが高い。
    
    // 【修正方針】
    // parse()メソッド内で LIST_ITEM の連続検知を行うように変更する。
    // _processElement は「処理済みHTML」を返す前提なので、
    // parse() で LIST_ITEM を検出したら、_processElement を呼ばずに専用の _processListSequence を呼ぶ。
    
    // なので、ここは「呼ばれない」前提、もしくは単体で呼ばれた場合のフォールバック
    return `<li>${text}</li>`; 
  }
  
  /**
   * リスト一連の処理 (parseメソッドから呼ばれる)
   */
  _processListSequence(listItems) {
    if (listItems.length === 0) return '';
    
    // 最初のアイテムでリストタイプを決定
    const firstItem = listItems[0];
    const glyph = firstItem.getGlyphType();
    const isOrdered = [
      DocumentApp.GlyphType.NUMBER,
      DocumentApp.GlyphType.LATIN_UPPER,
      DocumentApp.GlyphType.LATIN_LOWER,
      DocumentApp.GlyphType.ROMAN_UPPER,
      DocumentApp.GlyphType.ROMAN_LOWER
    ].includes(glyph);
    
    const tag = isOrdered ? 'ol' : 'ul';
    const tagClass = isOrdered ? CONFIG.CLASSES.OL : CONFIG.CLASSES.UL;
    const classAttr = tagClass ? ` class="${tagClass}"` : '';
    
    let html = `<${tag}${classAttr}>\n`;
    
    for (const item of listItems) {
      const text = this._processText(item);
      const level = item.getNestingLevel(); // ネスト対応は簡易的にインデントで表現するか、再帰が必要だが今回はフラットに
      html += `  <li>${text}</li>\n`;
    }
    
    html += `</${tag}>\n`;
    return html;
  }

  /**
   * 引用ブロックの一連処理
   */
  _processBlockquoteSequence(elements) {
    if (elements.length === 0) return '';
    
    const blockquoteClass = CONFIG.CLASSES.BLOCKQUOTE || 'wp-block-quote';
    let html = `<blockquote class="${blockquoteClass}">\n`;
    
    for (const element of elements) {
      // 再帰的に要素を処理
      // 注: ここで _processElement を呼ぶと、ネストしたリストなども処理される
      html += this._processElement(element);
    }
    
    html += `</blockquote>\n`;
    return html;
  }

  /**
   * 段落（見出し含む）の処理
   */
  _processParagraph(para) {
    // 画像のみを含む段落のチェック
    // PositionedImage (浮動配置) もチェック
    // GASの仕様上、PositionedImageはParagraphに紐付く
    const positionedImages = para.getPositionedImages();
    if (positionedImages.length > 0) {
        let imgHtml = '';
        for (const pImg of positionedImages) {
            imgHtml += this._processImage(pImg);
        }
        // テキストもある場合はテキストも出力
        const text = this._processText(para);
        if (text) {
             const pClass = CONFIG.CLASSES.P ? ` class="${CONFIG.CLASSES.P}"` : '';
             return imgHtml + `<p${pClass}>${text}</p>\n`;
        }
        return imgHtml;
    }

    if (para.getNumChildren() === 1 && para.getChild(0).getType() === DocumentApp.ElementType.INLINE_IMAGE) {
      return this._processImage(para.getChild(0));
    }

    const heading = para.getHeading();
    const text = this._processText(para);
    
    // 空行はスキップ（ただし画像などが含まれる場合は別）
    if (!text && para.getNumChildren() === 0) return '';
    
    // PositionedImageは上でチェック済みだが、InlineImageが含まれるがテキストがない場合もある
    // _processText内でInlineImageは処理されるので、text変数にimgタグ(プレースホルダー)が含まれているはず
    
    if (!text) return ''; // 本当に空なら戻る

    // 見出し処理
    if (heading !== DocumentApp.ParagraphHeading.NORMAL && heading !== DocumentApp.ParagraphHeading.TITLE && heading !== DocumentApp.ParagraphHeading.SUBTITLE) {
      
      let level = 0;
      let tagName = 'p';
      let className = '';

      switch (heading) {
        case DocumentApp.ParagraphHeading.HEADING1:
        case DocumentApp.ParagraphHeading.HEADING2:
          level = 2;
          tagName = 'h2';
          className = CONFIG.CLASSES.H2;
          break;
        case DocumentApp.ParagraphHeading.HEADING3:
          level = 3;
          tagName = 'h3';
          className = CONFIG.CLASSES.H3;
          break;
        case DocumentApp.ParagraphHeading.HEADING4:
          level = 4;
          tagName = 'h4';
          className = CONFIG.CLASSES.H4;
          break;
        case DocumentApp.ParagraphHeading.HEADING5: // h5は目次対象外とするが、HTMLには出力
        default:
          return `<h5 class="${CONFIG.CLASSES.H5}">${text}</h5>\n`;
      }
      
      // 目次用にIDを生成して保存
      const id = `toc-heading-${++this.headingIndex}`;
      this.toc.push({ level: level, text: text, id: id });
      
      const classAttr = className ? ` class="${className}"` : '';
      return `<${tagName} id="${id}"${classAttr}>${text}</${tagName}>\n`;
    }

    // 引用ブロック判定（インデントがある段落）は削除
    // ショートコード [blockquote] ... [/blockquote] に移行したため
    
    // 通常の段落
    const pClass = CONFIG.CLASSES.P ? ` class="${CONFIG.CLASSES.P}"` : '';
    return `<p${pClass}>${text}</p>\n`;
  }
  
  /**
   * 目次HTMLの生成
   */
  _generateTocHtml() {
    if (this.toc.length === 0) return '';

    // シンプルなネストなしリストでの実装（CSSでインデント調整を想定）
    // 要望: h2,h3,h4までを階層付けした目次
    
    let html = '<div class="toc-container">\n<p class="toc-title">目次</p>\n<ul>\n';
    
    for (const item of this.toc) {
      const levelClass = `toc-level-${item.level}`;
      html += `<li class="${levelClass}"><a href="#${item.id}">${item.text}</a></li>\n`;
    }
    
    html += '</ul>\n</div>\n';
    return html;
  }

  /**
   * テキスト処理（装飾適用）
   */
  _processText(element) {
    const textElements = element.getNumChildren();
    let result = '';

    for (let i = 0; i < textElements; i++) {
      const child = element.getChild(i);
      if (child.getType() === DocumentApp.ElementType.TEXT) {
        result += this._processTextElement(child);
      } else if (child.getType() === DocumentApp.ElementType.INLINE_IMAGE) {
        // インライン画像も処理
        result += this._processImage(child);
      }
    }
    
    return result;
  }

  /**
   * 文字単位の装飾処理
   */
  _processTextElement(textEl) {
    let text = Utils.escapeHtml(textEl.getText());
    if (!text) return '';

    const url = textEl.getLinkUrl();
    
    // リンク処理
    if (url) {
      text = `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    }

    // 太字
    if (textEl.isBold()) {
      text = `<strong>${text}</strong>`;
    }

    // 斜体
    if (textEl.isItalic()) {
      text = `<em>${text}</em>`;
    }

    // 下線
    if (textEl.isUnderline() && !url) { // リンクの場合は下線不要
      text = `<span style="text-decoration: underline;">${text}</span>`;
    }
    
    // 取り消し線
    if (textEl.isStrikethrough()) {
      text = `<del>${text}</del>`;
    }

    return text;
  }

  /**
   * 画像処理
   * プレースホルダーを埋め込み、画像配列にBlobを保存
   */
  _processImage(image) {
    const blob = image.getBlob();
    const contentType = blob.getContentType();
    
    // サポートされている画像形式か確認
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType)) {
      return '';
    }

    const index = this.imageIndex++;
    
    // ファイル名の生成 (doc_image_0.png)
    const ext = Utils.getExtensionFromMime(contentType);
    blob.setName(`doc_image_${index}.${ext}`);
    
    this.images.push({
      blob: blob,
      alt: image.getAltDescription() || '',
      index: index
    });

    // プレースホルダー（後で実URLに置換）
    // Gutenberg画像ブロックの構造に合わせるために専用のプレースホルダーを使用
    return `<!-- WP_IMAGE_PLACEHOLDER:${index} -->\n`;
  }

  /**
   * テーブル要素の処理
   * @param {Table} table - Google Docsのテーブル要素
   * @returns {string} 変換後のHTML文字列
   */
  _processTable(table) {
    // 会話ブロック(2列テーブル)かどうか判定
    if (this._isChatTable(table)) {
      return this._processChatTable(table);
    }
    
    // 通常のテーブルはHTMLテーブルとして出力
    return this._processRegularTable(table);
  }

  /**
   * 会話ブロック(チャット形式)テーブルかどうかを判定
   * @param {Table} table - Google Docsのテーブル要素
   * @returns {boolean} 会話ブロックテーブルならtrue
   */
  _isChatTable(table) {
    // 会話ブロックの条件:
    // 1. 2列であること
    // 2. 少なくとも1行あること
    
    if (table.getNumRows() === 0) {
      return false;
    }
    
    const firstRow = table.getRow(0);
    if (firstRow.getNumCells() !== 2) {
      return false;
    }
    
    // 全行が2列かどうかもチェック
    for (let i = 0; i < table.getNumRows(); i++) {
      if (table.getRow(i).getNumCells() !== 2) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 会話ブロックテーブルをHTML構造に変換
   * @param {Table} table - 会話ブロックテーブル
   * @returns {string} 会話ブロックのHTML
   */
  /**
   * 会話ブロックテーブルをHTML構造に変換
   * @param {Table} table - 会話ブロックテーブル
   * @returns {string} 会話ブロックのHTML
   */
  _processChatTable(table) {
    const containerClass = CONFIG.CLASSES.CHAT_CONTAINER || 'chat-block';
    const rowClass = CONFIG.CLASSES.CHAT_ROW || 'chat-row';
    const iconClass = CONFIG.CLASSES.CHAT_ICON || 'chat-icon';
    const bubbleClass = CONFIG.CLASSES.CHAT_BUBBLE || 'chat-bubble';
    const leftClass = CONFIG.CLASSES.CHAT_LEFT || 'chat-left';
    const rightClass = CONFIG.CLASSES.CHAT_RIGHT || 'chat-right';
    
    let html = `<div class="${containerClass}">\n`;
    
    for (let i = 0; i < table.getNumRows(); i++) {
      const row = table.getRow(i);
      const iconCell = row.getCell(0);
      const bubbleCell = row.getCell(1);
      
      // セリフセルのテキストから[L]/[R]マーカーを検出
      const bubbleRawText = this._getCellRawText(bubbleCell);
      let positionClass = leftClass; // デフォルトは左
      
      if (bubbleRawText.trim().startsWith('[R]') || bubbleRawText.trim().startsWith('[r]')) {
        positionClass = rightClass;
      } else if (bubbleRawText.trim().startsWith('[L]') || bubbleRawText.trim().startsWith('[l]')) {
        positionClass = leftClass;
      }
      
      // アイコンセルの処理（画像またはテキスト）
      const iconContent = this._processCellContent(iconCell);
      // アイコンセル内の画像を 'chat-icon' としてマーク
      this._markImagesAsChatIcon(iconContent);
      
      // セリフセルの処理（[L]/[R]マーカーを除去）
      const bubbleContent = this._processCellContentWithMarkerRemoval(bubbleCell);
      
      html += `  <div class="${rowClass} ${positionClass}">\n`;
      html += `    <div class="${iconClass}">${iconContent}</div>\n`;
      html += `    <div class="${bubbleClass}">${bubbleContent}</div>\n`;
      html += `  </div>\n`;
    }
    
    html += `</div>\n`;
    return html;
  }

  /**
   * コンテンツ内のプレースホルダーを検索し、対応する画像をチャットアイコンとしてマークする
   */
  _markImagesAsChatIcon(content) {
    const regex = /WP_IMAGE_PLACEHOLDER:(\d+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const index = parseInt(match[1], 10);
      const image = this.images.find(img => img.index === index);
      if (image) {
        image.context = 'chat-icon';
      }
    }
  }

  /**
   * セルの生テキストを取得（[L]/[R]マーカー検出用）
   * @param {TableCell} cell - テーブルセル
   * @returns {string} セル内の生テキスト
   */
  _getCellRawText(cell) {
    let text = '';
    for (let i = 0; i < cell.getNumChildren(); i++) {
      const child = cell.getChild(i);
      if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
        text += child.asParagraph().getText();
      }
    }
    return text;
  }

  /**
   * セル内容を処理し、[L]/[R]マーカーを除去
   * @param {TableCell} cell - テーブルセル
   * @returns {string} セル内容のHTML（マーカー除去済み）
   */
  _processCellContentWithMarkerRemoval(cell) {
    return this._processCellContent(cell, true);
  }

  /**
   * テーブルセルの内容を処理
   * @param {TableCell} cell - テーブルセル
   * @param {boolean} removeMarker - [L]/[R]マーカーを除去するかどうか
   * @returns {string} セル内容のHTML
   */
  _processCellContent(cell, removeMarker = false) {
    let html = '';
    
    for (let i = 0; i < cell.getNumChildren(); i++) {
      const child = cell.getChild(i);
      const type = child.getType();
      
      if (type === DocumentApp.ElementType.PARAGRAPH) {
        const para = child.asParagraph();
        
        // 画像のチェック (PositionedImage)
        const positionedImages = para.getPositionedImages();
        if (positionedImages.length > 0) {
          for (const pImg of positionedImages) {
            html += this._processImage(pImg);
          }
        }

        // 段落が画像のみかどうかをチェック（画像のみの場合は<p>で囲まない）
        let isImageOnly = false;
        if (para.getNumChildren() === 1 && para.getChild(0).getType() === DocumentApp.ElementType.INLINE_IMAGE) {
          isImageOnly = true;
        }
        
        // テキスト内容処理（インライン画像もここで処理される）
        let text = this._processText(para);
        
        if (text) {
          // マーカー除去が必要な場合
          if (removeMarker) {
             text = text.replace(/^\s*\[(L|R|l|r)\]\s*/, '');
          }
          
          if (text) {
             // 画像のみの場合は<p>タグを省略
             if (isImageOnly) {
               html += text;
             } else {
               html += `<p>${text}</p>`;
             }
          }
        }
      }
    }
    
    return html;
  }

  /**
   * 通常のテーブルをHTMLテーブルとして出力（Gutenberg準拠）
   * @param {Table} table - Google Docsのテーブル要素
   * @returns {string} HTMLテーブル(figureで囲む)
   */
  _processRegularTable(table) {
    const figureClass = CONFIG.CLASSES.TABLE_FIGURE || 'wp-block-table';
    const tableClass = CONFIG.CLASSES.TABLE || '';
    
    let html = `<figure class="${figureClass}">\n<table class="${tableClass}">\n`;
    
    for (let i = 0; i < table.getNumRows(); i++) {
      const row = table.getRow(i);
      html += '  <tr>\n';
      
      for (let j = 0; j < row.getNumCells(); j++) {
        const cell = row.getCell(j);
        const cellContent = this._processCellContent(cell);
        html += `    <td>${cellContent}</td>\n`;
      }
      
      html += '  </tr>\n';
    }
    
    html += '</table>\n</figure>\n';
    return html;
  }
}

