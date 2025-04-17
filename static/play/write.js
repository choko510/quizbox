// 手書きモード機能
document.addEventListener('DOMContentLoaded', function() {
    // 変数定義
    let tesseractLoaded = false;
    let tesseractWorker = null;
    let handwritingMode = false;

    // キャンバス要素の取得
    const canvas = document.getElementById('handwriting-canvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // キャンバスの初期設定
    function setupCanvas() {
        // キャンバスのサイズ調整（親要素に合わせる）
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
    }

    // 描画機能
    function startDrawing(e) {
        isDrawing = true;
        [lastX, lastY] = getCoordinates(e);
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();

        const [x, y] = getCoordinates(e);
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        [lastX, lastY] = [x, y];
    }

    function stopDrawing() {
        isDrawing = false;
    }

    // タッチ/マウスイベントから座標を取得
    function getCoordinates(e) {
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
    }

    // キャンバスクリア機能
    function clearCanvas() {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Tesseract.jsのロード（必要な時だけ）
    function loadTesseract() {
        return new Promise((resolve, reject) => {
            if (tesseractLoaded) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.0/dist/tesseract.min.js';
            script.onload = () => {
                console.log('Tesseract.js loaded');
                tesseractLoaded = true;
                resolve();
            };
            script.onerror = () => {
                reject(new Error('Failed to load Tesseract.js'));
            };
            document.head.appendChild(script);

        });
    }

    // イベントリスナー設定
    function setupEventListeners() {
        // マウスイベント
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);
        
        // タッチイベント
        canvas.addEventListener('touchstart', startDrawing);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stopDrawing);
        
        // クリアボタン
        document.getElementById('clear-canvas').addEventListener('click', clearCanvas);
        
        // 回答送信
        document.getElementById('submit-answer').addEventListener('click', submitAnswer);
    }

    function analyzeText(text) {
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
    }

    // 手書き文字認識と回答送信
    async function submitAnswer() {
        // 回答ボタンの無効化（多重送信防止）
        const submitBtn = document.getElementById('submit-answer');
        submitBtn.disabled = true;
        
        try {
            // ローディング表示
            notie.alert({
                type: 'info',
                text: '手書き文字を認識しています...',
                time: 0, // 手動で消さない
                position: 'top'
            });

            // Tesseract.jsを必要時にだけロード
            await loadTesseract();
            
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js is not loaded');
            }

            // キャンバスの内容を画像データに変換
            const imageData = canvas.toDataURL('image/png');
            
            const char = analyzeText(questions[currentIndex].word);
            
            let worker;
            if (char[0] === "ALL") {
                worker = await Tesseract.createWorker('jpn');
                await worker.setParameters({
                    tessedit_pageseg_mode: 7
                });
            } else if (char[0] === "eng") {
                worker = await Tesseract.createWorker('eng');
                await worker.setParameters({
                    tessedit_pageseg_mode: 7, 
                    tessedit_char_whitelist: char[1],
                });
            }
            
            const result = await worker.recognize(imageData);
            const recognizedText = result.data.text.trim();
            console.log('認識された文字:', recognizedText);
            
            await worker.terminate();
            
            // notie.closeが存在しない問題対策
            try {
                // 既存のnotieアラートを消す
                document.querySelectorAll('.notie-container').forEach(el => {
                    el.style.display = 'none';
                });
            } catch (e) {
                console.log('Failed to hide notie alert:', e);
            }
            
            // 回答を判定
            checkHandwritingAnswer(recognizedText);
        } catch (error) {
            console.error('文字認識エラー:', error);
            notie.alert({
                type: 'error',
                text: '文字認識に失敗しました。もう一度お試しください。',
                time: 3
            });
        } finally {
            // 回答ボタンの再有効化
            submitBtn.disabled = false;
        }
    }

    // 手書き回答の判定
    function checkHandwritingAnswer(recognizedText) {
        if (!recognizedText) {
            notie.alert({
                type: 'error',
                text: '文字を認識できませんでした。はっきりと書いてみてください。',
                time: 3
            });
            return;
        }

        const currentQuestion = questions[currentIndex];
        const correctAnswer = currentQuestion.word.trim();
        
        // 文字列の類似度を計算
        const similarity = calculateSimilarity(recognizedText, correctAnswer);
        console.log(`類似度: ${similarity} (認識: "${recognizedText}", 正解: "${correctAnswer}")`);
        
        if (similarity > 0.6 || 
            (recognizedText.length >= 3 && recognizedText.includes(correctAnswer)) || 
            (recognizedText.length >= 3 && correctAnswer.includes(recognizedText) && recognizedText.length > correctAnswer.length * 0.5)) {
            // 正解の処理
            onCorrectAnswer();
        } else {
            // 不正解の処理
            onWrongAnswer(recognizedText);
        }
    }

    // 文字列の類似度計算（レーベンシュタイン距離を使用）
    function calculateSimilarity(str1, str2) {
        // 全角/半角、大文字/小文字を正規化
        const normalize = (str) => {
            return str.toLowerCase()
                .replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                .replace(/\s+/g, '')
                .trim();
        };
        
        const a = normalize(str1);
        const b = normalize(str2);
        
        // レーベンシュタイン距離の計算
        const matrix = [];
        
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i-1) === a.charAt(j-1)) {
                    matrix[i][j] = matrix[i-1][j-1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i-1][j-1] + 1, // 置換
                        Math.min(
                            matrix[i][j-1] + 1, // 挿入
                            matrix[i-1][j] + 1  // 削除
                        )
                    );
                }
            }
        }
        
        // レーベンシュタイン距離から類似度を計算（0～1の範囲、1が完全一致）
        const maxLength = Math.max(a.length, b.length);
        if (maxLength === 0) return 1.0; // 両方空文字の場合
        
        return 1 - (matrix[b.length][a.length] / maxLength);
    }

    // 正解時の処理
    function onCorrectAnswer() {
        // 既存の正解処理を利用
        correctCount++;
        renzokuseikai++;
        if (renzokuseikai > maxStreak) {
            maxStreak = renzokuseikai;
        }
        
        const stats = questionStats.get(currentIndex) || {
            attempts: 0,
            correctAnswers: 0,
            averageTime: 0,
            isLongTime: false,
            isWrong: false
        };
        
        stats.correctAnswers++;
        if (stats.correctAnswers >= 2) {
            studyingQuestions.delete(currentIndex);
        }
        
        questionStats.set(currentIndex, stats);
        answeredQuestions.add(currentIndex);
        totalCount++;
        
        notie.alert({ type: 1, text: '正解', time: 1 });
        
        // キャンバスをクリア
        clearCanvas();
        
        // 統計更新
        displayScore();
        updateStats();
        nextIndex();
        showNextQuestion();
        
        // スコア送信
        if (accid && password) {
            sendScore("add_correct", accid, password);
            saveCategoryProgress(true);
        }
    }

    // 不正解時の処理
    function onWrongAnswer(recognizedText) {
        wrongCount++;
        renzokuseikai = 0;
        
        const stats = questionStats.get(currentIndex) || {
            attempts: 0,
            correctAnswers: 0,
            averageTime: 0,
            isLongTime: false,
            isWrong: false
        };
        
        stats.isWrong = true;
        questionStats.set(currentIndex, stats);
        studyingQuestions.add(currentIndex);
        answeredQuestions.add(currentIndex);
        totalCount++;
        
        notie.force({
            type: 'error',
            text: `<div class="popup">${questions[currentIndex].description}<br><br>正しい回答: ${questions[currentIndex].word}<br>認識された回答: ${recognizedText}</div>`,
            buttonText: 'OK',
            callback: function() {
                // キャンバスをクリア
                clearCanvas();
                
                // 統計更新
                displayScore();
                updateStats();
                showNextQuestion();
                
                // スコア送信
                if (accid && password) {
                    sendScore("add_bad", accid, password);
                    saveCategoryProgress(false);
                }
            }
        });
    }

    // 回答モード切替の設定
    function setupAnswerModeSettings() {
        // ローカルストレージから現在の設定を取得
        const currentMode = localStorage.getItem('answer_mode') || 'choice';
        
        // ラジオボタンの初期選択
        document.getElementById('choice-mode').checked = (currentMode === 'choice');
        document.getElementById('handwriting-mode').checked = (currentMode === 'handwriting');
        
        // UIの初期表示を設定
        setAnswerMode(currentMode);
        
        // モード変更イベント
        document.getElementById('choice-mode').addEventListener('change', function() {
            if (this.checked) {
                setAnswerMode('choice');
            }
        });
        
        document.getElementById('handwriting-mode').addEventListener('change', function() {
            if (this.checked) {
                setAnswerMode('handwriting');
                // 手書きモードに切り替わったらキャンバスをセットアップ
                setupCanvas();
            }
        });
    }

    // 回答モードの切替
    function setAnswerMode(mode) {
        const choiceArea = document.getElementById('choice-answers');
        const handwritingArea = document.getElementById('handwriting-area');
        
        handwritingMode = (mode === 'handwriting');
        
        if (mode === 'choice') {
            choiceArea.style.display = 'block';
            handwritingArea.style.display = 'none';
        } else {
            choiceArea.style.display = 'none';
            handwritingArea.style.display = 'block';
            
            // 手書きモードが選択されたらキャンバスをセットアップ
            setupCanvas();
            
            // 必要な場合のみ遅延ロード
            if (!tesseractLoaded) {
                // 背景でロード開始
                setTimeout(() => {
                    loadTesseract().catch(err => {
                        console.error('Failed to preload Tesseract:', err);
                    });
                }, 1000);
            }
        }
        
        // 設定を保存
        localStorage.setItem('answer_mode', mode);
        console.log(`回答モードを${mode}に設定しました`);
    }

    // 初期設定をすべて実行
    function init() {
        // windowがロードされた後に実行
        if (document.readyState === 'complete') {
            setupEventListeners();
            setupAnswerModeSettings();
        } else {
            window.addEventListener('load', () => {
                setupEventListeners();
                setupAnswerModeSettings();
            });
        }
        
        // リサイズ時にキャンバスサイズを調整
        window.addEventListener('resize', () => {
            if (handwritingMode) {
                setupCanvas();
            }
        });
    }

    // 初期化実行
    init();
});
