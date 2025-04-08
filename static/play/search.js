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
        const response = await fetch(`/api/search/word/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ word: word, mondai: mondaibun})
        });
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
    const text = node.nodeValue;
    const parent = node.parentNode;
    
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

// 検索インデックスを構築する関数
function buildSearchIndex() {
    if (searchIndex) return searchIndex; // すでに構築済みならそれを返す

    console.log("検索インデックスを構築中...");
    const index = {};

    questions.forEach((question, idx) => {
        // 検索対象のテキスト（環境によって条件分岐）
        const title = isItpass ? question.description : question.word;
        const content = isItpass ? question.kaisetu : question.description;

        // 単語のトークン化（小文字変換）
        const titleTokens = title.toLowerCase().split(/\s+/);
        const contentTokens = content.toLowerCase().split(/\s+/);

        [...titleTokens, ...contentTokens].forEach(token => {
            if (token.length < 2) return; // 短すぎる単語はスキップ

            if (!index[token]) index[token] = new Set();
            index[token].add(idx);

            // 2-gramのインデックス化
            const ngrams = generateNgrams(token, 2);
            ngrams.forEach(ngram => {
                if (!index[ngram]) index[ngram] = new Set();
                index[ngram].add(idx);
            });
        });
    });

    // Set を Array に変換して最終化
    Object.keys(index).forEach(key => {
        index[key] = Array.from(index[key]);
    });

    searchIndex = index;
    console.log("検索インデックスの構築が完了しました");
    return index;
}

// フィルターと検索処理（検索インデックスを活用して候補を絞る）
function filterWords() {
    const searchbox = document.querySelector('.searchbox');
    if (!searchbox) return;
    const searchword = searchbox.value.toLowerCase().trim();

    // フィルターUI要素の取得または作成
    let filterSelect = document.getElementById('answerFilter');
    if (!filterSelect) {
        const searchboxParent = searchbox.parentElement;
        const filterDiv = document.createElement('div');
        filterDiv.className = 'filter-options';
        filterDiv.style.margin = '10px 0';

        filterSelect = document.createElement('select');
        filterSelect.id = 'answerFilter';
        filterSelect.style.padding = '8px 10px';
        filterSelect.style.borderRadius = '3px';
        filterSelect.style.border = '1px solid #969da3';
        filterSelect.style.marginRight = '10px';
        filterSelect.style.width = '45%';

        const options = [
            { value: 'all', text: 'すべての問題' },
            { value: 'unanswered', text: '未回答の問題' },
            { value: 'correct', text: '正解した問題' },
            { value: 'incorrect', text: '間違えた問題' }
        ];

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            filterSelect.appendChild(option);
        });

        filterDiv.appendChild(filterSelect);
        searchboxParent.insertBefore(filterDiv, searchbox.nextSibling);

        filterSelect.addEventListener('change', filterWords);
    }

    const filterValue = filterSelect.value; // フィルター値

    // ローマ字→ひらがな変換
    const hiraganaSearch = convertRomajiToHiragana(searchword);

    // 検索インデックス構築（初回のみ）
    const index = buildSearchIndex();

    const wordList = document.getElementById('wordList');
    if (!wordList) return;
    const lis = wordList.getElementsByTagName('li');

    // 事前に候補インデックスを抽出（検索語がある場合のみ）
    let candidateIndices = new Set();
    if (searchword) {
        const searchVariants = [
            searchword,
            hiraganaSearch,
            katakanaToHiragana(searchword),
            hiraganaToKatakana(searchword)
        ];
        searchVariants.forEach(variant => {
            if (index[variant]) {
                index[variant].forEach(i => candidateIndices.add(i));
            }
            // variant の2-gramからも候補を追加
            generateNgrams(variant, 2).forEach(ngram => {
                if (index[ngram]) {
                    index[ngram].forEach(i => candidateIndices.add(i));
                }
            });
        });
    } else {
        // 検索語が空の場合は全件対象
        for (let i = 0; i < lis.length; i++) {
            candidateIndices.add(i);
        }
    }

    // 検索結果の関連度を格納する配列（ハイライト等に利用可能）
    const resultScores = [];

    // 各リスト項目について処理
    for (let i = 0; i < lis.length; i++) {
        const li = lis[i];
        const title = li.querySelector('.tangotitle').textContent.toLowerCase();
        const content = li.querySelector('.content').textContent.toLowerCase();

        // 回答状態によるフィルタリング（グローバル変数 answeredQuestions, questionStats を使用）
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

        // 検索語がある場合、候補に含まれていなければ非表示
        if (searchword && !candidateIndices.has(i)) {
            li.style.display = 'none';
            continue;
        }

        // 検索ロジック（従来の条件を踏襲）
        let score = 0;
        if (title.includes(searchword) || content.includes(searchword)) {
            score = 1.0;
        } else if (title.includes(hiraganaSearch) || content.includes(hiraganaSearch)) {
            score = 0.9;
        } else if (title.includes(katakanaToHiragana(searchword)) ||
            content.includes(katakanaToHiragana(searchword))) {
            score = 0.8;
        } else if (title.includes(hiraganaToKatakana(searchword)) ||
            content.includes(hiraganaToKatakana(searchword))) {
            score = 0.8;
        } else {
            const titleSimilarity = calculateSimilarity(searchword, title);
            const contentSimilarity = calculateSimilarity(searchword, content);
            score = Math.max(titleSimilarity, contentSimilarity);
        }

        const showBySearch = score >= 0.2; // 類似度20%以上で表示
        li.style.display = (showBySearch && showByFilter) ? 'block' : 'none';

        if (showBySearch && showByFilter) {
            resultScores.push({ index: i, score: score });
        }
    }

    // 検索結果がない場合のメッセージ処理
    const noResultMsg = document.getElementById('noResultMessage');
    if (resultScores.length === 0 && searchword) {
        if (!noResultMsg) {
            const msg = document.createElement('div');
            msg.id = 'noResultMessage';
            msg.textContent = '検索結果がありません';
            msg.style.marginTop = '20px';
            msg.style.textAlign = 'center';
            msg.style.color = '#999';
            wordList.parentNode.appendChild(msg);
        }
    } else if (noResultMsg) {
        noResultMsg.remove();
    }
    
    // 検索結果表示後に単語をクリック可能にする
    setTimeout(makeWordsClickable, 100);
}

// 初期化時およびスライダー変更時に単語をクリック可能にする
document.addEventListener('DOMContentLoaded', () => {
    // スワイパーのスライド変更イベントを監視
    if (typeof swiper !== 'undefined') {
        swiper.on('slideChangeTransitionEnd', () => {
            // 単語リストのスライドが表示された時
            if (swiper.activeIndex === 2) {
                setTimeout(makeWordsClickable, 200);
            }
        });
    }
    
    // 単語リスト初期表示時
    setTimeout(makeWordsClickable, 1000);
});
