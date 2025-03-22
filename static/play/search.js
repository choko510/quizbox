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
    return str.replace(/([\u3041-\u3096])/g, match =>
        String.fromCharCode(match.charCodeAt(0) + 0x60)
    );
}

// カタカナ→ひらがな変換関数
function katakanaToHiragana(str) {
    return str.replace(/([\u30A1-\u30F6])/g, match =>
        String.fromCharCode(match.charCodeAt(0) - 0x60)
    );
}

// N-gramジェネレーター関数（変更なし）
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

// 検索インデックスを構築する関数（互換性はそのまま）
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
            // ※必要に応じて、一致部分のハイライト処理をここで追加可能
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
}