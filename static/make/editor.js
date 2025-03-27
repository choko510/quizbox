/**
 * 強化された問題作成エディタのJavaScript
 */

// グローバル変数
let editorSettings = {
    autoSave: true,
    autoSaveInterval: 30000,
    showCharacterCount: true,
    autoQualityCheck: false,
    showPreview: true,
    theme: 'light'
};

let problems = [];        // 問題リスト
let currentProblemIndex = -1;  // 現在選択されている問題のインデックス
let isEditing = false;    // 編集中フラグ
let autoSaveTimer = null; // 自動保存タイマー
let searchTimeout = null; // 検索遅延タイマー

// DOM読み込み完了時の処理
document.addEventListener('DOMContentLoaded', () => {
    // ユーザー名表示
    const userId = Cookies.get('id');
    if (userId) {
        document.getElementById('user-name').textContent = userId;
    }

    // イベントリスナーの設定
    setupEventListeners();
    
    // 保存済みテーマの適用
    const savedTheme = localStorage.getItem('editor-theme') || 'light';
    applyTheme(savedTheme);
    
    // 設定の読み込み
    loadSettings();
    
    // ウェルカム画面のボタン設定
    setupWelcomeOptions();
    
    // ソート可能リストの設定
    initializeSortable();
});

/**
 * ウェルカム画面の選択ボタン設定
 */
function setupWelcomeOptions() {
    // 新規作成ボタン
    document.getElementById('option-create-new').addEventListener('click', () => {
        // 問題データの読み込みと初期化
        initializeEditor();
        switchView('create');
    });
    
    // テンプレートボタン
    document.getElementById('option-template').addEventListener('click', () => {
        switchView('template');
    });
    
    // インポートボタン
    document.getElementById('option-import').addEventListener('click', () => {
        switchView('import');
    });
}

/**
 * エディタ初期化
 */
function initializeEditor() {
    // ローカルストレージから問題を読み込み
    loadProblemsFromLocalStorage();
    
    // 問題リスト更新
    updateProblemList();
    
    // 自動保存設定
    if (editorSettings.autoSave) {
        startAutoSave();
    }
    
    // リッチテキストエディタ初期化
    initializeRichTextEditor();
}

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
    // タブ切り替え
    document.querySelectorAll('.sidebar-nav li').forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.dataset.view;
            switchView(viewId);
            
            // createビューに切り替える際に、まだ初期化されていなければ初期化
            if (viewId === 'create' && problems.length === 0) {
                initializeEditor();
            }
        });
    });

    // モーダル関連
    document.querySelectorAll('.modal-close, .modal-button, .modal-cancel').forEach(button => {
        button.addEventListener('click', () => {
            closeActiveModal();
        });
    });
    
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', () => {
            closeActiveModal();
        });
    });

    // 問題追加ボタン
    document.getElementById('addProblem').addEventListener('click', addNewProblem);
    
    // 選択した問題を削除するボタン
    document.getElementById('deleteSelected').addEventListener('click', deleteSelectedProblem);
    
    // 選択した問題を複製するボタン
    document.getElementById('duplicateSelected').addEventListener('click', duplicateSelectedProblem);
    
    // 問題検索機能
    document.getElementById('problemSearch').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchProblems(e.target.value);
        }, 300);
    });
    
    // プレビューボタン
    document.getElementById('previewButton').addEventListener('click', previewCurrentProblem);
    
    // 品質チェックボタン
    document.getElementById('checkButton').addEventListener('click', checkCurrentProblem);
    
    // 一括削除ボタン
    document.getElementById('bulkDelete').addEventListener('click', confirmBulkDelete);
    
    // エクスポートボタン
    document.getElementById('exportJSON').addEventListener('click', exportProblems);
    
    // 保存・公開ボタン
    document.getElementById('saveBtn').addEventListener('click', saveProblems);
    document.getElementById('releaseBtn').addEventListener('click', releaseProblems);
    
    // 設定保存ボタン
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    
    // テーマ選択
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;
            applyTheme(theme);
            
            // テーマ選択状態の更新
            document.querySelectorAll('.theme-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.theme === theme);
            });
        });
    });
    
    // テンプレート選択
    document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', () => {
            const templateType = card.dataset.template;
            applyTemplate(templateType);
            switchView('create');
        });
    });
    
    // プレビューモードのタブ切り替え
    document.querySelectorAll('.preview-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.mode;
            
            // アクティブなタブを更新
            document.querySelectorAll('.preview-tab').forEach(t => {
                t.classList.toggle('active', t === tab);
            });
            
            // アクティブなプレビューモードを更新
            document.querySelectorAll('.preview-mode').forEach(preview => {
                preview.classList.toggle('active', preview.id === `preview${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
            });
        });
    });
    
    // テスト回答表示ボタン
    document.querySelector('.show-answer-btn').addEventListener('click', (e) => {
        const answerContainer = document.querySelector('.test-answer');
        answerContainer.classList.toggle('hidden');
        e.target.textContent = answerContainer.classList.contains('hidden') ? '回答を表示' : '回答を隠す';
    });
    
    // ファイル読み込みイベント
    document.getElementById('txtload').addEventListener('change', handleFileUpload);
    document.getElementById('csvload').addEventListener('change', handleFileUpload);
    document.getElementById('xlsxload').addEventListener('change', handleFileUpload);
    document.getElementById('imageLoad').addEventListener('change', handleImageUpload);
}

/**
 * リッチテキストエディタの初期化
 */
function initializeRichTextEditor() {
    // リッチテキストツールバーボタン
    document.querySelectorAll('.rich-text-toolbar button').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = button.dataset.action;
            const target = button.closest('.form-group').querySelector('.rich-text-editor');
            
            switch (action) {
                case 'bold':
                    document.execCommand('bold', false, null);
                    break;
                case 'italic':
                    document.execCommand('italic', false, null);
                    break;
                case 'underline':
                    document.execCommand('underline', false, null);
                    break;
                case 'image':
                    insertImage(target);
                    break;
            }
            
            // エディタにフォーカスを戻す
            target.focus();
            
            // 問題内容の変更を保存
            if (currentProblemIndex !== -1) {
                saveProblemContent();
            }
        });
    });

    // エディタの入力イベント
    document.querySelectorAll('.rich-text-editor').forEach(editor => {
        editor.addEventListener('input', () => {
            // 文字数カウント更新
            const counterId = editor.id === 'answerField' ? 'answerCount' : 'questionCount';
            document.getElementById(counterId).textContent = editor.textContent.trim().length;
            
            // 問題内容の変更を保存
            if (currentProblemIndex !== -1) {
                saveProblemContent();
            }
            
            // 自動品質チェック
            if (editorSettings.autoQualityCheck) {
                const answerText = document.getElementById('answerField').textContent.trim();
                const questionText = document.getElementById('questionField').textContent.trim();
                
                if (answerText && questionText) {
                    clearTimeout(window.autoCheckTimeout);
                    window.autoCheckTimeout = setTimeout(() => {
                        checkCurrentProblem(true); // true = 自動チェック
                    }, 1000);
                }
            }
        });
    });
}

/**
 * ドラッグ&ドロップソート機能の初期化
 */
function initializeSortable() {
    const sortableList = document.getElementById('fileContent');
    
    new Sortable(sortableList, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        handle: '.drag-handle',
        onEnd: function(evt) {
            // 並び替え後の順序を問題リストに反映
            const fromIndex = evt.oldIndex;
            const toIndex = evt.newIndex;
            
            if (fromIndex !== toIndex) {
                const movedItem = problems.splice(fromIndex, 1)[0];
                problems.splice(toIndex, 0, movedItem);
                
                // 現在選択中の問題インデックスを更新
                if (currentProblemIndex === fromIndex) {
                    currentProblemIndex = toIndex;
                } else if (currentProblemIndex > fromIndex && currentProblemIndex <= toIndex) {
                    currentProblemIndex--;
                } else if (currentProblemIndex < fromIndex && currentProblemIndex >= toIndex) {
                    currentProblemIndex++;
                }
                
                // 自動保存
                if (editorSettings.autoSave) {
                    saveProblemsToLocalStorage();
                }
            }
        }
    });
}

/**
 * 設定を読み込む
 */
function loadSettings() {
    const savedSettings = localStorage.getItem('editor-settings');
    
    if (savedSettings) {
        try {
            const parsedSettings = JSON.parse(savedSettings);
            editorSettings = { ...editorSettings, ...parsedSettings };
        } catch (e) {
            console.error('設定の読み込みに失敗しました:', e);
        }
    }
    
    // 設定を反映
    document.getElementById('auto-quality-check').checked = editorSettings.autoQualityCheck;
    document.getElementById('show-characters').checked = editorSettings.showCharacterCount;
    document.getElementById('show-preview').checked = editorSettings.showPreview;
    document.getElementById('auto-save').checked = editorSettings.autoSave;
    document.getElementById('auto-save-interval').value = editorSettings.autoSaveInterval;
    
    // 文字数カウントの表示/非表示
    const counters = document.querySelectorAll('.character-counter');
    counters.forEach(counter => {
        counter.style.display = editorSettings.showCharacterCount ? 'block' : 'none';
    });
    
    // テーマ選択の反映
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.toggle('active', option.dataset.theme === editorSettings.theme);
    });
}

/**
 * 設定を保存する
 */
function saveSettings() {
    // 設定値の取得
    editorSettings.autoQualityCheck = document.getElementById('auto-quality-check').checked;
    editorSettings.showCharacterCount = document.getElementById('show-characters').checked;
    editorSettings.showPreview = document.getElementById('show-preview').checked;
    editorSettings.autoSave = document.getElementById('auto-save').checked;
    editorSettings.autoSaveInterval = parseInt(document.getElementById('auto-save-interval').value);
    
    // ローカルストレージに保存
    localStorage.setItem('editor-settings', JSON.stringify(editorSettings));
    
    // 設定の即時反映
    const counters = document.querySelectorAll('.character-counter');
    counters.forEach(counter => {
        counter.style.display = editorSettings.showCharacterCount ? 'block' : 'none';
    });
    
    // 自動保存設定の更新
    if (editorSettings.autoSave) {
        startAutoSave();
    } else {
        stopAutoSave();
    }
    
    showToast('設定を保存しました', 'success');
}

/**
 * テーマを適用する
 */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    editorSettings.theme = theme;
    localStorage.setItem('editor-theme', theme);
}

/**
 * ビューを切り替える
 */
function switchView(viewId) {
    // アクティブなタブを更新
    document.querySelectorAll('.sidebar-nav li').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewId);
    });
    
    // アクティブなビューを更新
    document.querySelectorAll('.editor-view').forEach(view => {
        view.classList.toggle('active', view.id === `${viewId}-view`);
    });
}

/**
 * 問題をローカルストレージから読み込む
 */
function loadProblemsFromLocalStorage() {
    const savedProblems = localStorage.getItem('editor-problems');
    
    if (savedProblems) {
        try {
            problems = JSON.parse(savedProblems);
        } catch (e) {
            console.error('保存された問題の読み込みに失敗しました:', e);
            problems = [];
        }
    } else {
        problems = [];
    }
    
    // 初期状態で空の問題を1つ追加する
    if (problems.length === 0) {
        addNewProblem();
    }
}

/**
 * 問題をローカルストレージに保存する
 */
function saveProblemsToLocalStorage() {
    try {
        localStorage.setItem('editor-problems', JSON.stringify(problems));
        document.getElementById('save-status').textContent = '自動保存: ' + new Date().toLocaleTimeString();
    } catch (e) {
        console.error('問題の保存に失敗しました:', e);
        showToast('自動保存に失敗しました', 'error');
    }
}

/**
 * 自動保存を開始する
 */
function startAutoSave() {
    stopAutoSave();
    autoSaveTimer = setInterval(() => {
        saveProblemsToLocalStorage();
    }, editorSettings.autoSaveInterval);
}

/**
 * 自動保存を停止する
 */
function stopAutoSave() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
}

/**
 * 問題リストを更新する
 */
function updateProblemList() {
    const listElement = document.getElementById('fileContent');
    listElement.innerHTML = '';
    
    if (problems.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'empty-list';
        emptyItem.textContent = '問題がありません';
        listElement.appendChild(emptyItem);
    } else {
        problems.forEach((problem, index) => {
            const li = document.createElement('li');
            li.className = index === currentProblemIndex ? 'selected' : '';
            li.dataset.index = index;
            
            // ドラッグハンドル
            const dragHandle = document.createElement('span');
            dragHandle.className = 'drag-handle';
            dragHandle.innerHTML = '<i class="bi bi-grip-vertical"></i>';
            li.appendChild(dragHandle);
            
            // プレビュー
            const preview = document.createElement('div');
            preview.className = 'problem-preview';
            preview.textContent = problem.question || '(問題なし)';
            li.appendChild(preview);
            
            // メタデータ
            const meta = document.createElement('div');
            meta.className = 'problem-meta';
            const chars = (problem.answer?.length || 0) + (problem.question?.length || 0);
            meta.textContent = `${chars}文字`;
            li.appendChild(meta);
            
            // 問題クリック時の選択処理
            li.addEventListener('click', () => {
                selectProblem(index);
            });
            
            listElement.appendChild(li);
        });
    }
    
    // 問題数表示の更新
    document.getElementById('total-accs').textContent = `問題数: ${problems.length}`;
    
    // 保存・公開ボタンの有効/無効設定
    const saveBtn = document.getElementById('saveBtn');
    const releaseBtn = document.getElementById('releaseBtn');
    
    if (problems.length > 0 && problems.some(p => p.answer && p.question)) {
        saveBtn.classList.remove('disable-btn');
        releaseBtn.classList.remove('disable-btn');
    } else {
        saveBtn.classList.add('disable-btn');
        releaseBtn.classList.add('disable-btn');
    }
}

/**
 * 問題を選択する
 */
function selectProblem(index) {
    if (index < 0 || index >= problems.length) return;
    
    // 以前の選択を解除
    const listItems = document.querySelectorAll('#fileContent li');
    listItems.forEach(item => item.classList.remove('selected'));
    
    // 新しい選択を設定
    currentProblemIndex = index;
    const selectedItem = document.querySelector(`#fileContent li[data-index="${index}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    // 編集エリアを表示
    document.getElementById('noSelection').classList.add('hidden');
    document.getElementById('problemEditor').classList.remove('hidden');
    
    // フォームにデータを設定
    const problem = problems[index];
    document.getElementById('answerField').innerHTML = problem.answerHtml || problem.answer || '';
    document.getElementById('questionField').innerHTML = problem.questionHtml || problem.question || '';
    
    // 文字数カウント更新
    document.getElementById('answerCount').textContent = (problem.answer || '').length;
    document.getElementById('questionCount').textContent = (problem.question || '').length;
    
    // バリデーションフィードバックをクリア
    document.getElementById('validationFeedback').innerHTML = '';
}

/**
 * 新しい問題を追加する
 */
function addNewProblem() {
    const newProblem = {
        answer: '',
        question: '',
        answerHtml: '',
        questionHtml: '',
        created: new Date().toISOString()
    };
    
    problems.push(newProblem);
    updateProblemList();
    selectProblem(problems.length - 1);
    
    // 自動保存
    if (editorSettings.autoSave) {
        saveProblemsToLocalStorage();
    }
    
    // フォーカスを問題フィールドに設定
    document.getElementById('answerField').focus();
}

/**
 * 選択された問題を削除する
 */
function deleteSelectedProblem() {
    if (currentProblemIndex === -1) return;
    
    problems.splice(currentProblemIndex, 1);
    
    // 現在選択されている問題の調整
    if (problems.length === 0) {
        currentProblemIndex = -1;
        document.getElementById('noSelection').classList.remove('hidden');
        document.getElementById('problemEditor').classList.add('hidden');
        
        // 空の問題を追加
        addNewProblem();
    } else {
        currentProblemIndex = Math.min(currentProblemIndex, problems.length - 1);
    }
    
    updateProblemList();
    
    // 選択がある場合は反映
    if (currentProblemIndex !== -1) {
        selectProblem(currentProblemIndex);
    }
    
    // 自動保存
    if (editorSettings.autoSave) {
        saveProblemsToLocalStorage();
    }
}

/**
 * 選択された問題を複製する
 */
function duplicateSelectedProblem() {
    if (currentProblemIndex === -1) return;
    
    const original = problems[currentProblemIndex];
    const duplicate = { ...original, created: new Date().toISOString() };
    
    problems.splice(currentProblemIndex + 1, 0, duplicate);
    updateProblemList();
    selectProblem(currentProblemIndex + 1);
    
    // 自動保存
    if (editorSettings.autoSave) {
        saveProblemsToLocalStorage();
    }
}

/**
 * 問題内容を保存する
 */
function saveProblemContent() {
    if (currentProblemIndex === -1) return;
    
    const answerField = document.getElementById('answerField');
    const questionField = document.getElementById('questionField');
    
    problems[currentProblemIndex] = {
        ...problems[currentProblemIndex],
        answer: answerField.textContent.trim(),
        question: questionField.textContent.trim(),
        answerHtml: answerField.innerHTML,
        questionHtml: questionField.innerHTML,
        updated: new Date().toISOString()
    };
    
    // リストのプレビューを更新
    const selectedItem = document.querySelector(`#fileContent li[data-index="${currentProblemIndex}"]`);
    if (selectedItem) {
        const preview = selectedItem.querySelector('.problem-preview');
        if (preview) {
            preview.textContent = problems[currentProblemIndex].question || '(問題なし)';
        }
        
        // メタデータ更新
        const meta = selectedItem.querySelector('.problem-meta');
        if (meta) {
            const chars = (problems[currentProblemIndex].answer?.length || 0) + (problems[currentProblemIndex].question?.length || 0);
            meta.textContent = `${chars}文字`;
        }
    }
    
    // 保存・公開ボタンの状態更新
    const saveBtn = document.getElementById('saveBtn');
    const releaseBtn = document.getElementById('releaseBtn');
    
    if (problems.some(p => p.answer && p.question)) {
        saveBtn.classList.remove('disable-btn');
        releaseBtn.classList.remove('disable-btn');
    } else {
        saveBtn.classList.add('disable-btn');
        releaseBtn.classList.add('disable-btn');
    }
}

/**
 * 画像を挿入する
 */
function insertImage(target) {
    // ファイル選択ダイアログを表示
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // 画像をBase64エンコード
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = document.createElement('img');
                    img.src = event.target.result;
                    img.style.maxWidth = '100%';
                    
                    // 選択範囲に画像を挿入
                    document.execCommand('insertHTML', false, img.outerHTML);
                    
                    // 問題内容の変更を保存
                    saveProblemContent();
                };
                reader.readAsDataURL(file);
            } catch (error) {
                showToast('画像の挿入に失敗しました: ' + error, 'error');
            }
        }
        
        // 使用後に要素を削除
        document.body.removeChild(input);
    };
    
    input.click();
}

/**
 * 現在の問題をプレビューする
 */
function previewCurrentProblem() {
    if (currentProblemIndex === -1) return;
    
    const problem = problems[currentProblemIndex];
    
    if (!problem.answer && !problem.question) {
        showToast('プレビューする問題がありません', 'warning');
        return;
    }
    
    // プレビューの各モードに内容を設定
    document.getElementById('previewQuestion').innerHTML = problem.questionHtml || problem.question || '';
    document.getElementById('previewAnswer').innerHTML = problem.answerHtml || problem.answer || '';
    
    document.getElementById('testModeQuestion').innerHTML = problem.questionHtml || problem.question || '';
    document.getElementById('testModeAnswer').innerHTML = problem.answerHtml || problem.answer || '';
    
    // コードモードの内容
    document.getElementById('previewCodeContent').textContent = 
        `問題: ${problem.question}\n回答: ${problem.answer}`;
    
    // 回答を非表示に初期化
    document.querySelector('.test-answer').classList.add('hidden');
    document.querySelector('.show-answer-btn').textContent = '回答を表示';
    
    // モーダルを表示
    document.getElementById('previewModal').classList.add('active');
}

/**
 * 現在の問題の品質をチェックする
 */
async function checkCurrentProblem(isAuto = false) {
    if (currentProblemIndex === -1) return;
    
    const problem = problems[currentProblemIndex];
    const answerText = problem.answer;
    const questionText = problem.question;
    
    if (!answerText || !questionText) {
        if (!isAuto) showToast('チェックするテキストがありません', 'warning');
        return;
    }
    
    // すでにフィードバックがある場合はクリア
    const feedbackContainer = document.getElementById('validationFeedback');
    feedbackContainer.innerHTML = '';
    
    if (!isAuto) {
        // 手動チェックの場合は通知
        showToast('品質をチェック中...', 'info');
    }
    
    try {
        // 品質チェックAPIを呼び出す
        const response = await fetch('/api/process/text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: [`問題：${questionText}\n回答：${answerText}`],
                checkType: 'quality'
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success' && data.results && data.results.length > 0) {
            const result = data.results[0];
            const feedbackText = result.feedback || '';
            
            // 問題なしかどうかを判定
            const isGood = feedbackText.includes('問題ありません') || 
                feedbackText.includes('良好です') || 
                feedbackText.includes('適切です') || 
                feedbackText.includes('明確です');
            
            // フィードバックの表示
            const feedbackDiv = document.createElement('div');
            feedbackDiv.className = `validation-message ${isGood ? 'success' : 'warning'}`;
            
            if (isGood) {
                feedbackDiv.innerHTML = '<i class="bi bi-check-circle"></i> 品質は良好です';
            } else {
                // マークダウン形式のテキストをシンプルに表示
                const feedback = feedbackText
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                    .replace(/\n/g, '<br>');
                
                feedbackDiv.innerHTML = feedback;
            }
            
            feedbackContainer.appendChild(feedbackDiv);
            
            if (!isAuto) {
                showToast('品質チェックが完了しました', 'success');
            }
        }
    } catch (error) {
        console.error('品質チェックエラー:', error);
        if (!isAuto) {
            showToast('チェック中にエラーが発生しました', 'error');
        }
    }
}

/**
 * 問題を検索する
 */
function searchProblems(searchTerm) {
    if (!searchTerm) {
        // 検索条件がなければ全て表示
        document.querySelectorAll('#fileContent li').forEach(li => {
            li.style.display = '';
        });
        return;
    }
    
    searchTerm = searchTerm.toLowerCase();
    
    document.querySelectorAll('#fileContent li').forEach(li => {
        const index = parseInt(li.dataset.index);
        if (isNaN(index)) return;
        
        const problem = problems[index];
        if (!problem) return;
        
        const answer = (problem.answer || '').toLowerCase();
        const question = (problem.question || '').toLowerCase();
        
        if (answer.includes(searchTerm) || question.includes(searchTerm)) {
            li.style.display = '';
        } else {
            li.style.display = 'none';
        }
    });
}

/**
 * 一括削除の確認
 */
function confirmBulkDelete() {
    if (problems.length === 0) {
        showToast('削除する問題がありません', 'warning');
        return;
    }
    
    if (confirm('すべての問題を削除してもよろしいですか？この操作は元に戻せません。')) {
        problems = [];
        currentProblemIndex = -1;
        
        // 空の問題を1つ追加
        addNewProblem();
        
        // 編集エリアをリセット
        document.getElementById('noSelection').classList.remove('hidden');
        document.getElementById('problemEditor').classList.add('hidden');
        
        // 自動保存
        if (editorSettings.autoSave) {
            saveProblemsToLocalStorage();
        }
        
        showToast('すべての問題を削除しました', 'success');
    }
}

/**
 * 問題をエクスポートする
 */
function exportProblems() {
    if (problems.length === 0 || !problems.some(p => p.answer && p.question)) {
        showToast('エクスポートする問題がありません', 'warning');
        return;
    }
    
    // 有効な問題だけフィルタリング
    const validProblems = problems.filter(p => p.answer && p.question);
    
    // JSONデータ作成
    const exportData = validProblems.map(p => {
        return {
            answer: p.answer,
            question: p.question
        };
    });
    
    // JSONデータのダウンロード
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `mondai_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('問題をエクスポートしました', 'success');
}

/**
 * テンプレートを適用する
 */
function applyTemplate(templateType) {
    // 現在の問題をクリア
    problems = [];
    
    switch (templateType) {
        case 'basic':
            // 基本的な問題と回答のペア
            problems.push({ 
                answer: '東京', 
                question: '日本の首都は？',
                answerHtml: '東京',
                questionHtml: '日本の首都は？',
                created: new Date().toISOString()
            });
            break;
            
        case 'multiple-choice':
            // 選択問題形式
            problems.push({ 
                answer: '3. パリ', 
                question: 'フランスの首都はどれですか？\n1. ロンドン\n2. ベルリン\n3. パリ\n4. マドリード',
                answerHtml: '<strong>3. パリ</strong>',
                questionHtml: 'フランスの首都はどれですか？<br>1. ロンドン<br>2. ベルリン<br>3. パリ<br>4. マドリード',
                created: new Date().toISOString()
            });
            break;
            
        case 'true-false':
            // 〇×問題形式
            problems.push({ 
                answer: '×', 
                question: 'オーストラリアの首都はシドニーである',
                answerHtml: '×',
                questionHtml: 'オーストラリアの首都はシドニーである',
                created: new Date().toISOString()
            });
            break;
    }
    
    // 空の問題を追加
    problems.push({
        answer: '',
        question: '',
        answerHtml: '',
        questionHtml: '',
        created: new Date().toISOString()
    });
    
    updateProblemList();
    selectProblem(0);
    
    // 自動保存
    if (editorSettings.autoSave) {
        saveProblemsToLocalStorage();
    }
    
    showToast('テンプレートを適用しました', 'success');
}

/**
 * 問題をサーバーに保存する
 */
async function saveProblems() {
    // 有効な問題だけフィルタリング
    const validProblems = problems.filter(p => p.answer && p.question);
    
    if (validProblems.length === 0) {
        showToast('保存する問題がありません', 'error');
        return;
    }
    
    const name = prompt('問題セットの名前を入力してください:');
    if (!name) {
        showToast('名前が入力されていません。保存をキャンセルしました。', 'warning');
        return;
    }
    
    const userId = Cookies.get('id');
    const password = Cookies.get('password');
    
    if (!userId || !password) {
        showToast('ログインが必要です', 'error');
        return;
    }
    
    // API用のデータ形式に変換
    const mondaiData = validProblems.map(p => `${p.answer},${p.question}`);
    
    try {
        const response = await fetch('/api/make/mondai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                userid: userId,
                password: password,
                mondai: mondaiData,
                is_public: false
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showToast('問題が保存されました', 'success');
            
            // 保存成功後、エディタをクリア
            problems = [{
                answer: '',
                question: '',
                answerHtml: '',
                questionHtml: '',
                created: new Date().toISOString()
            }];
            
            currentProblemIndex = 0;
            updateProblemList();
            selectProblem(0);
            
            // ローカルストレージも更新
            if (editorSettings.autoSave) {
                saveProblemsToLocalStorage();
            }
        } else {
            showToast('問題の保存に失敗しました: ' + (result.message || ''), 'error');
        }
    } catch (error) {
        console.error('保存エラー:', error);
        showToast('サーバーとの通信に失敗しました', 'error');
    }
}

/**
 * 問題をサーバーに公開する
 */
async function releaseProblems() {
    // 有効な問題だけフィルタリング
    const validProblems = problems.filter(p => p.answer && p.question);
    
    if (validProblems.length === 0) {
        showToast('公開する問題がありません', 'error');
        return;
    }
    
    const name = prompt('公開する問題セットの名前を入力してください:');
    if (!name) {
        showToast('名前が入力されていません。公開をキャンセルしました。', 'warning');
        return;
    }
    
    const userId = Cookies.get('id');
    const password = Cookies.get('password');
    
    if (!userId || !password) {
        showToast('ログインが必要です', 'error');
        return;
    }
    
    // API用のデータ形式に変換
    const mondaiData = validProblems.map(p => `${p.answer},${p.question}`);
    
    try {
        const response = await fetch('/api/make/mondai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                userid: userId,
                password: password,
                mondai: mondaiData,
                is_public: true
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showToast('問題が公開されました', 'success');
            
            // 保存成功後、エディタをクリア
            problems = [{
                answer: '',
                question: '',
                answerHtml: '',
                questionHtml: '',
                created: new Date().toISOString()
            }];
            
            currentProblemIndex = 0;
            updateProblemList();
            selectProblem(0);
            
            // ローカルストレージも更新
            if (editorSettings.autoSave) {
                saveProblemsToLocalStorage();
            }
        } else {
            showToast('問題の公開に失敗しました: ' + (result.message || ''), 'error');
        }
    } catch (error) {
        console.error('公開エラー:', error);
        showToast('サーバーとの通信に失敗しました', 'error');
    }
}

/**
 * ファイルアップロード処理
 */
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const fileType = event.target.id;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        let data = [];
        
        try {
            if (fileType === 'xlsxload') {
                // Excelファイル処理
                const content = e.target.result;
                const workbook = XLSX.read(content, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                
                for (let i = 1; i < 1000; i++) {
                    const answer = sheet['A' + i];
                    const question = sheet['B' + i];
                    if (answer && question) {
                        data.push({
                            answer: answer.v,
                            question: question.v,
                            answerHtml: answer.v,
                            questionHtml: question.v,
                            created: new Date().toISOString()
                        });
                    }
                }
            } else {
                // テキスト/CSVファイル処理
                const content = e.target.result;
                const lines = content.split(/\r\n|\n/);
                
                lines.forEach(line => {
                    if (line.trim()) {
                        const [answer, question] = line.split(',').map(item => item.trim());
                        if (answer && question) {
                            data.push({
                                answer: answer,
                                question: question,
                                answerHtml: answer,
                                questionHtml: question,
                                created: new Date().toISOString()
                            });
                        }
                    }
                });
            }
            
            if (data.length > 0) {
                // 問題リストを更新
                problems = [...data, {
                    answer: '',
                    question: '',
                    answerHtml: '',
                    questionHtml: '',
                    created: new Date().toISOString()
                }];
                
                updateProblemList();
                selectProblem(0);
                
                // 自動保存
                if (editorSettings.autoSave) {
                    saveProblemsToLocalStorage();
                }
                
                showToast(`${data.length}個の問題を読み込みました`, 'success');
                
                // 作成ビューに切り替え
                switchView('create');
            } else {
                showToast('読み込める問題がありませんでした', 'warning');
            }
        } catch (error) {
            console.error('ファイル読み込みエラー:', error);
            showToast('ファイルの読み込みに失敗しました', 'error');
        }
    };
    
    if (fileType === 'xlsxload') {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

/**
 * 画像アップロード処理
 */
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        // 画像アップロード
        showToast('画像をアップロード中...', 'info');
        
        const uploadResponse = await fetch('/api/upload/image', {
            method: 'POST',
            body: formData
        });
        
        const uploadData = await uploadResponse.json();
        
        if (uploadData.status === 'success') {
            showToast('画像をAIで解析中...', 'info');
            
            // 画像解析
            const processResponse = await fetch('/api/process/image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id: uploadData.id })
            });
            
            const processData = await processResponse.json();
            
            if (processData.status === 'success') {
                // 新しい問題として追加
                problems.push({
                    answer: processData.data,
                    question: '画像の説明は？',
                    answerHtml: processData.data,
                    questionHtml: '画像の説明は？',
                    created: new Date().toISOString()
                });
                
                updateProblemList();
                selectProblem(problems.length - 1);
                
                // 自動保存
                if (editorSettings.autoSave) {
                    saveProblemsToLocalStorage();
                }
                
                showToast('画像から問題を作成しました', 'success');
                
                // 作成ビューに切り替え
                switchView('create');
                
                // プレビュー表示
                const reader = new FileReader();
                reader.onload = function (e) {
                    showImagePreview(e.target.result);
                };
                reader.readAsDataURL(file);
            } else {
                showToast('画像の解析に失敗しました', 'error');
            }
        } else {
            showToast('画像のアップロードに失敗しました', 'error');
        }
    } catch (error) {
        console.error('画像処理エラー:', error);
        showToast('画像処理中にエラーが発生しました', 'error');
    }
}

/**
 * クリップボードから読み込む
 */
function copy() {
    navigator.clipboard.readText().then(text => {
        if (!text.trim()) {
            showToast('クリップボードに読み込めるテキストがありません', 'warning');
            return;
        }
        
        const lines = text.split(/\r\n|\n/);
        const data = [];
        
        lines.forEach(line => {
            if (line.trim()) {
                let answer, question;
                
                // カンマ、タブ、または区切り文字で分割を試みる
                if (line.includes(',')) {
                    [answer, question] = line.split(',').map(item => item.trim());
                } else if (line.includes('\t')) {
                    [answer, question] = line.split('\t').map(item => item.trim());
                }
                
                if (answer && question) {
                    data.push({
                        answer: answer,
                        question: question,
                        answerHtml: answer,
                        questionHtml: question,
                        created: new Date().toISOString()
                    });
                }
            }
        });
        
        if (data.length > 0) {
            // 問題リストを更新
            problems = [...data, {
                answer: '',
                question: '',
                answerHtml: '',
                questionHtml: '',
                created: new Date().toISOString()
            }];
            
            updateProblemList();
            selectProblem(0);
            
            // 自動保存
            if (editorSettings.autoSave) {
                saveProblemsToLocalStorage();
            }
            
            showToast(`${data.length}個の問題を読み込みました`, 'success');
            
            // 作成ビューに切り替え
            switchView('create');
        } else {
            showToast('読み込める問題がありませんでした', 'warning');
        }
    }).catch(error => {
        console.error('クリップボード読み込みエラー:', error);
        showToast('クリップボードからの読み込みに失敗しました', 'error');
    });
}

/**
 * テンプレートダウンロードモーダルを表示
 */
function templatedl() {
    document.getElementById('downloadlist').classList.add('active');
}

/**
 * 画像プレビューを表示
 */
function showImagePreview(imageUrl) {
    const container = document.querySelector('.preview-container');
    const img = container.querySelector('.preview-image');
    img.src = imageUrl;
    container.style.display = 'flex';
}

/**
 * アクティブなモーダルを閉じる
 */
function closeActiveModal() {
    document.querySelectorAll('.modal.active').forEach(modal => {
        modal.classList.remove('active');
    });
}

/**
 * トースト通知を表示
 */
function showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/**
 * 保存関数
 */
function save() {
    saveProblems();
}

/**
 * 公開関数
 */
function release() {
    releaseProblems();
}
