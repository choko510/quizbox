// ローマ字→ひらがな変換マップ
const romajiToHiraganaMap = {
    'a': 'あ', 'i': 'い', 'u': 'う', 'e': 'え', 'o': 'お',
    'ka': 'か', 'ki': 'き', 'ku': 'く', 'ke': 'け', 'ko': 'こ',
    'sa': 'さ', 'shi': 'し', 'si': 'し', 'su': 'す', 'se': 'せ', 'so': 'そ',
    'ta': 'た', 'chi': 'ち', 'ti': 'ち', 'tsu': 'つ', 'tu': 'つ', 'te': 'て', 'to': 'と',
    'na': 'な', 'ni': 'に', 'nu': 'ぬ', 'ne': 'ね', 'no': 'の',
    'ha': 'は', 'hi': 'ひ', 'fu': 'ふ', 'hu': 'ふ', 'he': 'へ', 'ho': 'ほ',
    'ma': 'ま', 'mi': 'み', 'mu': 'む', 'me': 'め', 'mo': 'も',
    'ya': 'や', 'yu': 'ゆ', 'yo': 'よ',
    'ra': 'ら', 'ri': 'り', 'ru': 'る', 're': 'れ', 'ro': 'ろ',
    'wa': 'わ', 'wo': 'を', 'n': 'ん',
    'ga': 'が', 'gi': 'ぎ', 'gu': 'ぐ', 'ge': 'げ', 'go': 'ご',
    'za': 'ざ', 'ji': 'じ', 'zi': 'じ', 'zu': 'ず', 'ze': 'ぜ', 'zo': 'ぞ',
    'da': 'だ', 'di': 'ぢ', 'du': 'づ', 'de': 'で', 'do': 'ど',
    'ba': 'ば', 'bi': 'び', 'bu': 'ぶ', 'be': 'べ', 'bo': 'ぼ',
    'pa': 'ぱ', 'pi': 'ぴ', 'pu': 'ぷ', 'pe': 'ぺ', 'po': 'ぽ',
    'kya': 'きゃ', 'kyu': 'きゅ', 'kyo': 'きょ',
    'sha': 'しゃ', 'shu': 'しゅ', 'sho': 'しょ',
    'cha': 'ちゃ', 'chu': 'ちゅ', 'cho': 'ちょ',
    'nya': 'にゃ', 'nyu': 'にゅ', 'nyo': 'にょ',
    'hya': 'ひゃ', 'hyu': 'ひゅ', 'hyo': 'ひょ',
    'mya': 'みゃ', 'myu': 'みゅ', 'myo': 'みょ',
    'rya': 'りゃ', 'ryu': 'りゅ', 'ryo': 'りょ',
    'gya': 'ぎゃ', 'gyu': 'ぎゅ', 'gyo': 'ぎょ',
    'ja': 'じゃ', 'ju': 'じゅ', 'jo': 'じょ',
    'bya': 'びゃ', 'byu': 'びゅ', 'byo': 'びょ',
    'pya': 'ぴゃ', 'pyu': 'ぴゅ', 'pyo': 'ぴょ'
};

// 単語抽出用の正規表現
const wordExtractRegex = /([A-Za-z][0-9A-Za-z_]*(?:\/[A-Za-z][0-9A-Za-z_]*)+|(?!.*\/)[一-龥ァ-ヾA-Za-z0-9_]{2,})/g;

// 辞書APIからデータを取得する関数
async function fetchDictionaryData(word,mondaibun) {
    try {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ word: word, mondai: mondaibun})
        };
        const response = await fetch(`/api/search/word/`, options);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Dictionary fetch error:', error);
        return { 
            success: false, 
            word: word, 
            definition: 'データを取得できませんでした。',
            mondai: mondaibun
        };
    }
}

// 共通ポップオーバー要素（一度だけ作成して再利用）
let sharedPopover;
function getWordPopover() {
    if (!sharedPopover) {
        sharedPopover = document.createElement('div');
        sharedPopover.className = 'word-popover';
        sharedPopover.style.position = 'absolute';
        sharedPopover.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        sharedPopover.style.color = 'white';
        sharedPopover.style.padding = '5px 10px';
        sharedPopover.style.borderRadius = '3px';
        sharedPopover.style.fontSize = '12px';
        sharedPopover.style.zIndex = '1000';
        sharedPopover.style.transition = 'opacity 0.2s';
        sharedPopover.style.pointerEvents = 'none'; // ポップオーバー自体はクリックイベントを通過させる
        sharedPopover.style.opacity = '0';
        document.body.appendChild(sharedPopover);
    }
    return sharedPopover;
}

// ポップオーバーを表示する関数
function showPopoverForWord(element, word) {
    const popover = getWordPopover();
    popover.textContent = `"${word}"の定義を調べる`;
    const rect = element.getBoundingClientRect();
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + 5}px`;
    popover.style.opacity = '1';
}

// ポップオーバーを非表示にする関数
function hidePopover() {
    if (sharedPopover) {
        sharedPopover.style.opacity = '0';
    }
}

// 辞書モーダルを表示する関数
function showDictionaryModal(word, definition) {
    // モーダルがまだ作成されていない場合は新規作成
    let dictionaryModal = document.getElementById('dictionary-modal');
    if (!dictionaryModal) {
        dictionaryModal = document.createElement('div');
        dictionaryModal.className = 'modal micromodal-slide';
        dictionaryModal.id = 'dictionary-modal';
        dictionaryModal.setAttribute('aria-hidden', 'true');
        
        dictionaryModal.innerHTML = `
            <div class="modal__overlay" tabindex="-1" data-micromodal-close>
                <div class="modal__container" role="dialog" aria-modal="true" aria-labelledby="dictionary-modal-title">
                    <header class="modal__header">
                        <h2 id="dictionary-modal-title" class="modal__title"></h2>
                    </header>
                    <main class="modal__content">
                        <div id="dictionary-modal-definition" class="dictionary-definition"></div>
                    </main>
                    <footer class="modal__footer">
                        <button class="modal__btn" data-micromodal-close aria-label="Close this dialog window">閉じる</button>
                    </footer>
                </div>
            </div>
        `;
        document.body.appendChild(dictionaryModal);
    }
    
    // モーダルの内容を更新
    const modalTitle = document.getElementById('dictionary-modal-title');
    const modalDefinition = document.getElementById('dictionary-modal-definition');
    modalTitle.textContent = word;
    if (typeof marked !== 'undefined') {
        modalDefinition.innerHTML = marked.parse(definition);
    } else {
        modalDefinition.textContent = definition;
    }
    
    // モーダルを表示（MicroModalが初期化されていることを確認）
    if (typeof MicroModal !== 'undefined') {
        MicroModal.show('dictionary-modal');
    } else {
        console.error('MicroModal is not initialized');
        alert(`${word}: ${definition}`);
    }
}

// 単語をクリックしたときの処理
async function onWordClick(event, word) {
    event.preventDefault();
    event.stopPropagation();
    
    // ローディング表示
    showDictionaryModal(word, "定義を取得中...");
    
    // APIから単語の定義を取得
    const mondaibun = event.target.closest('.content').textContent;
    const data = await fetchDictionaryData(word, mondaibun);
    
    // 取得したデータでモーダルを更新
    if (data.success) {
        showDictionaryModal(data.word, data.definition);
    } else {
        showDictionaryModal(word, "定義が見つかりませんでした。");
    }
}

// テキストノードから対象となる単語を検出してクリック可能な要素に置き換える
function processTextNode(node) {
    if (!node || !node.nodeValue) return;
    
    const text = node.nodeValue;
    const parent = node.parentNode;
    
    // 親ノードが存在しない場合は処理しない
    if (!parent) return;
    
    // クリック可能とするクラス名のリスト（この要素内の単語を処理する）
    const validParentClasses = ['content'];
    
    // 親要素がクリック可能とする対象でなければスキップ
    let isValidParent = false;
    for (const className of validParentClasses) {
        if (parent.classList && parent.classList.contains(className)) {
            isValidParent = true;
            break;
        }
    }
    
    if (!isValidParent) return;

    // すでに処理済みの場合はスキップ
    if (parent.getAttribute('data-words-processed') === 'true') return;
    
    // 単語を検出して置換
    const notapplicableword = ['問題', '解説', '解答', '選択肢', '正解', '不正解', '未回答',
        "方法", "正常", "機能", "無効", "維持", "不明", "時間内","時間","接続","データ",
        "状態", "確認", "設定", "選択", "操作", "変更", "表示", "実行", "完了",
        "目的", "内容", "手順", "手法", "条件", "結果", "理由", "対策",
        "影響", "問題点", "注意点", "考慮", "評価", "分析", "調査", "実験",
        "右上", "左上", "右下", "左下", "上部", "下部", "中央",
        "上記", "下記", "前述", "後述", "以下", "以上", "次回", "前回",
        "現在", "過去", "未来", "同様", "類似", "比較",
        "何番目","データ内","文字列","合計","指定","範囲","数値","数値内",
        "一部","A社","B社","C社","D社","E社","F社","G社","H社",
        "効果","期待","技術","適切","適用",
        "可能","不可能","有効","必要","不必要","重要",
        "使用","利用","活用","実装","導入",
        "部分","全体","全て","特定","特別",
    ];

    // パフォーマンス向上のためにSetに変換
    const notApplicableSet = new Set(notapplicableword);

    // 単語マッチング用の配列を事前に作成（パフォーマンス向上）
    const matchArray = Array.from(text.matchAll(wordExtractRegex));
    if (matchArray.length === 0) return;

    let lastIndex = 0;
    const fragments = [];

    for (const match of matchArray) {
        // マッチした単語を取得
        const word = match[0];
        const startIndex = match.index;

        if (notApplicableSet.has(word)) continue;
        
        // マッチする前のテキストを追加
        if (startIndex > lastIndex) {
            fragments.push(document.createTextNode(text.substring(lastIndex, startIndex)));
        }
        
        // 単語をクリック可能な要素に変換
        const wordSpan = document.createElement('span');
        wordSpan.textContent = word;
        wordSpan.classList.add('clickable-word');
        wordSpan.style.cursor = 'pointer';
        wordSpan.dataset.word = word; // データ属性に単語を保存
        
        fragments.push(wordSpan);
        lastIndex = startIndex + word.length;
    }
    
    // 残りのテキストを追加
    if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.substring(lastIndex)));
    }
    
    // 元のノードを置き換え
    if (fragments.length > 0) {
        const container = document.createDocumentFragment();
        fragments.forEach(fragment => container.appendChild(fragment));
        parent.replaceChild(container, node);
        
        // 処理済みマークを設定
        parent.setAttribute('data-words-processed', 'true');
    }
}

// ドキュメント内の全テキストノードを処理（処理負荷を分散）
function processAllTextNodes() {
    const wordList = document.getElementById('wordList');
    if (!wordList) return;

    // すでに処理済みかチェック
    if (wordList.getAttribute('data-words-processed') === 'true') return;
    
    const walker = document.createTreeWalker(
        wordList,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }
    
    // 処理を分割して負荷を軽減
    const batchSize = 50; // 一度に処理するノード数
    let index = 0;
    
    function processBatch() {
        const endIndex = Math.min(index + batchSize, textNodes.length);
        
        // この範囲のノードを処理
        for (let i = index; i < endIndex; i++) {
            processTextNode(textNodes[i]);
        }
        
        index = endIndex;
        
        // まだ処理するノードが残っていれば次のバッチをスケジュール
        if (index < textNodes.length) {
            setTimeout(processBatch, 0);
        } else {
            // 処理完了マークを設定
            wordList.setAttribute('data-words-processed', 'true');
            
            // イベント委譲を設定
            setupEventDelegation();
        }
    }
    
    // 処理開始
    processBatch();
}

// イベント委譲を使用してクリックとホバーを処理
function setupEventDelegation() {
    const wordList = document.getElementById('wordList');
    if (!wordList || wordList.getAttribute('data-events-setup') === 'true') return;
    
    // クリックイベントの委譲
    wordList.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('clickable-word')) {
            const word = target.dataset.word;
            if (word) {
                onWordClick(e, word);
            }
        }
    });
    
    // マウスオーバーイベントの委譲
    wordList.addEventListener('mouseover', (e) => {
        const target = e.target;
        if (target.classList.contains('clickable-word')) {
            const word = target.dataset.word;
            if (word) {
                showPopoverForWord(target, word);
            }
        }
    });
    
    // マウスアウトイベントの委譲
    wordList.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('clickable-word')) {
            hidePopover();
        }
    });
    
    // セットアップ済みのマークを設定
    wordList.setAttribute('data-events-setup', 'true');
}

// 単語リストが表示された時に単語をクリック可能にする
function makeWordsClickable() {
    // 遅延実行して UI をブロックしないようにする
    setTimeout(processAllTextNodes, 100);
}

// ローマ字→ひらがな変換関数
function convertRomajiToHiragana(romaji) {
    let result = '';
    let temp = '';
    let i = 0;

    while (i < romaji.length) {
        // 3文字のパターンをチェック
        if (i + 2 < romaji.length) {
            temp = romaji.substring(i, i + 3);
            if (romajiToHiraganaMap[temp]) {
                result += romajiToHiraganaMap[temp];
                i += 3;
                continue;
            }
        }

        // 2文字のパターンをチェック
        if (i + 1 < romaji.length) {
            temp = romaji.substring(i, i + 2);
            if (romajiToHiraganaMap[temp]) {
                result += romajiToHiraganaMap[temp];
                i += 2;
                continue;
            }
        }

        // 1文字のパターンをチェック
        temp = romaji.substring(i, i + 1);
        result += (romajiToHiraganaMap[temp] || temp);
        i++;
    }

    return result;
}

// ひらがな→カタカナ変換関数
function hiraganaToKatakana(str) {
    return str.replace(/[-]/g, match =>
        String.fromCharCode(match.charCodeAt(0) + 0x60)
    );
}

// カタカナ→ひらがな変換関数
function katakanaToHiragana(str) {
    return str.replace(/[-]/g, match =>
        String.fromCharCode(match.charCodeAt(0) - 0x60)
    );
}

// N-gramジェネレーター関数
function generateNgrams(text, n = 2) {
    const ngrams = [];
    for (let i = 0; i <= text.length - n; i++) {
        ngrams.push(text.substr(i, n));
    }
    return ngrams;
}

// 文字列の類似度を計算する関数
function calculateSimilarity(text1, text2) {
    if (text1.length < 3 || text2.length < 3) {
        return text2.includes(text1) ? 1 : 0;
    }

    const ngrams1 = generateNgrams(text1, 2);
    const ngrams2Set = new Set(generateNgrams(text2, 2));
    let matches = 0;
    for (const ngram of ngrams1) {
        if (ngrams2Set.has(ngram)) {
            matches++;
        }
    }
    return matches / Math.max(ngrams1.length, 1);
}

// 検索インデックス（初回検索時に構築）
let searchIndex = null;

function buildSearchIndex() {
    if (searchIndex) return searchIndex; // すでに構築済みならそれを返す

    console.log("検索インデックスを構築中...");
    const index = {};
    
    // バッチサイズを設定（一度に処理する量）
    const BATCH_SIZE = 100;
    const totalQuestions = questions.length;
    let processedCount = 0;
    
    // インデックス構築を開始する関数
    function processIndexBatch(startIdx) {
        const endIdx = Math.min(startIdx + BATCH_SIZE, totalQuestions);
        
        // このバッチの問題を処理
        for (let idx = startIdx; idx < endIdx; idx++) {
            const question = questions[idx];
            
            // nullやundefinedチェック
            if (!question || !question.word || !question.description) continue;
            
            // 検索対象のテキスト
            const title = question.word;
            const content = question.description;
            
            // 効率的なトークン化
            // より効率的な正規表現を使用し、重複を削除
            const allText = `${title} ${content}`.toLowerCase();
            const tokens = new Set(allText.split(/[\s\.,;:!?()[\]{}'"「」『』]/));
            
            // トークンの処理
            for (const token of tokens) {
                if (token.length < 2) continue; // 短すぎる単語はスキップ
                
                // インデックスエントリの初期化
                if (!index[token]) index[token] = new Set();
                index[token].add(idx);
                
                // より効率的なn-gramの生成と処理
                if (token.length > 3) { // 短すぎるトークンはn-gramを生成しない
                    const ngrams = generateNgrams(token, 2);
                    for (const ngram of ngrams) {
                        if (!index[ngram]) index[ngram] = new Set();
                        index[ngram].add(idx);
                    }
                }
            }
        }
        
        // 処理カウンタを更新
        processedCount = endIdx;
        
        // まだ処理すべき問題があれば、次のバッチを遅延実行
        if (processedCount < totalQuestions) {
            // 進捗レポート
            if (processedCount % 500 === 0) {
                console.log(`インデックス構築進捗: ${Math.round(processedCount/totalQuestions*100)}%`);
            }
            
            setTimeout(() => processIndexBatch(processedCount), 0);
        } else {
            // 全ての処理が終了したら、Set を Array に変換（一度だけ実行）
            for (const key in index) {
                if (index[key] instanceof Set) {
                    index[key] = Array.from(index[key]);
                }
            }
            
            searchIndex = index;
            console.log("検索インデックスの構築が完了しました");
        }
    }
    
    // 最初のバッチ処理を開始
    processIndexBatch(0);
    
    return index;
}

// フィルターと検索処理（検索インデックスを活用して候補を絞る）
function filterWords() {
    // 必要なDOM要素を一度だけ取得し再利用
    const searchbox = document.querySelector('.searchbox');
    if (!searchbox) return;
    
    const filterSelect = document.getElementById('answerFilter');
    if (!filterSelect) return;
    
    const wordList = document.getElementById('wordList');
    if (!wordList) return;
    
    // 変更検出フラグ - UIに変更が必要な場合のみ更新
    let needsUpdate = false;
    const lastSearchTerm = searchbox.getAttribute('data-last-search') || '';
    const lastFilter = searchbox.getAttribute('data-last-filter') || '';
    
    // 現在の検索条件
    const searchword = searchbox.value.toLowerCase().trim();
    const filterValue = filterSelect.value;
    
    // 検索条件に変更がなければ早期リターン
    if (searchword === lastSearchTerm && filterValue === lastFilter && searchword === '') {
        return;
    }
    
    // 今回の検索条件を保存
    searchbox.setAttribute('data-last-search', searchword);
    searchbox.setAttribute('data-last-filter', filterValue);
    needsUpdate = true;
    
    // リスト要素を取得（一度だけ）
    const lis = wordList.getElementsByTagName('li');
    if (lis.length === 0) return;
    
    // 検索バリエーションを事前計算（検索語がある場合のみ）
    let searchVariants = [];
    let candidateIndices = new Set();
    
    if (searchword) {
        // ローマ字→ひらがな変換（必要な場合のみ実行）
        const hiraganaSearch = /[a-zA-Z]/.test(searchword) ? convertRomajiToHiragana(searchword) : '';
        
        searchVariants = [
            searchword,
            hiraganaSearch,
            katakanaToHiragana(searchword),
            hiraganaToKatakana(searchword)
        ].filter(Boolean); // 空文字列を除去
        
        // 検索インデックス取得（すでに構築中なら構築中のものを使用）
        const index = buildSearchIndex();
        
        // 候補インデックスをまとめて抽出
        for (const variant of searchVariants) {
            // 完全一致キーワード
            if (index[variant]) {
                for (const i of index[variant]) {
                    candidateIndices.add(i);
                }
            }
            
            // 短い検索語の場合はn-gramは不要
            if (variant.length <= 2) continue;
            
            // n-gramによる部分一致
            const ngrams = generateNgrams(variant, 2);
            for (const ngram of ngrams) {
                if (index[ngram]) {
                    for (const i of index[ngram]) {
                        candidateIndices.add(i);
                    }
                }
            }
        }
    } else {
        // 検索語が空の場合は全件対象
        for (let i = 0; i < lis.length; i++) {
            candidateIndices.add(i);
        }
    }
    
    // 表示状態を追跡
    let visibleCount = 0;
    
    // リスト要素をバッチ処理（一度に最大100件）
    const processBatch = (startIdx, endIdx) => {
        for (let i = startIdx; i < Math.min(endIdx, lis.length); i++) {
            const li = lis[i];
            
            // 回答状態によるフィルタリング
            let showByFilter = true;
            if (filterValue !== 'all') {
                if (filterValue === 'unanswered') {
                    showByFilter = !answeredQuestions.has(i);
                } else if (filterValue === 'correct') {
                    showByFilter = questionStats.has(i) && questionStats.get(i).correctAnswers > 0;
                } else if (filterValue === 'incorrect') {
                    showByFilter = questionStats.has(i) && questionStats.get(i).isWrong;
                }
            }
            
            // 検索候補に含まれていない場合は非表示
            if (searchword && !candidateIndices.has(i)) {
                li.style.display = 'none';
                continue;
            }
            
            // フィルタリング条件に合わない場合は非表示
            if (!showByFilter) {
                li.style.display = 'none';
                continue;
            }
            
            // 検索語がある場合は検索スコアを計算
            if (searchword) {
                // タイトルと内容を一度だけ取得（キャッシュ）
                const titleElement = li.querySelector('.tangotitle');
                const contentElement = li.querySelector('.content');
                
                if (!titleElement || !contentElement) {
                    li.style.display = 'none';
                    continue;
                }
                
                const title = titleElement.textContent.toLowerCase();
                const content = contentElement.textContent.toLowerCase();
                
                let score = 0;
                
                // 効率的なスコア計算
                for (const variant of searchVariants) {
                    if (title.includes(variant) || content.includes(variant)) {
                        score = Math.max(score, variant === searchword ? 1.0 : 0.9);
                        break; // 最高スコアが見つかったら終了
                    }
                }
                
                // 類似度計算は他の方法で一致しなかった場合のみ実行
                if (score < 0.2) {
                    const titleSimilarity = calculateSimilarity(searchword, title);
                    const contentSimilarity = calculateSimilarity(searchword, content);
                    score = Math.max(titleSimilarity, contentSimilarity);
                }
                
                const showBySearch = score >= 0.2; // 類似度20%以上で表示
                
                if (showBySearch) {
                    li.style.display = 'block';
                    visibleCount++;
                } else {
                    li.style.display = 'none';
                }
            } else {
                // 検索語がなければ、フィルター条件のみで表示
                li.style.display = 'block';
                visibleCount++;
            }
        }
        
        // まだ処理すべき要素があれば次のバッチを遅延処理
        if (endIdx < lis.length) {
            setTimeout(() => processBatch(endIdx, endIdx + 100), 0);
        } else {
            // 全ての処理が完了したら
            completeBatchProcessing();
        }
    };
    
    // バッチ処理完了後の処理
    const completeBatchProcessing = () => {
        // 検索結果がない場合のメッセージ処理
        const noResultMsg = document.getElementById('noResultMessage');
        
        if (visibleCount === 0 && searchword) {
            if (!noResultMsg) {
                const msg = document.createElement('div');
                msg.id = 'noResultMessage';
                msg.textContent = '検索結果がありません';
                msg.className = 'no-result-message'; // クラスを使用してスタイルを適用
                wordList.parentNode.appendChild(msg);
            }
        } else if (noResultMsg) {
            noResultMsg.remove();
        }
        
        // 検索結果表示後に単語をクリック可能にする
        if (needsUpdate) {
            // UI更新によるちらつきを防ぐため、表示計算後にまとめてDOMを更新
            makeWordsClickable();
        }
    };
    
    // 初回バッチ処理を開始
    processBatch(0, 100);
}

// 初期化時およびスライダー変更時に単語をクリック可能にする
document.addEventListener('DOMContentLoaded', () => {
    // スワイパーのスライド変更イベントを監視
    if (typeof swiper !== 'undefined') {
        swiper.on('slideChangeTransitionEnd', () => {
            // 単語リストのスライドが表示された時
            if (swiper.activeIndex === 2) {
                setTimeout(() => {
                    makeWordsClickable();
                    filterWords(); // フィルターも初期表示する
                }, 200);
            }
        });
    }
    
    // 単語リスト初期表示時（ページ読み込み後すぐにフィルターを表示）
    setTimeout(() => {
        makeWordsClickable();
        filterWords(); // 検索フィルターをデフォルトで表示
    }, 1000);
});