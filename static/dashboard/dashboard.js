/**
 * 問題管理ダッシュボード用JavaScript
 */

// グローバル変数
let userData = null;          // ユーザー情報
let userProblems = [];        // ユーザーの作成した問題一覧
let currentProblem = null;    // 現在選択されている問題
let dashboardSettings = null; // ダッシュボード設定
let charts = {};              // グラフオブジェクト保存用
let sortConfig = {            // テーブルソート設定
    column: null,             // ソート列
    direction: 'asc'          // ソート方向（asc/desc）
};

// DOM読み込み完了時の処理
document.addEventListener('DOMContentLoaded', () => {
    // ユーザー認証情報の取得
    const userId = Cookies.get('id');
    const password = Cookies.get('password');
    
    if (!userId || !password) {
        showToast('ログインが必要です', 'error');
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
        return;
    }
    
    // ユーザー名表示
    document.getElementById('user-name').textContent = userId;
    
    // ダッシュボード設定の読み込み
    loadDashboardSettings();
    
    // 初期データの読み込み
    loadUserProblems();
    
    // イベントリスナーの設定
    setupEventListeners();
    
    // テーマの適用
    applyTheme(localStorage.getItem('dashboard-theme') || 'light');
});

/**
 * ダッシュボード設定を読み込む
 */
function loadDashboardSettings() {
    const defaultSettings = {
        widgets: {
            totalProblems: true,
            publicProblems: true,
            recentProblems: true,
            accuracy: true
        },
        theme: 'light'
    };
    
    try {
        const savedSettings = localStorage.getItem('dashboard-settings');
        dashboardSettings = savedSettings ? JSON.parse(savedSettings) : defaultSettings;
        
        // 設定を適用
        applyDashboardSettings();
    } catch (error) {
        console.error('設定の読み込みに失敗しました:', error);
        dashboardSettings = defaultSettings;
    }
}

/**
 * ダッシュボード設定を保存する
 */
function saveDashboardSettings() {
    try {
        localStorage.setItem('dashboard-settings', JSON.stringify(dashboardSettings));
        showToast('設定を保存しました', 'success');
    } catch (error) {
        console.error('設定の保存に失敗しました:', error);
        showToast('設定の保存に失敗しました', 'error');
    }
}

/**
 * ダッシュボード設定を適用する
 */
function applyDashboardSettings() {
    // ウィジェット表示設定
    document.getElementById('show-total-problems').checked = dashboardSettings.widgets.totalProblems;
    document.getElementById('show-public-problems').checked = dashboardSettings.widgets.publicProblems;
    document.getElementById('show-recent-problems').checked = dashboardSettings.widgets.recentProblems;
    document.getElementById('show-accuracy').checked = dashboardSettings.widgets.accuracy;
    
    // ウィジェット表示制御
    document.getElementById('total-problems-widget').style.display = 
        dashboardSettings.widgets.totalProblems ? 'block' : 'none';
    document.getElementById('public-problems-widget').style.display = 
        dashboardSettings.widgets.publicProblems ? 'block' : 'none';
    document.getElementById('recent-problems-widget').style.display = 
        dashboardSettings.widgets.recentProblems ? 'block' : 'none';
    document.getElementById('accuracy-widget').style.display = 
        dashboardSettings.widgets.accuracy ? 'block' : 'none';
    
    // テーマ設定
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
        if (option.dataset.theme === dashboardSettings.theme) {
            option.classList.add('active');
        }
    });
    
    applyTheme(dashboardSettings.theme);
}

/**
 * テーマを適用する
 */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dashboard-theme', theme);
    dashboardSettings.theme = theme;
}

/**
 * ユーザーの問題一覧を読み込む
 */
async function loadUserProblems() {
    const userId = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        // ダッシュボード用APIを使用して詳細情報を一括取得
        const response = await fetch('/api/dashboard/problems', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: userId,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (data.message === "password is wrong") {
            showToast('認証に失敗しました', 'error');
            return;
        }
        
        if (!data.problems || data.problems.length === 0) {
            showNoProblemsMessage();
            return;
        }
        
        userProblems = data.problems;
        
        // ダッシュボード更新
        updateDashboard();
        
    } catch (error) {
        console.error('問題データの読み込みに失敗しました:', error);
        showToast('問題データの読み込みに失敗しました', 'error');
    }
}

/**
 * 問題がない場合のメッセージを表示
 */
function showNoProblemsMessage() {
    document.getElementById('total-problems-count').textContent = '0';
    document.getElementById('public-problems-count').textContent = '0';
    document.getElementById('recent-problems-list').innerHTML = '<li class="no-data">問題がありません</li>';
    document.getElementById('problems-table-body').innerHTML = '<tr class="no-data"><td colspan="5">問題が見つかりません</td></tr>';
    
    // 統計データ初期化
    initializeCharts([]);
}

/**
 * ダッシュボードを更新する
 */
function updateDashboard() {
    // 問題数表示の更新
    document.getElementById('total-problems-count').textContent = userProblems.length;
    
    // 公開問題数の更新
    const publicProblems = userProblems.filter(p => p.is_public);
    document.getElementById('public-problems-count').textContent = publicProblems.length;
    
    // 最近の問題一覧の更新
    updateRecentProblemsList();
    
    // 問題一覧テーブルの更新
    updateProblemTable();
    
    // 統計データの更新
    updateStatistics();
}

/**
 * 最近の問題一覧を更新
 */
function updateRecentProblemsList() {
    const recentList = document.getElementById('recent-problems-list');
    
    // 問題がない場合
    if (userProblems.length === 0) {
        recentList.innerHTML = '<li class="no-data">問題がありません</li>';
        return;
    }
    
    // 最新の5件を表示
    const recentProblems = [...userProblems]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
    
    recentList.innerHTML = '';
    recentProblems.forEach(problem => {
        const li = document.createElement('li');
        li.textContent = problem.name + ` (${problem.problemCount}問)`;
        li.addEventListener('click', () => {
            // プレビュー表示
            const isVisible = toggleProblemPreview(problem);
            
            // 操作欄のボタンテキストも更新
            const previewBtn = document.querySelector(`.preview-button[data-problem-id="${problem.name}"]`);
            if (previewBtn) {
                previewBtn.textContent = isVisible ? '非表示' : '表示';
            }
        });
        recentList.appendChild(li);
    });
}

/**
 * 問題をソートする
 */
function sortProblems(problems, column, direction) {
    if (!column) return problems;
    
    return [...problems].sort((a, b) => {
        let valueA, valueB;
        
        // 列に応じた値の取得
        if (column === 'problemCount') {
            valueA = a.problemCount;
            valueB = b.problemCount;
            // 数値比較
            return direction === 'asc' ? valueA - valueB : valueB - valueA;
        } else if (column === 'created_at') {
            // 日付比較
            valueA = new Date(a.created_at);
            valueB = new Date(b.created_at);
            return direction === 'asc' ? valueA - valueB : valueB - valueA;
        }
        
        return 0;
    });
}

/**
 * 問題一覧テーブルを更新
 */
function updateProblemTable() {
    const tableBody = document.getElementById('problems-table-body');
    
    // 問題がない場合
    if (userProblems.length === 0) {
        tableBody.innerHTML = '<tr class="no-data"><td colspan="5">問題が見つかりません</td></tr>';
        return;
    }
    
    // ソート処理
    const sortedProblems = sortProblems(userProblems, sortConfig.column, sortConfig.direction);
    
    // テーブル更新
    tableBody.innerHTML = '';
    
    // ソート方向アイコンの更新
    document.querySelectorAll('th.sortable .sort-icon').forEach(icon => {
        icon.textContent = '⇅';
    });
    
    if (sortConfig.column) {
        const sortIcon = document.querySelector(`th.sortable[data-sort="${sortConfig.column}"] .sort-icon`);
        if (sortIcon) {
            sortIcon.textContent = sortConfig.direction === 'asc' ? '↑' : '↓';
        }
    }
    userProblems.forEach(problem => {
        const row = document.createElement('tr');
        
        // 問題名
        const nameCell = document.createElement('td');
        nameCell.textContent = problem.name;
        row.appendChild(nameCell);
        
        // 問題数
        const countCell = document.createElement('td');
        countCell.textContent = problem.problemCount;
        row.appendChild(countCell);
        
        // 公開状態
        const statusCell = document.createElement('td');
        const statusToggle = document.createElement('button');
        statusToggle.className = 'visibility-toggle';
        statusToggle.textContent = problem.is_public ? '🌐' : '🔒';
        statusToggle.title = problem.is_public ? '公開中' : '非公開';
        statusToggle.addEventListener('click', () => toggleProblemVisibility(problem));
        statusCell.appendChild(statusToggle);
        row.appendChild(statusCell);
        
        // 作成日
        const dateCell = document.createElement('td');
        const date = new Date(problem.created_at);
        dateCell.textContent = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
        row.appendChild(dateCell);
        
        // 操作ボタン
        const actionsCell = document.createElement('td');
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        // プレビューボタン
        const previewBtn = document.createElement('button');
        previewBtn.className = 'action-button preview-button';
        previewBtn.textContent = '表示';
        previewBtn.dataset.problemId = problem.name; // 問題識別用のデータ属性
        previewBtn.addEventListener('click', (e) => {
            const isVisible = toggleProblemPreview(problem);
            e.target.textContent = isVisible ? '非表示' : '表示';
        });
        actionButtons.appendChild(previewBtn);
        
        // 編集ボタン
        const editBtn = document.createElement('button');
        editBtn.className = 'action-button edit-button';
        editBtn.textContent = '編集';
        editBtn.addEventListener('click', () => editProblem(problem));
        actionButtons.appendChild(editBtn);
        
        // 複製ボタン
        const duplicateBtn = document.createElement('button');
        duplicateBtn.className = 'action-button duplicate-button';
        duplicateBtn.textContent = '複製';
        duplicateBtn.addEventListener('click', () => duplicateProblem(problem));
        actionButtons.appendChild(duplicateBtn);
        
        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-button delete-button';
        deleteBtn.textContent = '削除';
        deleteBtn.addEventListener('click', () => confirmDeleteProblem(problem));
        actionButtons.appendChild(deleteBtn);
        
        actionsCell.appendChild(actionButtons);
        row.appendChild(actionsCell);
        
        tableBody.appendChild(row);
    });
}

/**
 * 問題プレビューを表示
 */
function showProblemPreview(problem) {
    currentProblem = problem;
    
    // プレビュータイトル
    document.getElementById('preview-problem-name').textContent = `問題名: ${problem.name}`;
    
    // 問題アイテム表示
    const previewItems = document.getElementById('preview-problem-items');
    previewItems.innerHTML = '';
    
    if (Array.isArray(problem.data)) {
        problem.data.forEach(item => {
            const parts = item.split(',');
            if (parts.length >= 2) {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'problem-item';
                
                const question = document.createElement('div');
                question.className = 'problem-question';
                question.textContent = `Q: ${parts[1]}`;
                itemDiv.appendChild(question);
                
                const answer = document.createElement('div');
                answer.className = 'problem-answer';
                answer.textContent = `A: ${parts[0]}`;
                itemDiv.appendChild(answer);
                
                previewItems.appendChild(itemDiv);
            }
        });
    }
    
    // プレビュー表示
    document.getElementById('problem-preview').style.display = 'block';
}

/**
 * 問題プレビューを表示/非表示切り替え
 */
function toggleProblemPreview(problem) {
    const previewElement = document.getElementById('problem-preview');
    const isCurrentlyVisible = previewElement.style.display === 'block';
    
    // 表示中の問題と異なる場合は内容を更新
    if (!isCurrentlyVisible || currentProblem?.name !== problem.name) {
        // プレビュータイトル
        document.getElementById('preview-problem-name').textContent = `問題名: ${problem.name}`;
        
        // 問題アイテム表示
        const previewItems = document.getElementById('preview-problem-items');
        previewItems.innerHTML = '';
        
        if (Array.isArray(problem.data)) {
            problem.data.forEach(item => {
                const parts = item.split(',');
                if (parts.length >= 2) {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'problem-item';
                    
                    const question = document.createElement('div');
                    question.className = 'problem-question';
                    question.textContent = `Q: ${parts[1]}`;
                    itemDiv.appendChild(question);
                    
                    const answer = document.createElement('div');
                    answer.className = 'problem-answer';
                    answer.textContent = `A: ${parts[0]}`;
                    itemDiv.appendChild(answer);
                    
                    previewItems.appendChild(itemDiv);
                }
            });
        }
    }
    
    if (isCurrentlyVisible && currentProblem?.name === problem.name) {
        // 同じ問題が表示されている場合は非表示にする
        previewElement.style.display = 'none';
        currentProblem = null;
        return false; // 非表示になったことを返す
    } else {
        // 表示されていない、または別の問題が表示されている場合は表示する
        previewElement.style.display = 'block';
        currentProblem = problem;
        return true; // 表示されたことを返す
    }
}

/**
 * 問題プレビューを閉じる
 */
function closeProblemPreview() {
    document.getElementById('problem-preview').style.display = 'none';
    
    // 表示ボタンのテキストを元に戻す
    const problemId = currentProblem?.name;
    if (problemId) {
        const previewBtn = document.querySelector(`.preview-button[data-problem-id="${problemId}"]`);
        if (previewBtn) {
            previewBtn.textContent = '表示';
        }
    }
    
    currentProblem = null;
}

/**
 * 問題の編集モーダルを表示
 */
function editProblem(problem) {
    currentProblem = problem;
    
    // モーダルフィールド設定
    document.getElementById('edit-problem-name').value = problem.name;
    document.getElementById('edit-problem-visibility').value = problem.is_public ? 'public' : 'private';
    
    // 問題アイテムの設定
    const itemsContainer = document.getElementById('edit-problem-items');
    itemsContainer.innerHTML = '';
    
    if (Array.isArray(problem.data)) {
        problem.data.forEach(item => {
            const parts = item.split(',');
            if (parts.length >= 2) {
                addProblemItemToEdit(parts[0], parts[1], itemsContainer);
            }
        });
    }
    
    // モーダル表示
    document.getElementById('edit-modal').classList.add('active');
}

/**
 * 編集フォームに問題アイテムを追加
 */
function addProblemItemToEdit(answer = '', question = '', container = null) {
    const itemContainer = container || document.getElementById('edit-problem-items');
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'edit-problem-item';
    
    // 回答入力フィールド
    const answerInput = document.createElement('input');
    answerInput.type = 'text';
    answerInput.className = 'answer-input';
    answerInput.value = answer;
    answerInput.placeholder = '回答';
    itemDiv.appendChild(answerInput);
    
    // 問題入力フィールド
    const questionInput = document.createElement('input');
    questionInput.type = 'text';
    questionInput.className = 'question-input';
    questionInput.value = question;
    questionInput.placeholder = '問題';
    itemDiv.appendChild(questionInput);
    
    // 削除ボタン
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => {
        itemDiv.remove();
    });
    itemDiv.appendChild(deleteBtn);
    
    itemContainer.appendChild(itemDiv);
}

/**
 * 問題を保存する
 */
async function saveProblem() {
    const userId = Cookies.get('id');
    const password = Cookies.get('password');
    const name = document.getElementById('edit-problem-name').value.trim();
    const isPublic = document.getElementById('edit-problem-visibility').value === 'public';
    
    if (!name) {
        showToast('問題名を入力してください', 'error');
        return;
    }
    
    // 問題データの収集
    const problemItems = [];
    const itemContainers = document.querySelectorAll('.edit-problem-item');
    
    itemContainers.forEach(container => {
        const answer = container.querySelector('.answer-input').value.trim();
        const question = container.querySelector('.question-input').value.trim();
        
        if (answer && question) {
            problemItems.push(`${answer},${question}`);
        }
    });
    
    if (problemItems.length === 0) {
        showToast('少なくとも1つの問題を追加してください', 'error');
        return;
    }
    
    try {
        let endpoint = '/api/edit/mondai';
        let method = 'POST';
        
        // 新規作成の場合（問題名が変更された場合）
        if (!currentProblem || currentProblem.name !== name) {
            endpoint = '/api/make/mondai';
        }
        
        const response = await fetch(endpoint, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                userid: userId,
                password: password,
                mondai: problemItems,
                is_public: isPublic
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showToast('問題を保存しました', 'success');
            closeEditModal();
            loadUserProblems(); // 問題リストを再読み込み
        } else {
            showToast('問題の保存に失敗しました: ' + (result.message || ''), 'error');
        }
        
    } catch (error) {
        console.error('問題の保存に失敗しました:', error);
        showToast('問題の保存に失敗しました', 'error');
    }
}

/**
 * 編集モーダルを閉じる
 */
function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
    currentProblem = null;
}

/**
 * 問題の複製モーダルを表示
 */
function duplicateProblem(problem) {
    currentProblem = problem;
    document.getElementById('duplicate-problem-name').value = `${problem.name} コピー`;
    document.getElementById('duplicate-modal').classList.add('active');
}

/**
 * 問題を複製する
 */
async function duplicateProblemConfirm() {
    const userId = Cookies.get('id');
    const password = Cookies.get('password');
    const newName = document.getElementById('duplicate-problem-name').value.trim();
    
    if (!newName) {
        showToast('新しい問題名を入力してください', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/dashboard/duplicate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                original_name: currentProblem.name,
                new_name: newName,
                userid: userId,
                password: password
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showToast('問題を複製しました', 'success');
            closeDuplicateModal();
            loadUserProblems(); // 問題リストを再読み込み
        } else {
            showToast('問題の複製に失敗しました: ' + (result.message || ''), 'error');
        }
        
    } catch (error) {
        console.error('問題の複製に失敗しました:', error);
        showToast('問題の複製に失敗しました', 'error');
    }
}

/**
 * 複製モーダルを閉じる
 */
function closeDuplicateModal() {
    document.getElementById('duplicate-modal').classList.remove('active');
    currentProblem = null;
}

/**
 * 問題削除の確認モーダルを表示
 */
function confirmDeleteProblem(problem) {
    currentProblem = problem;
    document.getElementById('confirm-message').textContent = `問題「${problem.name}」を削除してもよろしいですか？`;
    document.getElementById('confirm-modal').classList.add('active');
}

/**
 * 問題を削除する
 */
async function deleteProblem() {
    if (!currentProblem) return;
    
    const userId = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        const response = await fetch('/api/dashboard/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: currentProblem.name,
                userid: userId,
                password: password
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showToast('問題を削除しました', 'success');
            closeConfirmModal();
            loadUserProblems(); // 問題リストを再読み込み
        } else {
            showToast('問題の削除に失敗しました: ' + (result.message || ''), 'error');
        }
    } catch (error) {
        console.error('問題の削除に失敗しました:', error);
        showToast('問題の削除に失敗しました', 'error');
    }
}

/**
 * 確認モーダルを閉じる
 */
function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    currentProblem = null;
}

/**
 * 問題の公開状態を切り替える
 */
async function toggleProblemVisibility(problem) {
    const userId = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        const response = await fetch('/api/dashboard/toggle-visibility', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: problem.name,
                userid: userId,
                password: password
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            problem.is_public = result.is_public;
            updateProblemTable();
            updateDashboard();
            showToast(problem.is_public ? '問題を公開しました' : '問題を非公開にしました', 'success');
        } else {
            showToast('公開状態の変更に失敗しました: ' + (result.message || ''), 'error');
        }
    } catch (error) {
        console.error('公開状態の変更に失敗しました:', error);
        showToast('公開状態の変更に失敗しました', 'error');
    }
}

/**
 * 統計データを更新する
 */
function updateStatistics() {
    // データがない場合
    if (userProblems.length === 0) {
        initializeCharts([]);
        return;
    }
    
    // 実際の統計データをAPIから取得
    getStatisticsData().then(statsData => {
        // チャートの更新
        updateCharts(statsData);
        
        // 統計テーブルの更新
        updateStatsTable(statsData);
    });
}

/**
 * 統計データを取得する
 */
async function getStatisticsData() {
    try {
        const userId = Cookies.get('id');
        const password = Cookies.get('password');
        
        // 各問題の統計データを取得
        const statsData = [];
        
        for (const problem of userProblems) {
            // APIから統計データを取得、現在はダミーデータを使用
            const response = await fetch('/api/dashboard/stats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: problem.name,
                    userid: userId,
                    password: password
                })
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                statsData.push({
                    name: problem.name,
                    usageCount: result.stats.usage_count,
                    correctCount: result.stats.correct_count,
                    incorrectCount: result.stats.incorrect_count,
                    accuracyRate: result.stats.usage_count > 0 
                        ? Math.round((result.stats.correct_count / result.stats.usage_count) * 100) 
                        : 0
                });
            }
        }
        
        return statsData;
    } catch (error) {
        console.error('統計データの取得に失敗しました:', error);
        
        // エラー時はダミーデータを返す
        return userProblems.map(problem => {
            const usageCount = Math.floor(Math.random() * 100);
            const correctCount = Math.floor(Math.random() * usageCount);
            return {
                name: problem.name,
                usageCount: usageCount,
                correctCount: correctCount,
                incorrectCount: usageCount - correctCount,
                accuracyRate: usageCount > 0 ? Math.round(correctCount / usageCount * 100) : 0
            };
        });
    }
}

/**
 * 統計チャートを初期化する
 */
function initializeCharts(data) {
    const noDataMessage = {
        id: 'noDataMessage',
        afterDraw(chart) {
            if (chart.data.datasets[0].data.length === 0) {
                const { ctx, width, height } = chart;
                chart.clear();
                
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '16px sans-serif';
                ctx.fillStyle = '#666';
                ctx.fillText('データがありません', width / 2, height / 2);
                ctx.restore();
            }
        }
    };
    
    // メイン画面の正答率チャート
    if (charts.accuracyChart) charts.accuracyChart.destroy();
    charts.accuracyChart = new Chart(
        document.getElementById('accuracy-chart'),
        {
            type: 'bar',
            data: {
                labels: data.map(item => item.name) || [],
                datasets: [{
                    label: '正答率 (%)',
                    data: data.map(item => item.accuracyRate) || [],
                    backgroundColor: data.map(item => 
                        item.accuracyRate > 80 ? '#4caf50' :
                        item.accuracyRate > 60 ? '#8bc34a' :
                        item.accuracyRate > 40 ? '#ffc107' :
                        item.accuracyRate > 20 ? '#ff9800' : '#f44336'
                    ),
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            },
            plugins: [noDataMessage]
        }
    );
    
    // 統計画面の使用回数チャート
    if (charts.usageChart) charts.usageChart.destroy();
    charts.usageChart = new Chart(
        document.getElementById('usage-chart'),
        {
            type: 'bar',
            data: {
                labels: data.map(item => item.name) || [],
                datasets: [{
                    label: '使用回数',
                    data: data.map(item => item.usageCount) || [],
                    backgroundColor: '#4a6bff',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            },
            plugins: [noDataMessage]
        }
    );
    
    // 統計画面の正答率チャート
    if (charts.statsAccuracyChart) charts.statsAccuracyChart.destroy();
    charts.statsAccuracyChart = new Chart(
        document.getElementById('stats-accuracy-chart'),
        {
            type: 'bar',
            data: {
                labels: data.map(item => item.name) || [],
                datasets: [{
                    label: '正答率 (%)',
                    data: data.map(item => item.accuracyRate) || [],
                    backgroundColor: data.map(item => 
                        item.accuracyRate > 80 ? '#4caf50' :
                        item.accuracyRate > 60 ? '#8bc34a' :
                        item.accuracyRate > 40 ? '#ffc107' :
                        item.accuracyRate > 20 ? '#ff9800' : '#f44336'
                    ),
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            },
            plugins: [noDataMessage]
        }
    );
}

/**
 * チャートを更新する
 */
function updateCharts(data) {
    // チャートが初期化されていない場合は初期化
    if (!charts.accuracyChart || !charts.usageChart || !charts.statsAccuracyChart) {
        initializeCharts(data);
        return;
    }
    
    // データ更新
    charts.accuracyChart.data.labels = data.map(item => item.name);
    charts.accuracyChart.data.datasets[0].data = data.map(item => item.accuracyRate);
    charts.accuracyChart.data.datasets[0].backgroundColor = data.map(item => 
        item.accuracyRate > 80 ? '#4caf50' :
        item.accuracyRate > 60 ? '#8bc34a' :
        item.accuracyRate > 40 ? '#ffc107' :
        item.accuracyRate > 20 ? '#ff9800' : '#f44336'
    );
    charts.accuracyChart.update();
    
    charts.usageChart.data.labels = data.map(item => item.name);
    charts.usageChart.data.datasets[0].data = data.map(item => item.usageCount);
    charts.usageChart.update();
    
    charts.statsAccuracyChart.data.labels = data.map(item => item.name);
    charts.statsAccuracyChart.data.datasets[0].data = data.map(item => item.accuracyRate);
    charts.statsAccuracyChart.data.datasets[0].backgroundColor = data.map(item => 
        item.accuracyRate > 80 ? '#4caf50' :
        item.accuracyRate > 60 ? '#8bc34a' :
        item.accuracyRate > 40 ? '#ffc107' :
        item.accuracyRate > 20 ? '#ff9800' : '#f44336'
    );
    charts.statsAccuracyChart.update();
}

/**
 * 統計テーブルを更新する
 */
function updateStatsTable(data) {
    const tableBody = document.getElementById('stats-table-body');
    
    // データがない場合
    if (data.length === 0) {
        tableBody.innerHTML = '<tr class="no-data"><td colspan="5">データがありません</td></tr>';
        return;
    }
    
    // テーブル更新
    tableBody.innerHTML = '';
    data.forEach(item => {
        const row = document.createElement('tr');
        
        // 問題名
        const nameCell = document.createElement('td');
        nameCell.textContent = item.name;
        row.appendChild(nameCell);
        
        // 使用回数
        const usageCell = document.createElement('td');
        usageCell.textContent = item.usageCount;
        row.appendChild(usageCell);
        
        // 正解数
        const correctCell = document.createElement('td');
        correctCell.textContent = item.correctCount;
        row.appendChild(correctCell);
        
        // 不正解数
        const incorrectCell = document.createElement('td');
        incorrectCell.textContent = item.incorrectCount;
        row.appendChild(incorrectCell);
        
        // 正答率
        const accuracyCell = document.createElement('td');
        accuracyCell.textContent = `${item.accuracyRate}%`;
        row.appendChild(accuracyCell);
        
        tableBody.appendChild(row);
    });
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
    // ナビゲーションメニュー
    document.querySelectorAll('.sidebar-nav li').forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.dataset.view;
            switchView(viewId);
        });
    });
    
    // 問題プレビュー閉じるボタン
    document.querySelector('.close-preview').addEventListener('click', closeProblemPreview);
    
    // 編集モーダル
    document.querySelector('.add-problem-item').addEventListener('click', () => {
        addProblemItemToEdit();
    });
    
    document.querySelector('#save-edit').addEventListener('click', saveProblem);
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', e => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
                currentProblem = null;
            }
        });
    });
    
    // 複製モーダル
    document.querySelector('#save-duplicate').addEventListener('click', duplicateProblemConfirm);
    
    // 確認モーダル
    document.querySelector('#confirm-ok').addEventListener('click', deleteProblem);
    
    // 設定保存
    document.querySelector('#save-settings').addEventListener('click', () => {
        // ウィジェット表示設定の保存
        dashboardSettings.widgets.totalProblems = document.getElementById('show-total-problems').checked;
        dashboardSettings.widgets.publicProblems = document.getElementById('show-public-problems').checked;
        dashboardSettings.widgets.recentProblems = document.getElementById('show-recent-problems').checked;
        dashboardSettings.widgets.accuracy = document.getElementById('show-accuracy').checked;
        
        saveDashboardSettings();
        applyDashboardSettings();
    });
    
    // テーマ設定
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;
            dashboardSettings.theme = theme;
            
            document.querySelectorAll('.theme-option').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
            
            applyTheme(theme);
        });
    });
    
    // ソート機能
    document.querySelectorAll('th.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            
            // 同じ列をクリックした場合は方向を切り替え
            if (sortConfig.column === column) {
                sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortConfig.column = column;
                sortConfig.direction = 'asc';
            }
            
            // テーブル更新
            updateProblemTable();
        });
    });
    
    // 検索フィルター
    document.getElementById('problem-filter').addEventListener('click', () => {
        const filterOptions = document.getElementById('filter-options');
        filterOptions.style.display = filterOptions.style.display === 'none' ? 'flex' : 'none';
    });
    
    document.getElementById('apply-filters').addEventListener('click', () => {
        document.getElementById('filter-options').style.display = 'none';
        filterProblems();
    });
    
    document.getElementById('problem-search').addEventListener('input', () => {
        filterProblems();
    });
}

/**
 * 問題リストをフィルタリング
 */
function filterProblems() {
    const searchTerm = document.getElementById('problem-search').value.toLowerCase();
    const showPublic = document.getElementById('filter-public').checked;
    const showPrivate = document.getElementById('filter-private').checked;
    
    // テーブル内の行をフィルタリング
    const tableRows = document.querySelectorAll('#problems-table tbody tr:not(.no-data)');
    let visibleCount = 0;
    
    tableRows.forEach(row => {
        const problemName = row.cells[0].textContent.toLowerCase();
        const isPublic = row.cells[2].querySelector('button').textContent === '🌐';
        
        const nameMatches = problemName.includes(searchTerm);
        const visibilityMatches = 
            (isPublic && showPublic) || (!isPublic && showPrivate);
        
        if (nameMatches && visibilityMatches) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    // 結果がない場合のメッセージ
    const noResultsRow = document.querySelector('#problems-table tbody tr.no-results');
    if (visibleCount === 0) {
        if (!noResultsRow) {
            const tbody = document.querySelector('#problems-table tbody');
            const tr = document.createElement('tr');
            tr.className = 'no-data no-results';
            const td = document.createElement('td');
            td.colSpan = 5;
            td.textContent = '検索条件に一致する問題が見つかりません';
            tr.appendChild(td);
            tbody.appendChild(tr);
        } else {
            noResultsRow.style.display = '';
        }
    } else if (noResultsRow) {
        noResultsRow.style.display = 'none';
    }
}

/**
 * ビューを切り替える
 */
function switchView(viewId) {
    // アクティブなタブを更新
    document.querySelectorAll('.sidebar-nav li').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`.sidebar-nav li[data-view="${viewId}"]`).classList.add('active');
    
    // アクティブなビューを更新
    document.querySelectorAll('.dashboard-view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewId}-view`).classList.add('active');
}

/**
 * トースト通知を表示
 */
function showToast(message, type = '') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // 3秒後に削除
    setTimeout(() => {
        toast.remove();
    }, 3000);
}
