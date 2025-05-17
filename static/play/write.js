// 手書きモード機能
document.addEventListener('DOMContentLoaded', function() {
    let tesseractLoaded = false;
    let handwritingMode = false;

    // キャンバス要素の取得
    const canvas = document.getElementById('handwriting-canvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // オブジェクトに関数をまとめる
    const handwritingHandler = {
        // キャンバスの初期設定
        setupCanvas: function() {
            const parentWidth = canvas.parentElement.clientWidth;
            canvas.width = parentWidth;
            canvas.height = 200;

            // キャンバスの背景を白に
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.lineWidth = 5;
            ctx.strokeStyle = '#000000';
        },

        // 描画機能
        startDrawing: function(e) {
            isDrawing = true;
            [lastX, lastY] = this.getCoordinates(e);
        },

        draw: function(e) {
            if (!isDrawing) return;
            e.preventDefault();

            const [x, y] = this.getCoordinates(e);

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.stroke();

            [lastX, lastY] = [x, y];
        },

        stopDrawing: function() {
            isDrawing = false;
        },

        // タッチ/マウスイベントから座標を取得
        getCoordinates: function(e) {
            let x, y;
            const rect = canvas.getBoundingClientRect();

            if (e.type.includes('touch')) {
                x = e.touches[0].clientX - rect.left;
                y = e.touches[0].clientY - rect.top;
            } else {
                x = e.clientX - rect.left;
                y = e.clientY - rect.top;
            }

            // キャンバスの実際のサイズに合わせてスケーリング
            x = x * (canvas.width / rect.width);
            y = y * (canvas.height / rect.height);

            return [x, y];
        },

        // キャンバスクリア機能
        clearCanvas: function() {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        },

        // Tesseract.jsのロード - 改善版（必要な時だけロード、進捗表示付き）
        loadTesseract: function() {
            return new Promise((resolve, reject) => {
                if (tesseractLoaded) {
                    resolve();
                    return;
                }

                // すでにTesseractがロードされている場合はメッセージを表示せずに処理
                if (typeof Tesseract !== 'undefined') {
                    tesseractLoaded = true;
                    resolve();
                    return;
                }
                
                // ロード中メッセージを表示（一意のIDを付与）
                const loadingMessageId = 'tesseract-loading-' + Date.now();

                // キャッシュや読み込み速度を考慮したバージョン指定
                const scriptSrc = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';

                // スクリプトがすでに存在するか確認
                const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
                if (existingScript) {
                    tesseractLoaded = true;
                    
                    // 通知を閉じる
                    this.closeLoadingNotification(loadingMessageId);
                    
                    resolve();
                    return;
                }

                const script = document.createElement('script');
                script.src = scriptSrc;

                // 読み込みタイムアウト処理
                let timeout = setTimeout(() => {
                    script.onerror(new Error('Tesseract.js loading timeout')); // onerror を直接呼び出す
                }, 15000); // 15秒タイムアウト

                script.onload = () => {
                    clearTimeout(timeout);
                    console.log('Tesseract.js loaded');
                    tesseractLoaded = true;
                    
                    // 通知を閉じる
                    this.closeLoadingNotification(loadingMessageId);
                    
                    resolve();
                };

                script.onerror = (err) => { // err は Event オブジェクトまたは Error オブジェクト
                    clearTimeout(timeout);
                    const errorMessage = (err instanceof Error) ? err.message : 'Unknown loading error';
                    console.error('Tesseract loading error:', err);
                    
                    // ロード中メッセージを閉じる
                    this.closeLoadingNotification(loadingMessageId);
                    
                    // エラーメッセージを表示
                    notie.alert({
                        type: 'error',
                        text: '認識エンジンの読み込みに失敗しました',
                        time: 3
                    });
                    
                    reject(new Error(`Failed to load Tesseract.js: ${errorMessage}`));
                };

                document.head.appendChild(script);
            });
        },

        // イベントリスナー設定
        setupEventListeners: function() {
            // マウスイベント
            canvas.addEventListener('mousedown', this.startDrawing.bind(this));
            canvas.addEventListener('mousemove', this.draw.bind(this));
            canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
            canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

            // タッチイベント
            canvas.addEventListener('touchstart', this.startDrawing.bind(this));
            canvas.addEventListener('touchmove', this.draw.bind(this));
            canvas.addEventListener('touchend', this.stopDrawing.bind(this));

            // クリアボタン
            document.getElementById('clear-canvas').addEventListener('click', this.clearCanvas.bind(this));

            // 回答送信
            document.getElementById('submit-answer').addEventListener('click', this.submitAnswer.bind(this));
        },

        analyzeText: function(text) {
            // 英語の判定
            const hasUppercase = /[A-Z]/.test(text);
            const hasLowercase = /[a-z]/.test(text);

            let char = "";
            let type = "eng"; // デフォルトは英語

            if (hasUppercase) {
                char += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 英語（大文字のみ）
            }
            if (hasLowercase) {
                char += "abcdefghijklmnopqrstuvwxyz"; // 英語（小文字のみ）
            }

            // 日本語の判定
            const hasHiragana = /[ぁ-ん]/.test(text); // ひらがな
            const hasKatakana = /[ァ-ン]/.test(text); // カタカナ
            const hasKanji = /[一-龯]/.test(text);     // 漢字

            if (hasHiragana && !hasKatakana && !hasKanji) {
                type = "jpn";
                char = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ";
            } else if (hasKatakana && !hasHiragana && !hasKanji) {
                type = "jpn";
                char = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ";
            } else if (hasHiragana || hasKatakana || hasKanji) {
                type = "jpn";
                char = "ALL";
            }

            // 数字の判定
            const hasNumber = /[0-9]/.test(text);
            if (hasNumber) {
                char += "0123456789"; // 数字
            }

            // 記号の判定
            const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(text);
            if (hasSymbol) {
                char += "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"; // 記号
            }

            return [type, char];
        },

        // 手書き文字認識と回答送信 - 最適化版
        submitAnswer: async function() {
            // 空のキャンバスかチェック
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixelData = imageData.data;
            let hasDrawing = false;

            for (let i = 0; i < pixelData.length; i += 4) {
                if (pixelData[i] < 245 || pixelData[i + 1] < 245 || pixelData[i + 2] < 245) {
                    hasDrawing = true;
                    break;
                }
            }

            if (!hasDrawing) {
                notie.alert({
                    type: 'error',
                    text: '何も書かれていません。キャンバスに文字を書いてください。',
                    time: 2
                });
                return;
            }

            const submitBtn = document.getElementById('submit-answer');
            const originalBtnText = submitBtn.textContent; // 元のテキストを保存
            submitBtn.disabled = true;
            submitBtn.textContent = "認識中...";

            const btnWidth = submitBtn.offsetWidth;
            let processingTimeout;

            try {
                notie.alert({
                    type: 'info',
                    text: '手書き文字を認識しています...',
                    time: 0, // 0にすると手動で消すまで表示
                    position: 'top'
                });

                await Promise.race([
                    this.loadTesseract(),
                    new Promise((_, reject) => {
                        processingTimeout = setTimeout(() => {
                            reject(new Error('Tesseract loading timeout'));
                        }, 20000); // 20秒タイムアウト
                    })
                ]);

                clearTimeout(processingTimeout);

                if (typeof Tesseract === 'undefined') {
                    throw new Error('Tesseract.js is not loaded');
                }

                const canvasDataUrl = canvas.toDataURL('image/png', 0.9);
                const currentWord = questions[currentIndex]?.word || ''; 
                const [langType, charSet] = this.analyzeText(currentWord);

                let worker;
                try {
                    if (langType === "ALL") { 
                        worker = await Tesseract.createWorker('jpn');
                        await worker.setParameters({
                            tessedit_pageseg_mode: 7,
                            tessjs_create_hocr: false,
                            tessjs_create_tsv: false
                        });
                    } else if (langType === "eng") {
                        worker = await Tesseract.createWorker('eng');
                        await worker.setParameters({
                            tessedit_pageseg_mode: 7,
                            tessedit_char_whitelist: charSet,
                            tessjs_create_hocr: false,
                            tessjs_create_tsv: false
                        });
                    } else { 
                        worker = await Tesseract.createWorker('eng+jpn'); 
                        await worker.setParameters({
                            tessedit_pageseg_mode: 7,
                            tessjs_create_hocr: false,
                            tessjs_create_tsv: false
                        });
                    }

                    const result = await Promise.race([
                        worker.recognize(canvasDataUrl),
                        new Promise((_, reject) => {
                            processingTimeout = setTimeout(() => {
                                reject(new Error('Recognition timeout'));
                            }, 10000); // 10秒タイムアウト
                        })
                    ]);

                    clearTimeout(processingTimeout);

                    const recognizedText = result.data.text.trim().replace(/\s+/g, " ");
                    console.log('認識された文字:', recognizedText);

                    await worker.terminate();

                    this.checkHandwritingAnswer(recognizedText);

                } catch (err) {
                    console.error('Recognition process error:', err);
                    if (worker) {
                        await worker.terminate().catch(() => {}); // エラーハンドリング中でもterminateを試みる
                    }
                    throw err; // 再スローして上位のcatchで処理
                }

            } catch (error) {
                console.error('文字認識エラー:', error);
                const errorMessage = error.message.includes('timeout')
                    ? '処理に時間がかかりすぎました。より簡潔に書いてみてください。'
                    : '文字認識に失敗しました。もう一度お試しください。';

                notie.alert({
                    type: 'error',
                    text: errorMessage,
                    time: 3
                });
            } finally {
                if (processingTimeout) {
                    clearTimeout(processingTimeout);
                }

                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        },

        // 手書き回答の判定 - 改善版
        checkHandwritingAnswer: function(recognizedText) {
            if (!recognizedText) {
                notie.alert({
                    type: 'error',
                    text: '文字を認識できませんでした。はっきりと書いてみてください。',
                    time: 3
                });
                return;
            }

            const currentQuestion = questions[currentIndex]; // 外部スコープの変数
            if (!currentQuestion) {
                console.error('Current question not found at index', currentIndex);
                notie.alert({
                    type: 'error',
                    text: '問題データの取得に失敗しました。',
                    time: 3
                });
                return;
            }

            const correctAnswer = currentQuestion.word.trim();
            const normalizedRecognizedText = recognizedText.replace(/\s+/g, '').toLowerCase();
            const normalizedCorrectAnswer = correctAnswer.replace(/\s+/g, '').toLowerCase();

            if (normalizedRecognizedText === normalizedCorrectAnswer) {
                this.onCorrectAnswer();
                return;
            }

            const similarity = this.calculateSimilarity(normalizedRecognizedText, normalizedCorrectAnswer);
            console.log(`類似度: ${similarity} (認識: "${normalizedRecognizedText}", 正解: "${normalizedCorrectAnswer}")`);

            const self = this; 
            if (similarity > 0.7 ||
                (normalizedRecognizedText.length >= 3 && normalizedCorrectAnswer.length > 0 && normalizedRecognizedText.includes(normalizedCorrectAnswer)) || // 正解が空でないことを確認
                (normalizedCorrectAnswer.length >= 3 && normalizedRecognizedText.length > 0 && normalizedCorrectAnswer.includes(normalizedRecognizedText) && // 認識結果が空でないことを確認
                 normalizedRecognizedText.length > normalizedCorrectAnswer.length * 0.6)) {
                this.onCorrectAnswer();
            } else if (similarity > 0.5) {
                notie.confirm({
                    text: `"${recognizedText}"と認識しました。<br>正解は"${correctAnswer}"です。<br>正解として処理しますか？`,
                    submitText: '正解とする',
                    cancelText: '不正解とする',
                    position: 'center',
                    submitCallback: function() {
                        self.onCorrectAnswer();
                    },
                    cancelCallback: function() {
                        self.onWrongAnswer(recognizedText);
                    }
                });
            } else {
                this.onWrongAnswer(recognizedText);
            }
        },

        // 文字列の類似度計算（レーベンシュタイン距離を使用）
        calculateSimilarity: function(str1, str2) {
            const normalize = (str) => {
                return str.toLowerCase()
                    .replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // 全角英数記号を半角に
                    .replace(/\s+/g, '')
                    .trim();
            };

            const a = normalize(str1);
            const b = normalize(str2);

            if (a === b) return 1.0; // 正規化後が同じなら完全一致
            if (a.length === 0 && b.length === 0) return 1.0; // 両方空なら一致
            if (a.length === 0 || b.length === 0) return 0.0; // 片方だけ空なら不一致


            const matrix = [];
            for (let i = 0; i <= b.length; i++) {
                matrix[i] = [i];
            }
            for (let j = 0; j <= a.length; j++) {
                matrix[0][j] = j;
            }

            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1, // 置換
                            matrix[i][j - 1] + 1,     // 挿入
                            matrix[i - 1][j] + 1      // 削除
                        );
                    }
                }
            }

            const maxLength = Math.max(a.length, b.length);
            if (maxLength === 0) return 1.0; // 念のため（上記で処理済みのはず）

            return 1 - (matrix[b.length][a.length] / maxLength);
        },

        // 正解時の処理
        onCorrectAnswer: function() {
            correctCount++; // 外部スコープの変数
            renzokuseikai++; // 外部スコープの変数
            if (renzokuseikai > maxStreak) { // 外部スコープの変数
                maxStreak = renzokuseikai;
            }

            const stats = questionStats.get(currentIndex) || { // 外部スコープの変数
                attempts: 0,
                correctAnswers: 0,
                averageTime: 0,
                isLongTime: false,
                isWrong: false
            };

            stats.correctAnswers++;
            if (stats.correctAnswers >= 2) {
                studyingQuestions.delete(currentIndex); // 外部スコープの変数
            }

            questionStats.set(currentIndex, stats);
            answeredQuestions.add(currentIndex); // 外部スコープの変数
            totalCount++; // 外部スコープの変数

            notie.alert({ type: 1, text: '正解', time: 1 });

            this.clearCanvas();

            // 外部スコープの関数を呼び出す（window経由でグローバル関数にアクセス）
            if (typeof window.displayScore === 'function') window.displayScore();
            if (typeof window.updateStats === 'function') window.updateStats();
            if (typeof window.nextIndex === 'function') window.nextIndex();
            if (typeof window.showNextQuestion === 'function') window.showNextQuestion();

            if (accid && password) { // 外部スコープの変数
                sendScore("add_correct", accid, password); // 外部スコープの関数
                saveCategoryProgress(true); // 外部スコープの関数
            }
        },

        // 不正解時の処理
        onWrongAnswer: function(recognizedText) {
            wrongCount++; // 外部スコープの変数
            renzokuseikai = 0; // 外部スコープの変数

            const stats = questionStats.get(currentIndex) || { // 外部スコープの変数
                attempts: 0,
                correctAnswers: 0,
                averageTime: 0,
                isLongTime: false,
                isWrong: false
            };

            stats.isWrong = true;
            questionStats.set(currentIndex, stats);
            studyingQuestions.add(currentIndex); // 外部スコープの変数
            answeredQuestions.add(currentIndex); // 外部スコープの変数
            totalCount++; // 外部スコープの変数

            notie.force({
                type: 'error',
                text: `<div class="popup">${questions[currentIndex].description}<br><br>正しい回答: ${questions[currentIndex].word}<br>認識された回答: ${recognizedText}</div>`,
                buttonText: 'OK',
                callback: () => { // アロー関数に変更して this を束縛
                    this.clearCanvas();

                    // 外部スコープの関数を呼び出す（window経由でグローバル関数にアクセス）
                    if (typeof window.displayScore === 'function') window.displayScore();
                    if (typeof window.updateStats === 'function') window.updateStats();
                    // nextIndex(); // 不正解時は次の問題に進まないのが一般的だが、元のコードにないのでコメントアウト
                    if (typeof window.showNextQuestion === 'function') window.showNextQuestion();

                    if (accid && password) { // 外部スコープの変数
                        sendScore("add_bad", accid, password); // 外部スコープの関数
                        saveCategoryProgress(false); // 外部スコープの関数
                    }
                }
            });
        },

        // 回答モード切替の設定
        setupAnswerModeSettings: function() {
            const currentMode = localStorage.getItem('answer_mode') || 'choice';

            document.getElementById('choice-mode').checked = (currentMode === 'choice');
            document.getElementById('handwriting-mode').checked = (currentMode === 'handwriting');

            this.setAnswerMode(currentMode);

            document.getElementById('choice-mode').addEventListener('change', (event) => {
                if (event.target.checked) {
                    this.setAnswerMode('choice');
                }
            });

            document.getElementById('handwriting-mode').addEventListener('change', (event) => {
                if (event.target.checked) {
                    this.setAnswerMode('handwriting');
                    // 手書きモードに切り替わったらキャンバスをセットアップ (setAnswerMode内で実施される)
                    // this.setupCanvas(); // setAnswerMode内で呼ばれるので重複削除
                }
            });
        },

        // 回答モードの切替
        setAnswerMode: function(mode) {
            const choiceArea = document.getElementById('choice-answers');
            const handwritingArea = document.getElementById('handwriting-area');

            handwritingMode = (mode === 'handwriting'); // グローバルスコープの handwritingMode を更新

            if (mode === 'choice') {
                choiceArea.style.display = 'block';
                handwritingArea.style.display = 'none';
            } else {
                choiceArea.style.display = 'none';
                handwritingArea.style.display = 'block';

                this.setupCanvas();

                if (!tesseractLoaded) { // グローバルスコープの tesseractLoaded を参照
                    setTimeout(() => {
                        this.loadTesseract().catch(err => {
                            console.error('Failed to preload Tesseract:', err);
                        });
                    }, 1000); // 1秒後にロード開始
                }
            }
            localStorage.setItem('answer_mode', mode);
        },

        // 初期設定をすべて実行
        init: function() {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                this.setupEventListeners();
                this.setupAnswerModeSettings();
            } else {
                window.addEventListener('load', () => {
                    this.setupEventListeners();
                    this.setupAnswerModeSettings();
                });
            }

            window.addEventListener('resize', () => {
                if (handwritingMode) { // グローバルスコープの handwritingMode を参照
                    this.setupCanvas(); // this は handwritingHandler を指す
                }
            });
        },
        
        // notie通知を閉じるヘルパー関数
        closeLoadingNotification: function(id) {
            try {
                // 全ての通知をチェック
                document.querySelectorAll('.notie-container').forEach(container => {
                    // テキスト内容で識別するか、またはカスタムID属性がある場合はそれを使用
                    const alertText = container.querySelector('.notie-alert-text');
                    if (alertText &&
                        (alertText.textContent.includes('手書き認識エンジンを読み込み中') ||
                         (id && container.getAttribute('data-id') === id))) {
                        container.style.display = 'none';
                        setTimeout(() => {
                            if (container.parentNode) {
                                container.parentNode.removeChild(container);
                            }
                        }, 100);
                    }
                });
            } catch (e) {
                console.warn('Failed to close loading notification:', e);
            }
        }
    };

    // 初期化実行
    handwritingHandler.init();
});