// 検索機能
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const searchResults = document.getElementById('search-results');
    const searchOverlay = document.getElementById('search-overlay');
    const backButton = document.getElementById('back-button');

    // ページ内のすべてのリンクテキストを収集
    let linkTexts = [];
    document.querySelectorAll('a').forEach(link => {
        if (link.textContent && link.textContent.trim()) {
            linkTexts.push({
                text: link.textContent.trim(),
                url: link.href
            });
        }
    });

    if (searchButton && searchInput) {
        searchButton.addEventListener('click', function() {
            performSearch(searchInput.value);
        });

        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performSearch(searchInput.value);
            }
        });
    }

    if (backButton) {
        backButton.addEventListener('click', function() {
            // アニメーションでフェードアウト
            searchOverlay.classList.remove('visible');
            
            // アニメーション終了後に非表示にする
            setTimeout(() => {
                searchOverlay.style.display = 'none';
                // スクロール制御を解除
                document.body.classList.remove('no-scroll');
            }, 300);
        });
    }

    // 検索を実行する関数
    async function performSearch(query) {
        if (!query || query.trim().length < 1) {
            return;
        }

        // スクロール制御を適用
        document.body.classList.add('no-scroll');
        
        // オーバーレイを表示
        searchOverlay.style.display = 'flex';
        
        // 少し遅延させてからアニメーション開始（DOMが反映されるため）
        setTimeout(() => {
            searchOverlay.classList.add('visible');
        }, 10);

        try {
            // 検索中の表示
            searchResults.innerHTML = '<div class="loading-spinner">検索中...</div>';

            // APIリクエスト
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            
            if (!response.ok) {
                throw new Error('検索に失敗しました');
            }

            const data = await response.json();

            // リンクテキストからも検索
            const linkMatches = searchInLinkTexts(query);

            // APIの結果とリンク検索結果を結合
            const combinedResults = [...data];
            
            // 結果に重複がないように追加
            linkMatches.forEach(match => {
                if (!combinedResults.some(item => item.url === match.url)) {
                    combinedResults.push(match);
                }
            });

            // 検索結果の表示
            displaySearchResults(combinedResults);
        } catch (error) {
            console.error('検索エラー:', error);
            searchResults.innerHTML = `<div class="no-results">検索中にエラーが発生しました: ${error.message}</div>`;
        }
    }

    // リンクテキストから検索する関数
    function searchInLinkTexts(query) {
        const normalizedQuery = query.toLowerCase();
        return linkTexts.filter(item =>
            item.text.toLowerCase().includes(normalizedQuery)
        ).map(item => {
            // URLからfindパラメータを抽出
            const url = new URL(item.url);
            const id = url.searchParams.get('id');
            
            return {
                title: item.text,
                type: "リンク検索結果",
                author: "システム",
                url: item.url
            };
        });
    }

    // 検索結果を表示する関数
    function displaySearchResults(results) {
        if (!results || results.length === 0) {
            searchResults.innerHTML = '<div class="no-results">検索結果がありません</div>';
            return;
        }

        let html = '';
        
        results.forEach(item => {
            const type = item.type || '問題セット';
            const author = item.author || 'システム';
            
            html += `
            <div class="result-item" onclick="window.location.href='${item.url}'">
                <div class="result-title">${item.title}</div>
                <div class="result-type">${type}</div>
                <div class="result-author">作成者: ${author}</div>
            </div>`;
        });

        searchResults.innerHTML = html;
    }
});

// グローバルスコープで要素を取得（DOMContentLoaded前でも参照可能にするため）
const adviceContent = document.getElementById('advice-content');
const rankingList = document.getElementById('ranking-list'); // ランキングリスト要素

// アカウント管理機能
async function handleLogin(event) {
    event.preventDefault();
    const id = document.getElementById('login-id').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('api/get', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, password })
        });
        
        const data = await response.json();
        if (data.message === "password is wrong") {
            alert("ログインに失敗しました");
            return;
        }
        
        // クッキーを更新
        Cookies.set('id', id, { expires: 120 });
        Cookies.set('password', password, { expires: 120 });
        alert("ログイン成功");
        MicroModal.close('modal-1');
    } catch (error) {
        console.error('ログインエラー:', error);
        alert("ログイン処理中にエラーが発生しました");
    }
}

async function handlePasswordChange(event) {
    event.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const id = Cookies.get('id');
    const currentPassword = Cookies.get('password');
    
    try {
        const response = await fetch(`api/change/password/${newPassword}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, password: currentPassword })
        });
        
        const data = await response.json();
        if (data.message === "password is wrong") {
            alert("認証に失敗しました。再度ログインしてください");
            return;
        }
        
        Cookies.set('password', newPassword, { expires: 30 });
        alert("パスワードを変更しました");
        document.getElementById('change-password-form').reset();
    } catch (error) {
        console.error('パスワード変更エラー:', error);
        alert("パスワード変更中にエラーが発生しました");
    }
}

async function handleNameChange(event) {
    event.preventDefault();
    const newName = document.getElementById('new-name').value;
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        const response = await fetch(`api/change/name/${newName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, password })
        });
        
        const data = await response.json();
        if (data.message === "password is wrong") {
            alert("認証に失敗しました");
            return;
        }
        
        Cookies.set('id', newName, { expires: 30 });
        alert("ユーザー名を変更しました");
        document.getElementById('change-name-form').reset();
    } catch (error) {
        console.error('ユーザー名変更エラー:', error);
        alert("ユーザー名変更中にエラーが発生しました");
    }
}

// API呼び出し状態を追跡するグローバル変数
let apiDataFetched = false;
let apiResponseData = null;

document.addEventListener('DOMContentLoaded', async function() {
    // MicroModalの初期化
    MicroModal.init({
        onShow: function(modal) {
            console.log("モーダルを表示しました", modal.id);
            
            // ランキングモーダル表示時にランキングデータを自動取得
            if (modal.id === 'modal-1') {
                const activeTab = document.querySelector('.tab.active');
                if (activeTab && activeTab.getAttribute('data-tab') === 'ranking') {
                    fetchAndDisplayRanking();
                }
            }
        },
        onClose: function(modal) {
            console.log("モーダルを閉じました", modal.id);
        },
        awaitOpenAnimation: true,
        awaitCloseAnimation: true
    });
    
    // タブ切り替え機能
    setupTabs();

    // フォームイベントリスナーの設定
    const loginForm = document.getElementById('login-form');
    const passwordForm = document.getElementById('change-password-form');
    const nameForm = document.getElementById('change-name-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordChange);
    }
    if (nameForm) {
        nameForm.addEventListener('submit', handleNameChange);
    }

    // 既存ユーザーの場合、自動ログインを試みる
    const userId = Cookies.get('id');
    const userPassword = Cookies.get('password');
    
    if (userId && userPassword) {
        try {
            // api/getを一度だけ呼び出す
            const scoresData = await fetchScores(userId, userPassword);
            if (scoresData) {
                if (scoresData.message === "password is wrong") {
                    // パスワードが間違っている場合、新しいアカウントを作成
                    const newId = Math.random().toString(36).substring(2);
                    const newPassword = Math.random().toString(36).substring(2);
                    Cookies.set('id', newId, { expires: 120 });
                    Cookies.set('password', newPassword, { expires: 120 });
                    await fetch('api/registration', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            id: newId,
                            password: newPassword
                        })
                    });
                } else {
                    // 正常にデータを取得できた場合
                    analyzedata(scoresData); // プログレスバーを表示
                }
            }
        } catch (error) {
            console.error('自動ログイン/データ取得エラー:', error);
        }
    } else {
        console.log('ログイン情報が見つからないため、進捗バーは表示されません。');
        // 必要であれば、未ログイン状態のプログレスバー表示処理を追加
    }
    
    // アプリケーションの初期化完了
    console.log('アプリケーションの初期化が完了しました');
});

// APIからスコアデータを取得
// APIからスコアデータを取得（キャッシュ対応）
async function fetchScores(id, password) {
    // すでにデータを取得済みの場合は、キャッシュデータを返す
    if (apiDataFetched && apiResponseData) {
        return apiResponseData;
    }
    
    const response = await fetch(`api/get`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            id: id,
            password: password
        })
    });
    
    const data = await response.json();
    
    // レスポンスデータをキャッシュ
    apiDataFetched = true;
    apiResponseData = data;
    
    if (data.message === "password is wrong") {
        // モーダル内で呼び出された場合のみアラート表示
        if (document.getElementById('modal-1').getAttribute('aria-hidden') === 'false') {
            alert("Invalid password");
        }
        return data;
    }
    
    return data;
}
// リンクの href から 'id' クエリパラメータを取得する関数
function getProgressKey(href) {
    try {
        const url = new URL(href, window.location.origin); // 相対URLも扱えるように基底URLを指定
        return url.searchParams.get('id');
    } catch (e) {
        console.error('URLの解析に失敗しました:', href, e);
        return null; // エラー時は null を返す
    }
}

// 進捗データを抽出する関数
function extractProgressData(summary, key) {
    const p = summary[key] || { learned: 0, learning: 0, unlearned: 0, total: 0 };
    // total が 0 または未定義の場合のフォールバックを追加
    const total = p.total > 0 ? p.total : (p.learned + p.learning + (p.unlearned || 0));
    return { learned: p.learned || 0, learning: p.learning || 0, total: total || 0 };
}

function analyzedata(data) {
    console.log('進捗データ:', data); // デバッグ用
    const allProgressData = data.progress_summary || {};
    console.log('処理する全進捗データ:', allProgressData);
    // 全問題リンクに対してプログレスバーを追加
    const categoryDivs = document.querySelectorAll('.category');
    categoryDivs.forEach(category => {
        const links = category.querySelectorAll('a');
        links.forEach(link => {
            // リンクからプログレスキーを取得
            const progressKey = getProgressKey(link.href); // textContent は不要
            if (!progressKey) {
                return; // キーが取得できなければスキップ
            }
            // 進捗データの抽出
            const progressData = extractProgressData(allProgressData, progressKey);
            // プログレスバー作成・追加
            createProgressBar(link, progressData);
        });
    });
}

function displayScores(correct, bad, total, ritu) {
    document.getElementById("correct").textContent = "正解数:" + correct;
    document.getElementById("bad").textContent = "不正解数:" + bad;
    document.getElementById("total").textContent = "トータル:" + total;
    document.getElementById("ritu").textContent = "正答率:" + ritu;
}

async function fetchData(id, password) {
    const response = await fetch(`api/get/user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: id, password: password })
    });
    const data = await response.json();
    return data;
}

// タブ切り替え機能の設定
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 現在アクティブなタブとコンテンツを非アクティブに
            const activeTab = document.querySelector('.tab.active');
            const activeContent = document.querySelector('.tab-content.active');
            
            if (activeTab) activeTab.classList.remove('active');
            if (activeContent) activeContent.classList.remove('active');
            
            // クリックされたタブとそれに対応するコンテンツをアクティブに
            tab.classList.add('active');
            const tabContentId = tab.getAttribute('data-tab');
            const contentElement = document.getElementById(tabContentId); // 要素を取得
            if (contentElement) { // 要素が存在するか確認
                contentElement.classList.add('active');
            } else {
                console.error(`Content element with ID "${tabContentId}" not found.`); // エラーログ
            }

            // タブによって追加のアクションを実行
            switch(tabContentId) {
                case 'ranking': // ランキングタブの場合
                    fetchAndDisplayRanking('total'); // 合計解答数でソートしたランキングを表示
                    break;
                case 'advice':
                    generateAdvice();
                    break;
            }
        });
    });
}

// アイコンモーダル表示時の処理拡張版
async function iconmodal() {
    MicroModal.show('modal-1');
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    
    const scores = await fetchScores(id, password);
    if (!scores) return;

analyzedata(scores); // 進捗データを分析してプログレスバーを表示
    const total = scores.correct + scores.bad;
    const ritu = total > 0 ? Math.round(scores.correct / total * 100) + "%" : "0%";

    // スコアカード表示を更新（覚えた単語数も更新される）
    updateScoreCards(scores.correct, scores.bad, total, ritu);

    // メインチャート描画
    drawMainChart();

    // モーダル表示の初期化完了
    console.log('モーダルの表示が完了しました');
}

// プログレスバーを作成して挿入する関数
function createProgressBar(linkElement, progressData) {
    // 既存のプログレスバーがあれば削除
    const existingProgressBar = linkElement.nextElementSibling;
    if (existingProgressBar && existingProgressBar.classList.contains('progress-container')) {
        existingProgressBar.remove();
    }
    // 総数が0の場合はデフォルト値を使用
    const total = progressData.total || 100;
    // パーセンテージ計算
    const learnedPercent = Math.min(100, Math.max(0, (progressData.learned / total) * 100)) || 0;
    const learningPercent = Math.min(100 - learnedPercent, Math.max(0, (progressData.learning / total) * 100)) || 0;
    const unlearnedPercent = 100 - learnedPercent - learningPercent;
    // プログレスバー要素作成
    const container = document.createElement('div');
    container.className = 'progress-container';
    const learnedBar = document.createElement('div');
    learnedBar.className = 'progress-learned';
    learnedBar.style.width = `${learnedPercent}%`;
    learnedBar.title = `学習済み: ${progressData.learned}問 (${learnedPercent.toFixed(1)}%)`;
    const learningBar = document.createElement('div');
    learningBar.className = 'progress-learning';
    learningBar.style.width = `${learningPercent}%`;
    learningBar.title = `学習中: ${progressData.learning}問 (${learningPercent.toFixed(1)}%)`;
    const unlearnedBar = document.createElement('div');
    unlearnedBar.className = 'progress-unlearned';
    unlearnedBar.style.width = `${unlearnedPercent}%`;
    unlearnedBar.title = `未学習: ${total - progressData.learned - progressData.learning}問 (${unlearnedPercent.toFixed(1)}%)`;
    // 組み立て
    container.appendChild(learnedBar);
    container.appendChild(learningBar);
    container.appendChild(unlearnedBar);
    // リンク要素の後に挿入
    linkElement.insertAdjacentElement('afterend', container);
}

// スコアカード表示を更新
function updateScoreCards(correct, bad, total, ritu) {
    document.getElementById("correct").textContent = correct;
    document.getElementById("bad").textContent = bad;
    document.getElementById("total").textContent = total;
    document.getElementById("ritu").textContent = ritu;
    
    // スコアカードの更新 (覚えた単語数の表示は削除)
}

// メインダッシュボードのグラフ描画
async function drawMainChart() {
    const ctx = document.getElementById('myChart').getContext('2d');
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        const data = await fetchData(id, password);
        console.log('APIから取得したデータ:', data); // デバッグ用ログ追加

        // データ検証
        if (!data || typeof data.correct !== 'object' || typeof data.bad !== 'object') {
            console.error('無効なデータ形式です:', data); // データ内容もログに出力
            displayChartError(ctx, 'データがありません');
            return;
        }

        // 日付データを取得しソート
        const dates = Object.keys(data.correct).sort((a, b) => {
            return new Date(a) - new Date(b);
        });

        if (dates.length === 0) {
            displayChartError(ctx, '表示するデータがありません');
            return;
        }

        // データを日付順に整理
        const labels = dates.map(date => moment(date).format('YYYY/MM/DD'));
        // オブジェクト形式の場合も考慮して数値を取得
        const correctData = dates.map(date => {
            const val = data.correct[date];
            return typeof val === 'object' && val !== null && val.hasOwnProperty('other') ? val.other : (val || 0);
        });
        const badData = dates.map(date => {
            const val = data.bad[date];
            return typeof val === 'object' && val !== null && val.hasOwnProperty('other') ? val.other : (val || 0);
        });

        // トータルを計算 (修正後の数値データで計算)
        const totalData = correctData.map((correct, index) => correct + badData[index]);
        console.log('Chart.jsに渡すデータ:', { labels, correctData, badData, totalData }); // デバッグ用ログ追加

        // 既存のチャートがある場合は破棄
        if (window.mainChart instanceof Chart) {
            window.mainChart.destroy();
        }

        window.mainChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'トータル',
                        data: totalData,
                        borderColor: '#1565c0',
                        backgroundColor: 'rgba(21, 101, 192, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: '正解数',
                        data: correctData,
                        borderColor: '#2e7d32',
                        backgroundColor: 'rgba(46, 125, 50, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: '不正解数',
                        data: badData,
                        borderColor: '#c62828',
                        backgroundColor: 'rgba(198, 40, 40, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            tooltipFormat: 'YYYY/MM/DD',
                            displayFormats: {
                                day: 'MM/DD'
                            }
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '問題数'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('グラフ描画エラー:', error);
        displayChartError(ctx, 'グラフの表示に失敗しました');
    }
}

// グラフエラー表示
function displayChartError(ctx, message) {
    if (window.mainChart instanceof Chart) {
        window.mainChart.destroy();
    }
    
    ctx.font = '16px Arial';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText(message, ctx.canvas.width / 2, ctx.canvas.height / 2);
}

// 学習アドバイスの生成
async function generateAdvice() {
    const container = document.getElementById('advice-content');
    container.innerHTML = '<p class="loading">アドバイスを生成中...</p>';
    
    // APIから最新のデータを取得
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        // Geminiから生成されたアドバイスを取得
        const aiAdviceResponse = await fetch(`api/get/advice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, password })
        });
        
        const aiAdviceData = await aiAdviceResponse.json();
        
        // コンテナをクリア
        container.innerHTML = '';
        
        // AIによるアドバイスを表示（最初に目立つように表示）
        if (aiAdviceData.advice) {
            const aiAdviceItem = document.createElement('div');
            aiAdviceItem.className = 'advice-item ai-advice';
            aiAdviceItem.innerHTML = `
                <div class="ai-advice-content">
                    <p>${aiAdviceData.advice}</p>
                </div>
            `;
            container.appendChild(aiAdviceItem);
            
            // 区切り線
            const divider = document.createElement('hr');
            container.appendChild(divider);
        }
        
    } catch (error) {
        console.error('アドバイスデータの生成に失敗しました:', error);
        container.innerHTML = '<p>アドバイスの生成に失敗しました</p>';
    }
}

// ランキングデータを取得して表示する関数
async function fetchAndDisplayRanking(sortBy = 'total') { // デフォルトのソート基準を 'total' に
    // ランキングリスト要素がなければ処理中断
    if (!rankingList) {
        console.error("Ranking list element not found.");
        return;
    }

    // ローディング表示
    const loadingOverlay = rankingList.querySelector('.loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    } else {
        rankingList.innerHTML = `
            <div class="loading-overlay">
                <div class="spinner"></div>
                <p>ランキングを読み込み中...</p>
            </div>
        `;
    }

    // リフレッシュボタンの状態を更新
    const refreshBtn = document.getElementById('ranking-refresh');
    if (refreshBtn) {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
    }

    try {
        // ソート基準をクエリパラメータに追加
        const url = `/api/ranking?sort_by=${sortBy}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`サーバーエラー: ${response.status}`);
        }

        const rankingData = await response.json();

        if (!rankingData || rankingData.length === 0) {
            rankingList.innerHTML = '<div class="ranking-empty">ランキングデータはありません</div>';
            return;
        }

        // HTML生成
        let html = '';
        rankingData.forEach((user, index) => {
            const position = index + 1;
            const total = user.correct + user.bad;
            const accuracyRate = total > 0 ? Math.round((user.correct / total) * 100) : 0;
            
            // ソート基準に基づいて強調表示する項目を決定
            // アクティブなソートボタンを取得
            const activeButton = document.querySelector('.sort-button.active');
            const currentSortBy = activeButton ? activeButton.getAttribute('data-sort') : 'correct';
            
            // 順位に応じたポジションクラスを設定
            let positionClass = 'position-default';
            if (position === 1) positionClass = 'position-1';
            else if (position === 2) positionClass = 'position-2';
            else if (position === 3) positionClass = 'position-3';
            
            html += `
                <div class="ranking-item">
                    <div class="ranking-position ${positionClass}">${position}</div>
                    <div class="ranking-info">
                        <div class="ranking-user">${user.userid}</div>
                        <div class="ranking-stats">
                            <div class="stat-item total ${currentSortBy === 'total' ? 'highlight' : ''}">
                                <b>合計: ${total}問</b>
                            </div>
                            <div class="stat-item correct ${currentSortBy === 'correct' ? 'highlight' : ''}">
                                <i class="fas fa-check-circle"></i> 正解数: ${user.correct}
                            </div>
                            <div class="stat-item incorrect">
                                <i class="fas fa-times-circle"></i> 不正解: ${user.bad}問
                            </div>
                            <div class="stat-item accuracy ${currentSortBy === 'accuracy' ? 'highlight' : ''}">
                                <i class="fa-solid fa-chart-line"></i>正答率: ${accuracyRate}%
                            </div>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-fill" style="width: ${accuracyRate}%"></div>
                        </div>
                    </div>
                </div>
            `;
        });

        // コンテンツを更新
        rankingList.innerHTML = html;

        // ロード完了後のイベントリスナーを設定
        setupRankingEventListeners();

    } catch (error) {
        console.error('ランキングの取得に失敗しました:', error);
        rankingList.innerHTML = `
            <div class="ranking-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>ランキングの取得に失敗しました: ${error.message}</p>
            </div>
        `;
    } finally {
        // リフレッシュボタンの状態を戻す
        if (refreshBtn) {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
        }
    }
}

// ランキング関連のイベントリスナーを設定
function setupRankingEventListeners() {
    // ソートボタンのイベント設定
    const sortButtons = document.querySelectorAll('.sort-button');
    sortButtons.forEach(button => {
        if (!button.hasEventListener) {
            button.addEventListener('click', function() {
                // 全てのボタンから active クラスを削除
                sortButtons.forEach(btn => btn.classList.remove('active'));
                // クリックされたボタンに active クラスを追加
                this.classList.add('active');
                // データ属性からソート基準を取得
                const sortBy = this.getAttribute('data-sort');
                // ランキングを更新
                fetchAndDisplayRanking(sortBy);
            });
            button.hasEventListener = true;
        }
    });
    
    // リフレッシュボタンのクリックイベント
    const refreshBtn = document.getElementById('ranking-refresh');
    if (refreshBtn && !refreshBtn.hasEventListener) { // イベントリスナーが重複しないようにチェック
        refreshBtn.addEventListener('click', function() {
            // アクティブなボタンからソート基準を取得
            const activeButton = document.querySelector('.sort-button.active');
            const sortBy = activeButton ? activeButton.getAttribute('data-sort') : 'correct';
            fetchAndDisplayRanking(sortBy); // 現在のソート基準でランキングを再取得
        });
        refreshBtn.hasEventListener = true; // リスナーが設定されたことをマーク
    }
}

// グローバルに必要な関数を公開
window.iconmodal = iconmodal;