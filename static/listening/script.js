// --- Swiper 初期化 ---
const swiper = new Swiper(".swiper-container", {
    direction: "horizontal",
    loop: false,
    initialSlide: 1, // 最初は問題画面 (slide2)
    navigation: {
        nextEl: ".swiper-button-next",
        prevEl: ".swiper-button-prev",
    },
    noSwiping: true, // 基本的にスワイプさせない
    noSwipingClass: "no-swiping",
    on: {
        slideChange: function () {
            // スライドが切り替わったら統計や履歴を更新
            if (this.activeIndex === 0) { // 統計画面
                updateStatsDisplay();
                updateChart();
            } else if (this.activeIndex === 2) { // 履歴画面
                populateHistoryList();
            }
        },
    },
});

// --- グローバル変数 ---
let words = []; // 単語リスト ( { word: "apple", description: "リンゴ" } )
let listeningHistory = []; // リスニング履歴
let currentQuestionData = null; // 現在の問題データ { word, sentence, audio, hint, templateHTML, blankInputId }
let currentIndex = 0; // 現在の単語インデックス
let totalCount = 0; // 挑戦回数
let correctCount = 0; // 正解数
let wrongCount = 0; // 不正解数
let currentStreak = 0; // 現在の連続正解数
let maxStreak = 0; // 最大連続正解数
let hintUsedCount = 0; // ヒント使用総回数
let hintShownForCurrentQuestion = false; // 現在の問題でヒント表示済みか
let performanceHistory = []; // 正解率の推移
let performanceChart = null; // 統計グラフ
let isLoading = false; // 問題ロード中フラグ
let isAnswered = false; // 現在の問題に回答済みか

// --- DOM要素キャッシュ ---
const instructionEl = document.getElementById('instruction');
const templateSentenceAreaEl = document.getElementById('template-sentence-area');
const playAudioBtn = document.getElementById('play-audio-btn');
const hintBtn = document.getElementById('hint-btn');
const hintDisplayEl = document.getElementById('hint-display');
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const feedbackAreaEl = document.getElementById('feedback-area');
const feedbackTextEl = document.getElementById('feedback-text');
const nextQuestionBtn = document.getElementById('next-question-btn');
const audioPlayer = document.getElementById('audioPlayer');
const scoreEl = document.getElementById('score');
// 統計表示用要素
const totalWordsEl = document.getElementById('total-words');
const attemptedQuestionsEl = document.getElementById('attempted-questions');
const correctAnswersEl = document.getElementById('correct-answers');
const wrongAnswersEl = document.getElementById('wrong-answers');
const progressPercentageEl = document.getElementById('progress-percentage');
const progressBarEl = document.getElementById('progress-bar');
const avgAccuracyEl = document.getElementById('avg-accuracy');
const maxStreakEl = document.getElementById('max-streak');
const currentStreakEl = document.getElementById('current-streak');
const hintUsedCountEl = document.getElementById('hint-used-count');
// 履歴表示用要素
const historyListEl = document.getElementById('historyList');
const historySearchBox = document.getElementById('historySearchBox');
const historyFilter = document.getElementById('historyFilter');
// 設定用要素
const randomModeRadio = document.getElementById('random-mode');
const sequentialModeRadio = document.getElementById('sequential-mode');
const autoPlayCheckbox = document.getElementById('auto-play-setting');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    MicroModal.init({
        awaitOpenAnimation: true,
        awaitCloseAnimation: true
    });
    loadSettings();
    // 単語リスト読み込み後に進捗読み込みと初期問題表示
    loadWordList()
        .then(() => {
            if (words.length > 0) {
                loadProgress(); // 学習進捗読み込み
                initializeChart();
                updateStatsDisplay(); // 統計表示更新
                selectInitialQuestion();
                showNextQuestion();
            } else {
                showError("単語リストの読み込みに失敗しました。ファイルを確認してください。");
            }
        })
        .catch(error => {
            console.error("Initialization error:", error);
            showError(`初期化エラー: ${error.message}`);
        });

    setupEventListeners();
});

// --- イベントリスナー設定 ---
function setupEventListeners() {
    playAudioBtn.addEventListener('click', playCurrentAudio);
    submitAnswerBtn.addEventListener('click', checkAnswer);
    hintBtn.addEventListener('click', showHint);
    nextQuestionBtn.addEventListener('click', showNextQuestion);

    // 設定ボタン
    document.getElementById('settings-btn').addEventListener('click', () => {
        MicroModal.show('settings-modal');
    });

    // 設定変更イベント
    randomModeRadio.addEventListener('change', saveSettings);
    sequentialModeRadio.addEventListener('change', saveSettings);
    autoPlayCheckbox.addEventListener('change', saveSettings);
    clearHistoryBtn.addEventListener('click', clearHistory);

    // 動的生成される入力欄でのEnterキー処理 (イベントデリゲーション)
    templateSentenceAreaEl.addEventListener('keypress', (e) => {
        if (e.target.tagName === 'INPUT' && e.key === 'Enter') {
            e.preventDefault(); // デフォルトのEnter挙動抑制
            checkAnswer();
        }
    });

    // 履歴フィルターと検索
    historySearchBox.addEventListener('input', filterHistory);
    historyFilter.addEventListener('change', filterHistory);
}

// --- 設定関連 ---
function loadSettings() {
    const mode = localStorage.getItem('listening_question_mode') || 'random';
    if (mode === 'sequential') {
        sequentialModeRadio.checked = true;
    } else {
        randomModeRadio.checked = true;
    }
    autoPlayCheckbox.checked = localStorage.getItem('listening_auto_play') === 'true';
}

function saveSettings() {
    const mode = sequentialModeRadio.checked ? 'sequential' : 'random';
    localStorage.setItem('listening_question_mode', mode);
    localStorage.setItem('listening_auto_play', autoPlayCheckbox.checked);
    console.log("Settings saved:", { mode, autoPlay: autoPlayCheckbox.checked });
}

// --- 学習進捗・履歴関連 ---
function loadProgress() {
    const savedHistory = localStorage.getItem('listening_history');
    if (savedHistory) {
        try {
            listeningHistory = JSON.parse(savedHistory);
        } catch (e) {
            console.error("Error parsing listening history:", e);
            listeningHistory = [];
        }
    }
    totalCount = parseInt(localStorage.getItem('listening_totalCount') || '0');
    correctCount = parseInt(localStorage.getItem('listening_correctCount') || '0');
    wrongCount = parseInt(localStorage.getItem('listening_wrongCount') || '0');
    maxStreak = parseInt(localStorage.getItem('listening_maxStreak') || '0');
    currentStreak = parseInt(localStorage.getItem('listening_currentStreak') || '0');
    currentIndex = parseInt(localStorage.getItem('listening_currentIndex') || '0');
    hintUsedCount = parseInt(localStorage.getItem('listening_hintUsedCount') || '0'); // ヒント回数復元
    const savedPerfHistory = localStorage.getItem('listening_performanceHistory');
     if (savedPerfHistory) {
         try {
             performanceHistory = JSON.parse(savedPerfHistory);
         } catch (e) { performanceHistory = []; }
     }
}

function saveProgress() {
    try {
        localStorage.setItem('listening_history', JSON.stringify(listeningHistory));
        localStorage.setItem('listening_totalCount', totalCount.toString());
        localStorage.setItem('listening_correctCount', correctCount.toString());
        localStorage.setItem('listening_wrongCount', wrongCount.toString());
        localStorage.setItem('listening_maxStreak', maxStreak.toString());
        localStorage.setItem('listening_currentStreak', currentStreak.toString());
        localStorage.setItem('listening_currentIndex', currentIndex.toString());
        localStorage.setItem('listening_hintUsedCount', hintUsedCount.toString()); // ヒント回数保存
        localStorage.setItem('listening_performanceHistory', JSON.stringify(performanceHistory));
    } catch (e) {
        console.error("Error saving progress to localStorage:", e);
        notie.alert({ type: 'warning', text: '学習履歴の保存に失敗。ストレージ容量を確認してください。', time: 3 });
    }
}

function clearHistory() {
    notie.confirm({
        text: '本当にすべての学習履歴と統計情報をクリアしますか？<br>この操作は元に戻せません。',
        submitText: 'はい、クリアします',
        cancelText: 'キャンセル',
        position: 'center',
        submitCallback: () => {
            listeningHistory = [];
            totalCount = 0;
            correctCount = 0;
            wrongCount = 0;
            currentStreak = 0;
            maxStreak = 0;
            currentIndex = 0;
            hintUsedCount = 0; // ヒント回数もクリア
            performanceHistory = [];

            // localStorage から関連データを削除
            const keysToRemove = [
                'listening_history', 'listening_totalCount', 'listening_correctCount',
                'listening_wrongCount', 'listening_maxStreak', 'listening_currentStreak',
                'listening_currentIndex', 'listening_hintUsedCount', 'listening_performanceHistory'
            ];
            keysToRemove.forEach(key => localStorage.removeItem(key));

            updateStatsDisplay();
            if (performanceChart) {
                 performanceChart.data.labels = [];
                 performanceChart.data.datasets[0].data = [];
                 performanceChart.update();
            }
            populateHistoryList();
            MicroModal.close('settings-modal');
            notie.alert({ type: 'success', text: '学習履歴をクリアしました。', time: 2 });
            // 最初の問題に戻る
            if (words.length > 0) {
                 selectInitialQuestion();
                 showNextQuestion();
            }
        }
    });
}

// --- 単語リスト読み込み ---
function getParam(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/\\/g, "\\\\").replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

async function loadWordList() {
    let mondai = getParam("id") || "default";
    mondai = mondai.replace(/[^a-zA-Z0-9_-]/g, ''); // 安全なファイル名に
    if (!mondai) mondai = 'default';

    const url = `../deta/${mondai}.txt`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) throw new Error(`単語リストファイルが見つかりません: ${url}`);
            throw new Error(`単語リスト読み込み失敗 (ステータス: ${response.status})`);
        }
        const text = await response.text();
        const lines = text.split('\n');
        words = lines
            .map(line => {
                const parts = line.trim().split('|');
                if (parts.length >= 1 && parts[0]) {
                    return { word: parts[0].trim(), description: parts[1] ? parts[1].trim() : "" };
                }
                return null;
            })
            .filter(item => item !== null && item.word !== ''); // 空の単語も除外

        totalWordsEl.textContent = words.length;
        console.log(`Loaded ${words.length} words from ${url}`);
        if (words.length === 0) {
            showError("単語リストが空、または正しく読み込めませんでした。");
        }

    } catch (error) {
        console.error('単語リスト読み込みエラー:', error);
        showError(`単語リスト「${mondai}.txt」読込失敗。<br>${error.message}`);
        words = [];
        totalWordsEl.textContent = 0;
    }
}

// --- 問題表示・進行 ---
function selectInitialQuestion() {
    const mode = sequentialModeRadio.checked ? 'sequential' : 'random';
    if (mode === 'sequential') {
        currentIndex = parseInt(localStorage.getItem('listening_currentIndex') || '0');
        if (currentIndex < 0 || currentIndex >= words.length) currentIndex = 0;
    } else {
        currentIndex = Math.floor(Math.random() * words.length);
    }
}

function selectNextQuestionIndex() {
    const mode = sequentialModeRadio.checked ? 'sequential' : 'random';
    let nextIndex;

    if (words.length <= 1) {
        nextIndex = 0;
    } else if (mode === 'sequential') {
        nextIndex = (currentIndex + 1) % words.length;
        if (nextIndex === 0 && totalCount >= words.length) {
             // notie.alert({ type: 'info', text: '単語リストを一周しました。', time: 2 });
        }
    } else {
        do {
            nextIndex = Math.floor(Math.random() * words.length);
        } while (nextIndex === currentIndex);
    }
    currentIndex = nextIndex;
    localStorage.setItem('listening_currentIndex', currentIndex.toString());
}

async function showNextQuestion() {
    if (isLoading || words.length === 0) return;
    isLoading = true;
    isAnswered = false;
    hintShownForCurrentQuestion = false;

    // UIリセット
    instructionEl.textContent = "音声データを準備中...";
    templateSentenceAreaEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // ローディング表示
    hintDisplayEl.style.display = 'none';
    hintDisplayEl.textContent = '';
    hintBtn.disabled = true;
    feedbackAreaEl.style.display = 'none';
    feedbackAreaEl.className = '';
    feedbackTextEl.innerHTML = '';
    nextQuestionBtn.style.display = 'none';
    playAudioBtn.disabled = true;
    playAudioBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 読込中';
    submitAnswerBtn.disabled = true;

    const targetWordData = words[currentIndex];
    const targetWord = targetWordData.word;

    try {
        const response = await fetch(`/api/listening/${encodeURIComponent(targetWord)}`);
        if (!response.ok) throw new Error(`API接続失敗 (${response.status})`);
        const data = await response.json();
        if (!data || !data.question || !data.audio) throw new Error("API応答データ不備");

        const sentence = data.question.trim();
        const blankInputId = `blank-input-${Date.now()}`; // ユニークなIDを生成

        // テンプレート文生成 (大文字小文字無視、単語境界考慮)
        const regex = new RegExp(`\\b${targetWord.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        let templateHTML = '';
        const match = sentence.match(regex); // マッチする部分を取得 (元の単語の形を保持するため)

        if (match) {
            // マッチした単語の箇所を input に置き換える
            templateHTML = sentence.replace(regex,
                `<input type="text" id="${blankInputId}" placeholder="_____" class="no-swiping answer-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="回答入力欄">`
            );
        } else {
            // 単語が見つからない場合のエラー処理
            console.warn(`単語 "${targetWord}" が文 "${sentence}" に見つかりません。`);
            templateSentenceAreaEl.innerHTML = `<span class="error-message">エラー: 問題文生成失敗。</span>`;
            throw new Error(`単語 "${targetWord}" が見つかりません`);
        }

        currentQuestionData = {
            word: match[0], // マッチした実際の単語を正解とする (大文字小文字維持)
            targetWord: targetWord, // リクエストした単語
            sentence: sentence,
            audio: data.audio,
            hint: match[0].length > 0 ? match[0].charAt(0) : '?',
            templateHTML: templateHTML,
            blankInputId: blankInputId
        };

        audioPlayer.src = `data:audio/mp3;base64,${currentQuestionData.audio}`;
        audioPlayer.load();

        // UI更新
        instructionEl.textContent = "音声を聞いて、空欄に入る単語を入力してください。";
        templateSentenceAreaEl.innerHTML = currentQuestionData.templateHTML;
        playAudioBtn.disabled = false;
        playAudioBtn.innerHTML = '<i class="fas fa-play"></i> 音声再生';
        submitAnswerBtn.disabled = false;
        hintBtn.disabled = false;

        const blankInput = document.getElementById(currentQuestionData.blankInputId);
        if (blankInput) blankInput.focus();

        if (autoPlayCheckbox.checked) {
            playCurrentAudio();
        }

    } catch (error) {
        console.error("問題取得/処理エラー:", error);
        // XSS対策：エラーメッセージをエスケープ
        const safeErrorMsg = escapeHtml(error.message);
        instructionEl.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i><p>問題の準備に失敗しました。<br>(${safeErrorMsg})<br>リロードするか管理者にお問い合わせください。</p></div>`;
        templateSentenceAreaEl.innerHTML = ''; // エラー時はクリア
        playAudioBtn.disabled = true;
        playAudioBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> エラー';
        submitAnswerBtn.disabled = true;
        hintBtn.disabled = true;
        currentQuestionData = null;
    } finally {
        isLoading = false;
    }
}

// --- 音声再生 ---
function playCurrentAudio() {
    if (currentQuestionData && currentQuestionData.audio) {
        audioPlayer.currentTime = 0;
        audioPlayer.play().catch(e => {
            console.error('音声再生エラー:', e);
            notie.alert({ type: 'error', text: '音声再生失敗。ブラウザ設定確認推奨。', time: 3 });
        });
    } else {
        console.warn("再生する音声データがありません。");
    }
}

function playHistoryAudio(base64Audio) {
     if (base64Audio) {
         // 既存の audioPlayer を使うか、新しいインスタンスを作るか
         // ここでは既存のものを流用（前の音声を止める必要あり）
         audioPlayer.pause();
         audioPlayer.src = `data:audio/mp3;base64,${base64Audio}`;
         audioPlayer.currentTime = 0;
         audioPlayer.play().catch(e => {
             console.error('履歴音声再生エラー:', e);
             notie.alert({ type: 'error', text: '音声再生失敗。', time: 2 });
         });
     }
}

// --- ヒント機能 ---
function showHint() {
    if (isLoading || isAnswered || !currentQuestionData || hintShownForCurrentQuestion) return;

    hintDisplayEl.textContent = `ヒント: ${currentQuestionData.hint}`; // 最初の文字
    hintDisplayEl.style.display = 'inline-block';
    hintBtn.disabled = true;
    hintShownForCurrentQuestion = true;

    hintUsedCount++;
    updateStatsDisplay();
    saveProgress(); // ヒント使用回数を保存
}

// --- 回答処理 ---
function checkAnswer() {
    if (isLoading || isAnswered || !currentQuestionData) return;

    const blankInput = document.getElementById(currentQuestionData.blankInputId);
    if (!blankInput) {
        console.error("回答入力欄が見つかりません。");
        return;
    }

    const userAnswer = blankInput.value.trim();
    if (!userAnswer) {
        notie.alert({ type: 'warning', text: '回答を入力してください。', time: 1.5 });
        return;
    }

    isAnswered = true;
    totalCount++;

    // 正誤判定 (APIから取得した元の単語(word)の大文字小文字を正とする)
    const correctAnswer = currentQuestionData.word;
    // 比較時は両方小文字にするのが一般的
    const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase();

    // フィードバック表示
    feedbackAreaEl.style.display = 'block';
    blankInput.disabled = true; // 入力欄を無効化
    if (isCorrect) {
        correctCount++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        feedbackAreaEl.className = 'correct';
        feedbackTextEl.innerHTML = `<i class="fas fa-check-circle"></i> 正解！`;
        blankInput.value = correctAnswer; // 正しい形で表示 (例: user=apple, answer=Apple -> Apple)
        blankInput.classList.add('correct');
    } else {
        wrongCount++;
        currentStreak = 0;
        feedbackAreaEl.className = 'incorrect';
        feedbackTextEl.innerHTML = `<i class="fas fa-times-circle"></i> 不正解... 正解は <strong>${correctAnswer}</strong> でした。`;
        blankInput.classList.add('incorrect');
        // ユーザーが入力した内容も表示したい場合
        // feedbackTextEl.innerHTML += `<br>あなたの回答: ${escapeHtml(userAnswer)}`;
    }

    // UI更新
    submitAnswerBtn.disabled = true;
    hintBtn.disabled = true;
    nextQuestionBtn.style.display = 'inline-block';
    nextQuestionBtn.focus();

    // 履歴に追加
    listeningHistory.unshift({ // 新しいものを先頭に追加
        word: correctAnswer,
        targetWord: currentQuestionData.targetWord, // リクエストした単語も記録
        sentence: currentQuestionData.sentence,
        userAnswer: userAnswer,
        isCorrect: isCorrect,
        audio: currentQuestionData.audio,
        timestamp: new Date().toISOString(),
        hintUsed: hintShownForCurrentQuestion
    });
    // 履歴が多すぎる場合、古いものから削除 (例: 500件まで)
    if (listeningHistory.length > 500) {
        listeningHistory.pop();
    }


    updateStatsDisplay();
    updateChart();
    saveProgress();
    selectNextQuestionIndex(); // 次の問題インデックスを決定
}

// --- 統計情報表示 ---
function updateStatsDisplay() {
    const attemptedWords = new Set(listeningHistory.map(item => item.targetWord.toLowerCase())); // 挑戦したユニークな単語数
    const attemptedCount = attemptedWords.size;
    const accuracy = totalCount === 0 ? 0 : (correctCount / totalCount) * 100;
    const progress = words.length === 0 ? 0 : (attemptedCount / words.length) * 100;

    totalWordsEl.textContent = words.length;
    attemptedQuestionsEl.textContent = attemptedCount;
    correctAnswersEl.textContent = correctCount;
    wrongAnswersEl.textContent = wrongCount;
    progressPercentageEl.textContent = progress.toFixed(1);
    progressBarEl.style.width = `${Math.min(progress, 100)}%`; // 100%超えないように
    avgAccuracyEl.textContent = accuracy.toFixed(1);
    maxStreakEl.textContent = maxStreak;
    currentStreakEl.textContent = currentStreak;
    hintUsedCountEl.textContent = hintUsedCount; // ヒント回数表示

    scoreEl.textContent = `挑戦: ${totalCount} 正解: ${correctCount} 不正解: ${wrongCount} 連続: ${currentStreak} 正答率: ${accuracy.toFixed(1)}%`;
}

// --- 統計グラフ ---
function initializeChart() {
    const ctx = document.getElementById('performance-chart').getContext('2d');
    if (performanceChart) performanceChart.destroy();
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: '正解率 (%)', data: [], borderColor: '#007bff', backgroundColor: 'rgba(0, 123, 255, 0.1)', tension: 0.1, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + "%" } }, x: { title: { display: true, text: '挑戦回数' } } }, plugins: { tooltip: { callbacks: { label: (c) => `挑戦${c.label}回目: 正解率 ${c.parsed.y.toFixed(1)}%` } } } }
    });
    updateChart(true); // 初期ロード
}

function updateChart(initialLoad = false) {
    if (!performanceChart) return;
    if (!initialLoad && totalCount > 0) {
        const accuracy = (correctCount / totalCount) * 100;
        performanceHistory.push(accuracy);
        if (performanceHistory.length > 100) performanceHistory.shift(); // 最新100件
    }
    performanceChart.data.labels = Array.from({ length: performanceHistory.length }, (_, i) => i + 1);
    performanceChart.data.datasets[0].data = performanceHistory;
    performanceChart.update();
}

// --- 履歴リスト表示 ---
function populateHistoryList() {
    historyListEl.innerHTML = ''; // リストクリア
    const searchTerm = historySearchBox.value.toLowerCase();
    const filterValue = historyFilter.value;

    const filteredHistory = listeningHistory.filter(item => {
        if (filterValue === 'correct' && !item.isCorrect) return false;
        if (filterValue === 'incorrect' && item.isCorrect) return false;
        if (filterValue === 'hint-used' && !item.hintUsed) return false; // ヒントフィルター
        if (searchTerm &&
            !item.sentence.toLowerCase().includes(searchTerm) &&
            !item.userAnswer.toLowerCase().includes(searchTerm) &&
            !item.word.toLowerCase().includes(searchTerm)) { // 正解単語も検索対象に
            return false;
        }
        return true;
    }); // .sort(...) は削除（unshiftで追加しているので元々新しい順）

    if (filteredHistory.length === 0) {
         historyListEl.innerHTML = '<li class="no-history" style="text-align: center; color: #6c757d; padding: 20px; background: none; box-shadow: none; border: none;">該当する履歴はありません。</li>';
         return;
    }

    filteredHistory.forEach(item => {
        const li = document.createElement('li');
        li.className = item.isCorrect ? 'correct' : 'incorrect';

        const resultIcon = item.isCorrect
            ? '<i class="fas fa-check" title="正解"></i>'
            : '<i class="fas fa-times" title="不正解"></i>';
        const hintIcon = item.hintUsed
            ? '<i class="fas fa-lightbulb hint-indicator" title="ヒント使用"></i>'
            : '';

        li.innerHTML = `
            <div class="history-item-content">
                <div class="history-text">
                    <div class="history-sentence">${highlightSearchTerm(escapeHtml(item.sentence), searchTerm)}</div>
                    <div class="history-answer ${item.isCorrect ? 'correct' : 'incorrect'}">
                        回答: <span>${highlightSearchTerm(escapeHtml(item.userAnswer), searchTerm)}</span> ${resultIcon}
                        (正解: ${highlightSearchTerm(escapeHtml(item.word), searchTerm)})
                    </div>
                    <div class="history-meta">
                        <span>${new Date(item.timestamp).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        ${hintIcon}
                    </div>
                </div>
                <div class="history-actions">
                    <button class="history-play-btn" title="音声を再生" onclick="playHistoryAudio('${item.audio}')">
                        <i class="fas fa-volume-up"></i>
                    </button>
                </div>
            </div>
        `;
        historyListEl.appendChild(li);
    });
}

function filterHistory() {
    populateHistoryList();
}

// --- ユーティリティ ---
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// 検索語をハイライトする関数 (簡易版)
function highlightSearchTerm(text, term) {
    if (!term || typeof text !== 'string') {
        return text;
    }
    const escapedTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}


function showError(message) {
    // 既存のエラー表示に加え、メインエリアにも表示
    const mainArea = document.querySelector('.slide2 .main');
    // XSS対策：メッセージをエスケープ
    const safeMessage = escapeHtml(message);
    if (mainArea) {
        mainArea.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i><p>${safeMessage}</p></div>`;
    } else { // フォールバック
        instructionEl.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i><p>${safeMessage}</p></div>`;
    }
    // 操作ボタンを無効化
    playAudioBtn.disabled = true;
    submitAnswerBtn.disabled = true;
    hintBtn.disabled = true;
}

// --- グローバルアクセス可能にする関数 ---
window.playHistoryAudio = playHistoryAudio;
window.filterHistory = filterHistory;

// HTML特殊文字をエスケープする関数（XSS対策）
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}