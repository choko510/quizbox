document.addEventListener('DOMContentLoaded', function() {
    // 状態管理
    let currentIndex = 0;
    let cards = [];
    let isFlipped = false;
    let audioCache = {}; // 音声データのキャッシュ
    let exampleCache = {}; // 例文のキャッシュ
    let settings = loadSettings(); // 設定の読み込み
    let learningStates = {}; // 学習状態の追跡 {cardIndex: 'not_learned'|'learning'|'learned'}
    let problemSetInfo = {}; // 問題セット情報
    let displayableIndices = []; // フィルタリング後に表示するカードのインデックス
    let currentDisplayIndex = 0; // displayableIndices 内での現在のインデックス
    let isDragging = false; // ドラッグ中かどうか
    let dragDirection = null; // ドラッグの方向（'left'、'right'、'down'、または null）
    let isActionInProgress = false; // アクション処理中フラグ

    // ローカルストレージから学習状態を読み込む関数
    function loadLearningStates() {
        const storageKey = `flashcardLearningState_${problemSetInfo.id}`;
        try {
            const savedStates = localStorage.getItem(storageKey);
            return savedStates ? JSON.parse(savedStates) : {};
        } catch (error) {
            console.error('学習状態の読み込みエラー:', error);
            return {};
        }
    }

    // 学習状態をローカルストレージに保存する関数
    function persistLearningStates() {
        const storageKey = `flashcardLearningState_${problemSetInfo.id}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify(learningStates));
        } catch (error) {
            console.error('学習状態の保存エラー:', error);
        }
    }

    // DOM要素
    // DOM要素
    const flashcardElement = document.getElementById('flashcard'); // 変数名を変更
    const checkmarkOverlay = document.getElementById('checkmark-overlay'); // 追加
    const wordContent = document.getElementById('word-content');
    const meaningContent = document.getElementById('meaning-content');
    const exampleSection = document.getElementById('example-section');
    const exampleContent = document.getElementById('example-content');
    const currentIndexDisplay = document.getElementById('current-index');
    const totalCardsDisplay = document.getElementById('total-cards');
    const progressFill = document.getElementById('progress-fill');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const flipBtn = document.getElementById('flip-btn');
    const pronunciationBtn = document.getElementById('pronunciation-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettingsBtn = document.getElementById('close-settings');
    const overlay = document.getElementById('overlay');
    const swipeIndicators = document.getElementById('swipe-indicators');
    const swipeLeftIndicator = document.getElementById('swipe-left');
    const swipeRightIndicator = document.getElementById('swipe-right');
    const swipeDownIndicator = document.getElementById('swipe-down');
    
    // 設定チェックボックス要素
    const autoPronunciationCheckbox = document.getElementById('auto-pronunciation');
    const showExamplesCheckbox = document.getElementById('show-examples');
    const filterReviewCheckbox = document.getElementById('filter-review');
    // 新しい設定要素
    const autoNextLearnedCheckbox = document.getElementById('auto-next-learned');
    const autoFlipNotLearnedCheckbox = document.getElementById('auto-flip-not-learned');
    const autoNextLearningCheckbox = document.getElementById('auto-next-learning');
    const enableAnimationsCheckbox = document.getElementById('enable-animations');
    // リスト関連要素
    const listSection = document.getElementById('list-section');
    const toggleListBtn = document.getElementById('toggle-list-btn');
    const tabBtns = document.querySelectorAll('.list-tabs .tab-btn');
    const wordListElement = document.getElementById('word-list');
    const countAll = document.getElementById('count-all');
    const countNotLearned = document.getElementById('count-not_learned');
    const countLearning = document.getElementById('count-learning');
    const countLearned = document.getElementById('count-learned');
    let currentListTab = 'all'; // 現在選択中のタブ
    let isListExpanded = false; // リストの展開状態
    
    // リストフィルター関連要素
    const filterNotLearnedCheckbox = document.getElementById('filter-not-learned');
    const filterLearningCheckbox = document.getElementById('filter-learning');
    const filterLearnedCheckbox = document.getElementById('filter-learned');
    const applyFilterBtn = document.getElementById('apply-filter');
    let activeFilters = {
        not_learned: true,
        learning: true,
        learned: true
    }; // デフォルトではすべてのフィルターを有効に
    
    // 学習状態ボタン
    const notLearnedBtn = document.getElementById('not-learned-btn');
    const learningBtn = document.getElementById('learning-btn');
    const learnedBtn = document.getElementById('learned-btn');

    // 設定の初期化
    initializeSettings();
    
    // フィルターの初期化
    initializeFilterCheckboxes();
    
    // スワイプインジケーターを常に表示
    swipeIndicators.classList.add('active');

    // Hammerを使ってスワイプ検出を設定
    const hammer = new Hammer(flashcardElement);
    hammer.get('swipe').set({
        direction: Hammer.DIRECTION_ALL,
        threshold: 10,   // 閾値を小さくして感度アップ
        velocity: 0.3    // 速度の閾値を下げて検知しやすく
    });
    hammer.get('pan').set({
        direction: Hammer.DIRECTION_ALL,
        threshold: 5,    // より小さな動きから検知
        pointers: 1      // 1本指でのパン操作のみ
    });
    hammer.on('swipeleft swiperight swipeup swipedown', handleSwipe);
    hammer.on('panstart panmove panend pancancel', handlePan);

    // URLからパラメータを取得する関数
    function getParam(name) {
        const url = new URL(window.location.href);
        return url.searchParams.get(name);
    }

    // 問題セットのIDを取得
    const problemSetId = getParam('id');
    const userId = getParam('userid');
    const problemName = getParam('name');
    
    // 実際の問題セットIDを決定
    problemSetInfo.id = problemName || problemSetId || 'target1200';
    problemSetInfo.owner = userId || 'system';
    
    // ユーザー情報を取得
    const currentUser = getCookieValue('id');
    const currentPassword = getCookieValue('password');

    // ページタイトルの更新
    updatePageTitle();
    
    // Cookieから値を取得する関数
    function getCookieValue(name) {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(name + '=')) {
                return cookie.substring(name.length + 1);
            }
        }
        return null;
    }

    // APIエンドポイントを決定
    let apiUrl;
    if (userId && problemName) {
        apiUrl = `/api/get/mondai/${userId}/${problemName}.json`;
    } else if (problemSetId) {
        apiUrl = `/api/get/mondai/${problemSetId}.json`;
    } else {
        // デフォルトの問題セット
        apiUrl = `/api/get/mondai/target1200.json`;
    }

    // 開始と終了の問題番号を取得（存在する場合）
    const startNum = parseInt(getParam("start")) || null;
    const endNum = parseInt(getParam("end")) || null;
    
    // 範囲指定がある場合はURLにパラメータを追加
    if (startNum !== null && endNum !== null) {
        apiUrl += `?start=${startNum - 1}&end=${endNum}`;
    }

    // カードデータを取得
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('問題データの取得に失敗しました');
            }
            return response.json();
        })
        .then(data => {
            if (Array.isArray(data) && typeof data[0] === 'object' && 'word' in data[0]) {
                // カスタム問題形式の場合（オブジェクト配列）
                cards = data;
            } else if (Array.isArray(data) && typeof data[0] === 'string') {
                // 標準問題形式の場合（文字列配列）
                cards = data.map(item => {
                    const parts = item.split('|');
                    return {
                        word: parts[0],
                        description: parts[1] || ''
                    };
                });
            } else {
                throw new Error('未対応の問題データ形式です');
            }
            
            // カード総数を表示
            totalCardsDisplay.textContent = cards.length;
            updateProgressBar();
            
            // 学習状態を読み込む
            learningStates = loadLearningStates();

            // 表示フィルターを初期化・適用
            updateDisplayFilter();

            // 最初のカードを表示 (フィルター適用後)
            if (displayableIndices.length > 0) {
                currentDisplayIndex = 0;
                currentIndex = displayableIndices[currentDisplayIndex];
                showCard(currentIndex);
            } else {
                // 表示できるカードがない場合の処理
                wordContent.textContent = '表示できるカードがありません';
                meaningContent.textContent = 'フィルター条件を確認してください。';
                currentIndexDisplay.textContent = 0;
                totalCardsDisplay.textContent = cards.length; // 全体の数は表示
                progressFill.style.width = '0%';
            }

            // 初期リスト表示
            updateWordList();
        })
        .catch(error => {
            console.error('エラー:', error);
            wordContent.textContent = 'エラーが発生しました';
            meaningContent.textContent = error.message;
        });

    // 設定の初期化
    function initializeSettings() {
        // 表示設定のチェックボックスを初期化
        autoPronunciationCheckbox.checked = settings.autoPronunciation;
        showExamplesCheckbox.checked = settings.showExamples;
        filterReviewCheckbox.checked = settings.filterReview;
        
        // ボタン動作設定のチェックボックスを初期化
        autoNextLearnedCheckbox.checked = settings.autoNextLearned;
        autoFlipNotLearnedCheckbox.checked = settings.autoFlipNotLearned;
        autoNextLearningCheckbox.checked = settings.autoNextLearning;
        
        // フィードバック設定のチェックボックスを初期化
        enableAnimationsCheckbox.checked = settings.enableAnimations;
        
        // Tinderスワイプモードは常に有効
        
        // アニメーション設定を適用
        if (settings.enableAnimations) {
            document.body.classList.add('enhanced-feedback');
        } else {
            document.body.classList.remove('enhanced-feedback');
        }
        
        // 例文表示の設定を適用
        if (settings.showExamples) {
            exampleSection.style.display = 'block';
        } else {
            exampleSection.style.display = 'none';
        }
        
        // 表示設定のイベントリスナー
        autoPronunciationCheckbox.addEventListener('change', function() {
            settings.autoPronunciation = this.checked;
            saveSettings();
        });
        
        showExamplesCheckbox.addEventListener('change', function() {
            settings.showExamples = this.checked;
            exampleSection.style.display = this.checked ? 'block' : 'none';
            saveSettings();
        });

        // 復習フィルターのイベントリスナーを追加
        filterReviewCheckbox.addEventListener('change', function() {
            settings.filterReview = this.checked;
            saveSettings();
            updateDisplayFilter(); // フィルターを更新して再表示
            // フィルター適用後の最初のカードを表示
            if (displayableIndices.length > 0) {
                currentDisplayIndex = 0;
                currentIndex = displayableIndices[currentDisplayIndex];
                showCard(currentIndex);
            } else {
                 wordContent.textContent = '表示できるカードがありません';
                 meaningContent.textContent = 'フィルター条件を確認してください。';
                 currentIndexDisplay.textContent = 0;
                 progressFill.style.width = '0%';
            }
        });
        
        // ボタン動作設定のイベントリスナー
        autoNextLearnedCheckbox.addEventListener('change', function() {
            settings.autoNextLearned = this.checked;
            saveSettings();
        });
        
        autoFlipNotLearnedCheckbox.addEventListener('change', function() {
            settings.autoFlipNotLearned = this.checked;
            saveSettings();
        });
        
        autoNextLearningCheckbox.addEventListener('change', function() {
            settings.autoNextLearning = this.checked;
            saveSettings();
        });
        
        // フィードバック設定のイベントリスナー
        enableAnimationsCheckbox.addEventListener('change', function() {
            settings.enableAnimations = this.checked;
            if (this.checked) {
                document.body.classList.add('enhanced-feedback');
            } else {
                document.body.classList.remove('enhanced-feedback');
            }
            saveSettings();
        });
        
        // Tinderスワイプモードは常に有効なので設定は不要
    }
    
    // カードのドラッグ状態をリセットする関数
    function resetCardDragState() {
        isDragging = false;
        dragDirection = null;
        
        // トランスフォームリセット（直接スタイルと一時的なクラスをクリア）
        flashcardElement.style.transform = '';
        flashcardElement.style.transition = ''; // 追加：トランジションスタイルをリセット
        flashcardElement.style.boxShadow = ''; // 追加：ボックスシャドウをリセット
        
        // すべてのドラッグ関連クラスを確実に削除
        flashcardElement.classList.remove('dragging', 'dragging-left', 'dragging-right', 'dragging-down');
        flashcardElement.classList.remove('swiped-left', 'swiped-right', 'swiped-down');
        flashcardElement.classList.remove('return-to-center');
        
        // インジケーターをリセット
        swipeLeftIndicator.classList.remove('visible');
        swipeRightIndicator.classList.remove('visible');
        swipeDownIndicator.classList.remove('visible');
        
        // めくり状態の確認と修正
        if (isFlipped) {
            // 裏側の場合、めくり状態を正確に維持
            flashcardElement.classList.add('flipped');
        } else {
            // 表側の場合、めくり状態をクリア
            flashcardElement.classList.remove('flipped');
        }
    }

    // 設定の読み込み
    function loadSettings() {
        const defaultSettings = {
            // 表示設定
            autoPronunciation: false,
            showExamples: false,
            filterReview: false,
            
            // ボタン動作設定
            autoNextLearned: true,    // 「覚えた」後に次へ進む
            autoFlipNotLearned: true, // 「まだ」後にカードをめくる
            autoNextLearning: false,  // 「復習」後に次へ進む
            
            // フィードバック設定
            enableAnimations: true    // 視覚効果を強化
        };
        
        try {
            const savedSettings = localStorage.getItem('flashcardSettings');
            return savedSettings ? {...defaultSettings, ...JSON.parse(savedSettings)} : defaultSettings;
        } catch (error) {
            console.error('設定の読み込みエラー:', error);
            return defaultSettings;
        }
    }

    // 設定の保存
    function saveSettings() {
        try {
            localStorage.setItem('flashcardSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('設定の保存エラー:', error);
        }
    }

    // ページタイトルの更新
    function updatePageTitle() {
        let title = '単語帳モード';
        if (problemName) {
            title += ` - ${problemName}`;
        } else if (problemSetId) {
            title += ` - ${problemSetId}`;
        }
        
        document.title = title;
    }

    // プログレスバーの更新 (フィルター考慮)
    function updateProgressBar() {
        const totalDisplayable = displayableIndices.length;
        if (totalDisplayable > 0) {
            // displayableIndices 内での現在の位置に基づいてプログレスを計算
            const progress = ((currentDisplayIndex + 1) / totalDisplayable) * 100;
            progressFill.style.width = `${progress}%`;
            // 表示インデックスもフィルター後のものに合わせる
            currentIndexDisplay.textContent = currentDisplayIndex + 1;
            totalCardsDisplay.textContent = totalDisplayable;
        } else {
            progressFill.style.width = '0%';
            currentIndexDisplay.textContent = 0;
            totalCardsDisplay.textContent = 0;
        }
    }

    // カードを表示する関数 - アニメーション強化
    async function showCard(index) {
        // 注意: この関数はフィルタリング後の index (currentIndex) を受け取る
        if (displayableIndices.length === 0 || index === undefined || cards[index] === undefined) {
             console.warn("showCard called with invalid index or no displayable cards:", index);
             return;
        }
        
        // 新しいカードアニメーション用クラスを一旦削除
        flashcardElement.classList.remove('new-card-animation');
        
        const card = cards[index];
        wordContent.textContent = card.word || '';
        meaningContent.textContent = card.description || '';
        updateProgressBar(); // プログレスバー更新（フィルター考慮済み）
        
        // カードをリセット（裏返っていたら表に戻す）
        if (isFlipped) {
            flashcardElement.classList.remove('flipped');
            isFlipped = false;
            
            // めくった後の遅延を追加して視覚的に分かりやすく
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 学習状態ボタンの更新
        updateLearningStatusButtons(index);
        
        // 新しいカード表示時のアニメーション
        // アニメーションを実行するため少し遅延させる
        setTimeout(() => {
            flashcardElement.classList.add('new-card-animation');
        }, 50);
        
        // 例文生成（非同期処理）
        generateExampleIfNeeded(card.word);
        
        // 自動発音設定が有効な場合
        if (settings.autoPronunciation) {
            setTimeout(() => {
                playPronunciation(card.word);
            }, 600); // カードが表示されてから少し遅らせて再生
        }
    }
    // 例文を取得する関数
    async function fetchExamples(word) {
        // キャッシュに例文がある場合はそれを返す
        if (exampleCache[word]) {
            console.log(`Using cached examples for: ${word}`);
            return exampleCache[word];
        }
        
        try {
            const response = await fetch('/api/get/sentences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ words: [word] }),
            });
            
            if (!response.ok) {
                throw new Error('例文の取得に失敗しました');
            }
            
            const data = await response.json();
            const examples = data.results[word] || [];
            
            // キャッシュに保存
            exampleCache[word] = examples;
            
            return examples;
        } catch (error) {
            console.error('例文取得エラー:', error);
            return [];
        }
    }

    // 例文を生成して表示する関数
    async function generateExampleIfNeeded(word) {
        if (settings.showExamples) {
            // 例文をクリア
            exampleContent.innerHTML = '<div class="loading-examples">例文を読み込み中...</div>';
            
            // APIから例文を取得
            const examples = await fetchExamples(word);
            
            if (examples.length > 0) {
                exampleContent.innerHTML = '';
                
                // 例文を表示
                examples.forEach((example, index) => {
                    const exampleDiv = document.createElement('div');
                    exampleDiv.classList.add('example-item');
                    exampleDiv.textContent = example;
                    exampleContent.appendChild(exampleDiv);
                    
                    // 区切り線を追加（最後の項目以外）
                    if (index < examples.length - 1) {
                        const divider = document.createElement('hr');
                        divider.classList.add('example-divider');
                        exampleContent.appendChild(divider);
                    }
                });
            } else {
                exampleContent.textContent = `「${word}」の例文が見つかりませんでした。`;
            }
        }
    }

    // 発音を再生する関数
    function playPronunciation(word) {
        // 既にキャッシュされているか確認
        if (audioCache[word]) {
            audioCache[word].play();
            return;
        }
        
        // 発音ボタンの状態を更新
        pronunciationBtn.classList.add('pulse');
        
        // APIから音声を取得して再生
        fetch(`/api/gen/speak/${encodeURIComponent(word)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('音声の取得に失敗しました');
                }
                return response.blob();
            })
            .then(blob => {
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                
                // キャッシュに保存
                audioCache[word] = audio;
                
                // 再生
                audio.play();
                
                // 再生終了時にアニメーションを停止
                audio.onended = function() {
                    pronunciationBtn.classList.remove('pulse');
                };
            })
            .catch(error => {
                console.error('音声再生エラー:', error);
                pronunciationBtn.classList.remove('pulse');
            });
    }

    // 次のカードに進む (フィルター考慮)
    function nextCard() {
        if (displayableIndices.length === 0) return;
        
        if (currentDisplayIndex < displayableIndices.length - 1) {
            currentDisplayIndex++;
        } else {
            currentDisplayIndex = 0; // 最初に戻る
        }
        currentIndex = displayableIndices[currentDisplayIndex];
        showCard(currentIndex);
        
        // 次のカードの例文を先取り読み込み
        preloadNextCardExamples();
    }
    
    // 次のカードの例文を先取り読み込む
    function preloadNextCardExamples() {
        if (displayableIndices.length <= 1 || !settings.showExamples) return; // カードが1枚以下または例文表示設定がオフなら不要
        
        // 次のカードのインデックスを計算
        let nextDisplayIndex = currentDisplayIndex < displayableIndices.length - 1 ?
                               currentDisplayIndex + 1 : 0;
        let nextIndex = displayableIndices[nextDisplayIndex];
        
        // 次のカードの単語
        const nextWord = cards[nextIndex]?.word;
        
        // 単語があり、かつキャッシュにない場合は先読み
        if (nextWord && !exampleCache[nextWord]) {
            console.log(`Preloading examples for next card: ${nextWord}`);
            fetchExamples(nextWord).catch(error => {
                // エラーは無視（表示されるときに再試行される）
                console.log(`Preload failed: ${error.message}`);
            });
        }
    }

    // 前のカードに戻る (フィルター考慮)
    function prevCard() {
        if (displayableIndices.length === 0) return;

        if (currentDisplayIndex > 0) {
            currentDisplayIndex--;
        } else {
            currentDisplayIndex = displayableIndices.length - 1; // 最後に行く
        }
        currentIndex = displayableIndices[currentDisplayIndex];
        showCard(currentIndex);
    }

    // カードをめくる - 改良版
    function flipCard() {
        if (isDragging) return; // ドラッグ中はめくり操作を防止
        
        // めくる前に一瞬の遅延を入れてアニメーションを強化
        if (!isFlipped) {
            // 表から裏へめくる場合
            flashcardElement.style.transition = 'transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            flashcardElement.classList.add('flipped');
            
            // 発音ボタンを非表示にするアニメーション
            if (pronunciationBtn) {
                pronunciationBtn.style.transition = 'opacity 0.3s ease-out';
                pronunciationBtn.style.opacity = '0';
            }
        } else {
            // 裏から表へめくる場合
            flashcardElement.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.175)';
            flashcardElement.classList.remove('flipped');
            
            // 発音ボタンを表示するアニメーション
            if (pronunciationBtn) {
                setTimeout(() => {
                    pronunciationBtn.style.transition = 'opacity 0.3s ease-in';
                    pronunciationBtn.style.opacity = '1';
                }, 300); // めくり始めてから表示
            }
        }
        
        isFlipped = !isFlipped;
        
        // トランジションをリセット（後で他のトランジションの邪魔をしないように）
        setTimeout(() => {
            flashcardElement.style.transition = '';
        }, 800);
    }

    // スワイプ処理
    function handleSwipe(event) {
        // カードがめくられている場合は、まずめくり戻す
        if (isFlipped && event.type !== 'swipeup') {
            flipCard(); // カードを表側に戻す
            setTimeout(() => {
                // 少し遅延してからスワイプ操作を処理
                handleSwipeAction(event.type);
            }, 300); // カードをめくるアニメーションの時間に合わせる
        } else {
            // カードが表側の場合、直接処理
            handleSwipeAction(event.type);
        }
        
        // スワイプアクションを処理する内部関数
        function handleSwipeAction(swipeType) {
            if (isActionInProgress) return; // 処理中の場合は何もしない
            isActionInProgress = true;

            switch(swipeType) {
                case 'swipeleft':
                    // 左スワイプ: 「覚えた」
                    flashcardElement.classList.add('swiped-left');
                    setTimeout(() => {
                        saveLearningState(currentIndex, 'learned');
                        resetCardDragState();
                        // 次のカードを表示（自動設定のため saveLearningState 内の処理に任せる）
                        isActionInProgress = false;
                    }, 300);
                    break;
                case 'swiperight':
                    // 右スワイプ: 「復習」
                    flashcardElement.classList.add('swiped-right');
                    setTimeout(() => {
                        saveLearningState(currentIndex, 'learning');
                        resetCardDragState();
                        // 次のカードを表示（自動設定のため saveLearningState 内の処理に任せる）
                        isActionInProgress = false;
                    }, 300);
                    break;
                case 'swipedown':
                    // 下スワイプ: 「まだ」
                    flashcardElement.classList.add('swiped-down');
                    setTimeout(() => {
                        saveLearningState(currentIndex, 'not_learned');
                        resetCardDragState();
                        // 次のカードを表示（自動設定のため saveLearningState 内の処理に任せる）
                        isActionInProgress = false;
                    }, 300);
                    break;
                case 'swipeup':
                    // 上スワイプ: カードをめくる
                    flipCard();
                    isActionInProgress = false; // flipCard は同期的なので即座に解除
                    break;
                default:
                    isActionInProgress = false; // 未知のタイプの場合も解除
                    break;
            }
        }
    }
    // パンジェスチャー処理（ドラッグ中の動作）
    function handlePan(event) {
        // カードがめくられている場合は特定の方向のみ許可
        if (isFlipped && event.type === 'panstart') {
            // 上方向への動きだけ検出し、カードをめくる操作に使用
            if (event.direction === Hammer.DIRECTION_UP) {
                flipCard();
            }
            return; // その他のドラッグは無視
        }
        
        // 値を調整
        const threshold = 50; // スワイプ判定のしきい値を小さく
        const minDragDistance = isFlipped ? 40 : 10; // 最小ドラッグ距離を小さく
        const maxRotation = 20; // 最大回転角度を増加
        const rotationFactor = 20; // 回転係数を調整
        const velocityThreshold = 0.3; // 速度の閾値
        
        if (event.type === 'panstart') {
            isDragging = true;
            flashcardElement.classList.add('dragging');
            // ドラッグ開始時にカードにアクティブ感を与える
            flashcardElement.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.2)';
        }
        
        if (isDragging && event.type === 'panmove') {
            // ドラッグ方向を検出
            let newDirection = null;
            const absX = Math.abs(event.deltaX);
            const absY = Math.abs(event.deltaY);
            
            // 最小ドラッグ距離を下回る場合は小さな動きだけ
            if (absX < minDragDistance && absY < minDragDistance) {
                resetIndicators();
                // 微小な動きでも操作感を与える（縮小係数で抑制）
                const scaleX = 0.8;
                const scaleY = 0.8;
                flashcardElement.style.transform = `translate(${event.deltaX * scaleX}px, ${event.deltaY * scaleY}px)`;
                return;
            }
            
            // 方向性の判定をより適切に調整
            const directionRatio = 1.2; // より自然な方向判定のための比率
            
            if (absX > absY * directionRatio) {
                // 水平方向の動き - より自然な動きに
                const progress = Math.min(Math.abs(event.deltaX) / 300, 1); // 進行度を0-1に正規化
                
                if (event.deltaX < -threshold) {
                    newDirection = 'left';
                    showSwipeIndicator('left');
                    
                    // 移動量に応じた回転角度の自然な変化
                    const rotate = -Math.min(maxRotation, Math.abs(event.deltaX) / rotationFactor);
                    // 横移動だけでなく、少しだけ上に持ち上げる効果を追加
                    const liftY = -Math.abs(event.deltaX) * 0.1;
                    // 移動量に応じた影の変化
                    updateShadowForDirection('left', progress);
                    
                    flashcardElement.style.transform = `translate(${event.deltaX}px, ${liftY}px) rotate(${rotate}deg)`;
                } else if (event.deltaX > threshold) {
                    newDirection = 'right';
                    showSwipeIndicator('right');
                    
                    // 右方向の自然な動き
                    const rotate = Math.min(maxRotation, Math.abs(event.deltaX) / rotationFactor);
                    const liftY = -Math.abs(event.deltaX) * 0.1;
                    updateShadowForDirection('right', progress);
                    
                    flashcardElement.style.transform = `translate(${event.deltaX}px, ${liftY}px) rotate(${rotate}deg)`;
                } else {
                    // しきい値未満の小さな動き
                    resetIndicators();
                    // 微小な動きでも反応するように
                    const dampingFactor = 0.7; // 抑制係数
                    flashcardElement.style.transform = `translate(${event.deltaX * dampingFactor}px, 0px)`;
                }
            } else if (absY > absX * directionRatio && event.deltaY > threshold) {
                // 下方向の動き - より自然に
                newDirection = 'down';
                showSwipeIndicator('down');
                
                const progress = Math.min(event.deltaY / 250, 1);
                updateShadowForDirection('down', progress);
                
                // 下方向は回転を控えめに
                const smallRotate = (event.deltaX / 50) * 5; // わずかな左右の動きによる回転
                flashcardElement.style.transform = `translate(${event.deltaX * 0.2}px, ${event.deltaY}px) rotate(${smallRotate}deg)`;
            } else if (absY > absX * directionRatio && event.deltaY < -threshold * 1.5) {
                // 上スワイプの場合はカードをめくる動作 (閾値を少し大きく)
                if (!isFlipped) {
                    flipCard();
                }
                resetCardDragState();
                return;
            } else {
                // 方向が明確でない場合
                resetIndicators();
                // いずれの方向にも自然な動きを許可
                const dampingFactor = 0.5; // 動きの抑制係数
                flashcardElement.style.transform = `translate(${event.deltaX * dampingFactor}px, ${event.deltaY * dampingFactor}px)`;
            }
            
            dragDirection = newDirection;
        }
        
        // 指定した方向のインジケータのみを表示する関数
        function showSwipeIndicator(direction) {
            resetIndicators();
            
            if (direction === 'left') {
                swipeLeftIndicator.classList.add('visible');
                flashcardElement.classList.add('dragging-left');
            } else if (direction === 'right') {
                swipeRightIndicator.classList.add('visible');
                flashcardElement.classList.add('dragging-right');
            } else if (direction === 'down') {
                swipeDownIndicator.classList.add('visible');
                flashcardElement.classList.add('dragging-down');
            }
        }
        
        // 影の効果を方向に基づいて更新する関数
        function updateShadowForDirection(direction, progress) {
            let shadowColor;
            
            if (direction === 'left') {
                shadowColor = `rgba(46, 204, 113, ${0.3 + progress * 0.3})`; // 緑
            } else if (direction === 'right') {
                shadowColor = `rgba(243, 156, 18, ${0.3 + progress * 0.3})`; // オレンジ
            } else if (direction === 'down') {
                shadowColor = `rgba(231, 76, 60, ${0.3 + progress * 0.3})`; // 赤
            }
            
            const blurSize = 15 + progress * 15;
            const spreadSize = 5 + progress * 5;
            flashcardElement.style.boxShadow = `0 ${blurSize}px ${spreadSize}px ${shadowColor}`;
        }
        
        // インジケータをリセットする関数
        function resetIndicators() {
            swipeLeftIndicator.classList.remove('visible');
            swipeRightIndicator.classList.remove('visible');
            swipeDownIndicator.classList.remove('visible');
            flashcardElement.classList.remove('dragging-left', 'dragging-right', 'dragging-down');
        }
        
        if ((event.type === 'panend' || event.type === 'pancancel') && isDragging) {
            const swipeThreshold = 100; // スワイプとみなす閾値を調整
            const velocityMultiplier = 2.5; // 速度による動きの増幅係数
            
            // 速度を考慮した実効的なデルタを計算（慣性効果の模倣）
            const effectiveDeltaX = event.deltaX + (event.velocityX * velocityMultiplier * 100);
            const effectiveDeltaY = event.deltaY + (event.velocityY * velocityMultiplier * 100);
            
            // 速度が十分であれば、より小さい移動量でもスワイプと判定
            const isHighVelocityX = Math.abs(event.velocityX) > velocityThreshold;
            const isHighVelocityY = Math.abs(event.velocityY) > velocityThreshold;
            
            // 左右のスワイプ判定をより柔軟に
            if ((dragDirection === 'left' && effectiveDeltaX < -swipeThreshold) ||
                (dragDirection === 'left' && isHighVelocityX && event.deltaX < -swipeThreshold * 0.7)) {
                if (isActionInProgress) return;
                isActionInProgress = true;
                // 左にスワイプ完了: 「覚えた」- より大きく飛ばす
                flashcardElement.style.transition = 'all 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                flashcardElement.style.transform = `translateX(-200%) rotate(-40deg)`;
                
                setTimeout(() => {
                    saveLearningState(currentIndex, 'learned');
                    resetCardDragState();
                    isActionInProgress = false;
                }, 500);
            } else if ((dragDirection === 'right' && effectiveDeltaX > swipeThreshold) ||
                      (dragDirection === 'right' && isHighVelocityX && event.deltaX > swipeThreshold * 0.7)) {
                if (isActionInProgress) return;
                isActionInProgress = true;
                // 右にスワイプ完了: 「復習」
                flashcardElement.style.transition = 'all 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                flashcardElement.style.transform = `translateX(200%) rotate(40deg)`;
                
                setTimeout(() => {
                    saveLearningState(currentIndex, 'learning');
                    resetCardDragState();
                    isActionInProgress = false;
                }, 500);
            } else if ((dragDirection === 'down' && effectiveDeltaY > swipeThreshold) ||
                      (dragDirection === 'down' && isHighVelocityY && event.deltaY > swipeThreshold * 0.7)) {
                if (isActionInProgress) return;
                isActionInProgress = true;
                // 下にスワイプ完了: 「まだ」
                flashcardElement.style.transition = 'all 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                flashcardElement.style.transform = `translateY(200%)`;
                
                setTimeout(() => {
                    saveLearningState(currentIndex, 'not_learned');
                    resetCardDragState();
                    isActionInProgress = false;
                }, 500);
            } else {
                // スワイプ未完了 - よりスムーズに戻る
                flashcardElement.classList.add('return-to-center');
                // バネのような戻り効果
                flashcardElement.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                flashcardElement.style.transform = 'translate(0px, 0px) rotate(0deg)';
                
                // カードが完全に戻った後にドラッグ状態をリセット
                setTimeout(() => {
                    resetCardDragState();
                    // 影を元に戻す
                    flashcardElement.style.boxShadow = '';
                }, 400);
            }
        }
    }

    // 設定パネルを開く
    function openSettings() {
        settingsPanel.classList.add('active');
        overlay.classList.add('active');
    }

    // 設定パネルを閉じる
    function closeSettings() {
        settingsPanel.classList.remove('active');
        overlay.classList.remove('active');
    }

    // --- リストセクション関連関数 ---
    function toggleListSection() {
        updateWordList(); // 開く前にリストを最新の状態に更新
        isListExpanded = !isListExpanded;
        
        if (isListExpanded) {
            listSection.classList.add('expanded');
        } else {
            listSection.classList.remove('expanded');
        }
    }

    // フィルターチェックボックスの初期化
    function initializeFilterCheckboxes() {
        // 初期状態のチェックボックスを設定
        filterNotLearnedCheckbox.checked = activeFilters.not_learned;
        filterLearningCheckbox.checked = activeFilters.learning;
        filterLearnedCheckbox.checked = activeFilters.learned;
        
        // フィルター適用ボタンのイベントリスナー
        applyFilterBtn.addEventListener('click', () => {
            activeFilters = {
                not_learned: filterNotLearnedCheckbox.checked,
                learning: filterLearningCheckbox.checked,
                learned: filterLearnedCheckbox.checked
            };
            updateWordList();
        });
        
        // チェックボックスのデフォルト状態を設定
        if (!localStorage.getItem('flashcardListFilters')) {
            localStorage.setItem('flashcardListFilters', JSON.stringify(activeFilters));
        } else {
            try {
                activeFilters = JSON.parse(localStorage.getItem('flashcardListFilters'));
                filterNotLearnedCheckbox.checked = activeFilters.not_learned;
                filterLearningCheckbox.checked = activeFilters.learning;
                filterLearnedCheckbox.checked = activeFilters.learned;
            } catch (e) {
                console.error('フィルター設定の読み込みエラー:', e);
            }
        }
    }
    
    // 単語リストとカウントを更新する関数
    function updateWordList() {
        wordListElement.innerHTML = ''; // リストをクリア
        let filteredCards = [];
        let counts = { all: 0, not_learned: 0, learning: 0, learned: 0 };

        cards.forEach((card, index) => {
            const state = learningStates[index] || 'not_learned'; // 未設定の場合は 'not_learned' 扱い
            counts[state]++;
            counts.all++;

            // タブとフィルターの両方に合致する場合のみリストに表示
            const matchesTab = (currentListTab === 'all' || state === currentListTab);
            const matchesFilter = activeFilters[state];
            
            if (matchesTab && matchesFilter) {
                filteredCards.push({ ...card, index, state });
            }
        });

        // カウント表示を更新（フィルターに関係なく全体の数を表示）
        countAll.textContent = counts.all;
        countNotLearned.textContent = counts.not_learned;
        countLearning.textContent = counts.learning;
        countLearned.textContent = counts.learned;

        // リスト項目を生成
        if (filteredCards.length === 0) {
            const li = document.createElement('li');
            li.textContent = '該当する単語はありません。';
            li.style.justifyContent = 'center';
            li.style.color = '#888';
            wordListElement.appendChild(li);
        } else {
            filteredCards.forEach(card => {
                const li = document.createElement('li');
                li.dataset.index = card.index; // ジャンプ用にインデックスを保持
                li.dataset.state = card.state; // 学習状態を保持
                
                // 状態に応じたクラスを追加
                li.classList.add(`state-${card.state}`);
                
                const wordSpan = document.createElement('span');
                wordSpan.classList.add('word');
                wordSpan.textContent = card.word;
                
                const descSpan = document.createElement('span');
                descSpan.classList.add('description');
                descSpan.textContent = card.description;
                
                // 学習状態を示すアイコンを追加
                const stateIcon = document.createElement('span');
                stateIcon.classList.add('state-icon');
                
                if (card.state === 'learned') {
                    stateIcon.innerHTML = '<i class="fas fa-check" style="color: #2ecc71;"></i>';
                } else if (card.state === 'learning') {
                    stateIcon.innerHTML = '<i class="fas fa-sync-alt" style="color: #f39c12;"></i>';
                } else {
                    stateIcon.innerHTML = '<i class="fas fa-times" style="color: #e74c3c;"></i>';
                }
                
                li.appendChild(stateIcon);
                li.appendChild(wordSpan);
                li.appendChild(descSpan);
                wordListElement.appendChild(li);
            });
        }
        
        // フィルター設定を保存
        localStorage.setItem('flashcardListFilters', JSON.stringify(activeFilters));
    }
    // --- ここまでリストセクション関連関数 ---

    // イベントリスナー

    // カードクリックでめくる
    flashcardElement.addEventListener('click', function(e) { // 変数名を変更
        // 発音ボタンをクリックした場合はカードをめくらない
        if (e.target.closest('#pronunciation-btn')) {
            return;
        }
        flipCard();
    });
    
    // 発音ボタン
    pronunciationBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // カードのクリックイベントが発火するのを防ぐ
        playPronunciation(cards[currentIndex].word);
    });
    
    // ナビゲーションボタン
    nextBtn.addEventListener('click', nextCard);
    prevBtn.addEventListener('click', prevCard);
    flipBtn.addEventListener('click', flipCard);
    
    // 設定関連
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    // overlay.addEventListener('click', closeSettings); // リストモーダルと共用するため後で設定

    // リストセクション関連
    toggleListBtn.addEventListener('click', toggleListSection);

    // オーバーレイは設定パネルのみ閉じる
    overlay.addEventListener('click', closeSettings);

    // タブ切り替え
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentListTab = btn.dataset.status;
            updateWordList();
        });
    });

    // リスト項目クリックでカードへジャンプ
    wordListElement.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && li.dataset.index !== undefined) {
            const targetIndex = parseInt(li.dataset.index, 10);
            if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < cards.length) {
                // フィルターがかかっている場合でも、対象のカードが存在するかは cards で確認

                // フィルター後の表示リスト(displayableIndices)に targetIndex が含まれるか確認
                const displayIndex = displayableIndices.indexOf(targetIndex);

                if (displayIndex !== -1) { // フィルター後のリストに含まれていればジャンプ
                    currentDisplayIndex = displayIndex;
                    currentIndex = targetIndex;
                    showCard(currentIndex); // showCard を呼び出して表示を更新
                    
                    // リストを閉じる
                    if (isListExpanded) {
                        toggleListSection();
                    }
                } else {
                    // フィルターで非表示になっている場合はジャンプしない
                    alert("選択されたカードは現在のフィルターでは表示されません。フィルターを解除するか、設定を変更してください。");
                }
            }
        }
    });
    
    // キーボードでの操作
    document.addEventListener('keydown', function(event) {
        switch(event.key) {
            case 'ArrowRight':
                nextCard();
                break;
            case 'ArrowLeft':
                prevCard();
                break;
            case 'ArrowUp':
            case 'ArrowDown':
            case ' ':  // スペースキー
                flipCard();
                break;
            case 'p':  // 'p'キーで発音
                playPronunciation(cards[currentIndex].word);
                break;
            case 'Escape':  // ESCキーで設定パネルを閉じる
                closeSettings();
                break;
            case '1': // '1'キーで「まだ」
                saveLearningState(currentIndex, 'not_learned');
                break;
            case '2': // '2'キーで「復習」
                saveLearningState(currentIndex, 'learning');
                break;
            case '3': // '3'キーで「覚えた」
                saveLearningState(currentIndex, 'learned');
                break;
        }
    });

    // 学習状態を保存する関数
    function saveLearningState(index, state) {
        console.log(`Card ${index + 1} state set to: ${state}`);
        learningStates[index] = state;
        persistLearningStates(); // ローカルストレージに保存
        
        // 状態に応じてボタンの見た目を更新
        updateLearningStatusButtons(index);

        // リストセクションが展開されていればリストも更新
        if (isListExpanded) {
            updateWordList();
        }

        // フィルター状態も更新（学習状態が変わったことで表示対象が変わる可能性があるため）
        updateDisplayFilter();

        // 学習状態に応じたフィードバックの表示
        showFeedbackAnimation(state);
        
        // 設定に基づいて自動アクション
        setTimeout(() => {
            // 少し遅延させて、アニメーションが見えるようにする
            performAutoAction(state);
        }, 800); // アニメーションが見えるよう少し遅延
    }
    
    // 学習状態に応じたフィードバックアニメーションを表示
    function showFeedbackAnimation(state) {
        // アニメーションクラスをすべて削除
        flashcardElement.classList.remove('show-checkmark', 'show-learning', 'show-not-learned');
        flashcardElement.classList.remove('learned-animation', 'learning-animation', 'not-learned-animation');
        
        // 学習状態に応じたアニメーションを追加
        if (state === 'learned') {
            // 「覚えた」状態のフィードバック
            flashcardElement.classList.add('show-checkmark');
            if (settings.enableAnimations) {
                flashcardElement.classList.add('learned-animation');
            }
            setTimeout(() => {
                flashcardElement.classList.remove('show-checkmark', 'learned-animation');
            }, 1500); // アニメーション終了後にクラスを削除
        }
        else if (state === 'learning') {
            // 「復習」状態のフィードバック
            flashcardElement.classList.add('show-learning');
            if (settings.enableAnimations) {
                flashcardElement.classList.add('learning-animation');
            }
            setTimeout(() => {
                flashcardElement.classList.remove('show-learning', 'learning-animation');
            }, 1200); // アニメーション終了後にクラスを削除
        }
        else if (state === 'not_learned') {
            // 「まだ」状態のフィードバック
            flashcardElement.classList.add('show-not-learned');
            if (settings.enableAnimations) {
                flashcardElement.classList.add('not-learned-animation');
            }
            setTimeout(() => {
                flashcardElement.classList.remove('show-not-learned', 'not-learned-animation');
            }, 800); // アニメーション終了後にクラスを削除
        }
    }
    
    // 設定に基づいて自動アクションを実行
    function performAutoAction(state) {
        if (state === 'learned' && settings.autoNextLearned) {
            // 「覚えた」の場合、設定に応じて次のカードへ
            nextCard();
        }
        else if (state === 'not_learned' && settings.autoFlipNotLearned) {
            // 「まだ」の場合、設定に応じてカードをめくる
            // すでにめくられている場合はめくらない
            if (!isFlipped) {
                flipCard();
            }
        }
        else if (state === 'learning' && settings.autoNextLearning) {
            // 「復習」の場合、設定に応じて次のカードへ
            nextCard();
        }
    }

    // 学習状態ボタンの見た目を更新する関数（仮実装）
    function updateLearningStatusButtons(index) {
        const currentState = learningStates[index];
        
        notLearnedBtn.classList.remove('active');
        learningBtn.classList.remove('active');
        learnedBtn.classList.remove('active');

        if (currentState === 'not_learned') {
            notLearnedBtn.classList.add('active');
        } else if (currentState === 'learning') {
            learningBtn.classList.add('active');
        } else if (currentState === 'learned') {
            learnedBtn.classList.add('active');
        }
    }

    // --- 表示フィルター関連関数 ---
    function updateDisplayFilter() {
        const previousDisplayableCount = displayableIndices.length;

        if (settings.filterReview) {
            // 復習リストのみ表示する場合
            displayableIndices = cards.map((_, index) => index) // 全インデックスを取得
                                     .filter(index => learningStates[index] === 'learning');
        } else {
            // 全てのカードを表示する場合
            displayableIndices = cards.map((_, index) => index);
        }
        
        // 現在のカードがフィルター後のリストに含まれているか確認
        const currentCardStillVisible = displayableIndices.includes(currentIndex);
        const newDisplayableCount = displayableIndices.length;

        if (!currentCardStillVisible && newDisplayableCount > 0) {
            // 現在のカードが表示されなくなった場合、フィルター後の最初のカードに移動
            currentDisplayIndex = 0;
            currentIndex = displayableIndices[currentDisplayIndex];
            // showCard は呼び出し元 (initializeSettings, saveLearningState など) で行う
        } else if (newDisplayableCount > 0) {
             // 現在のカードが表示されている場合、displayableIndices 内でのインデックスを更新
             // currentIndex は変わらないので、それに対応する displayIndex を見つける
             currentDisplayIndex = displayableIndices.indexOf(currentIndex);
             if (currentDisplayIndex === -1) { // 念のためエラーケース
                 console.error("Logic error: Current card index not found in displayable indices.");
                 currentDisplayIndex = 0;
                 currentIndex = displayableIndices[0];
             }
        } else {
             // 表示できるカードがない場合
             currentDisplayIndex = 0;
             // currentIndex は変更せず、表示側 (showCard や UI 更新) で対応
             wordContent.textContent = '表示できるカードがありません';
             meaningContent.textContent = 'フィルター条件を確認してください。';
        }

        // フィルター変更で表示数が変わった場合、プログレスバーなどを即時更新
        if (previousDisplayableCount !== newDisplayableCount || newDisplayableCount === 0) {
            updateProgressBar();
        }
    }
    // --- ここまで表示フィルター関連関数 ---


    // イベントリスナーの追加
    notLearnedBtn.addEventListener('click', () => saveLearningState(currentIndex, 'not_learned'));
    learningBtn.addEventListener('click', () => saveLearningState(currentIndex, 'learning'));
    learnedBtn.addEventListener('click', () => saveLearningState(currentIndex, 'learned'));
});