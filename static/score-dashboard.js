
// スコアダッシュボードの機能を管理するJavaScriptファイル

// グローバルスコープで要素を取得（DOMContentLoaded前でも参照可能にするため）
const adviceContent = document.getElementById('advice-content');
const rankingList = document.getElementById('ranking-list'); // ランキングリスト要素

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

    // アプリケーションの初期化完了
    console.log('アプリケーションの初期化が完了しました');
});

// APIからスコアデータを取得
async function fetchScores(id, password) {
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
    if (data.message === "password is wrong") {
        alert("Invalid password");
        return;
    }
    return data;
}

async function fetchRanking() {
    const response = await fetch(`api/ranking`);
    //{"userid": userid, "correct": correct, "bad": bad}
    const data = await response.json();
    const ranking = data.map((d, i) => {
        return `${i + 1}位: ${d.userid} 正解数:${d.correct} 不正解数:${d.bad}`;
    });
    document.getElementById("ranking").textContent = ranking;
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
                    fetchAndDisplayRanking(); // ランキングデータを取得・表示
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

    const total = scores.correct + scores.bad;
    const ritu = total > 0 ? Math.round(scores.correct / total * 100) + "%" : "0%";

    // スコアカード表示を更新
    updateScoreCards(scores.correct, scores.bad, total, ritu);

    // メインチャート描画
    drawMainChart();

    // モーダル表示の初期化完了
    console.log('モーダルの表示が完了しました');
}

// スコアカード表示を更新
function updateScoreCards(correct, bad, total, ritu) {
    document.getElementById("correct").textContent = correct;
    document.getElementById("bad").textContent = bad;
    document.getElementById("total").textContent = total;
    document.getElementById("ritu").textContent = ritu;
}

// メインダッシュボードのグラフ描画
async function drawMainChart() {
    const ctx = document.getElementById('myChart').getContext('2d');
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    const data = await fetchData(id, password);

    if (!data || !data.correct) {
        console.error('データが取得できませんでした');
        return;
    }

    // ラベル(日付)とデータ(値)を抽出
    const labels = Object.keys(data.correct);
    const correctData = Object.values(data.correct);
    const badData = Object.values(data.bad);

    // 正答率とトータルを計算する
    const totalData = correctData.map((correct, index) => correct + badData[index]);
    const accuracyData = correctData.map((correct, index) => 
        totalData[index] > 0 ? correct / totalData[index] * 100 : 0
    );

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
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
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
    }); // drawMainChart の new Chart 呼び出しを閉じる
} // drawMainChart 関数を閉じる

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
        
        // カテゴリ統計情報を取得
        const categoryResponse = await fetch(`api/get/category_stats/${id}/${password}`);
        const categoryData = await categoryResponse.json();
        
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
        
        // パスワードエラーの確認
        if (categoryData.message === "password is wrong") {
            console.error("認証エラー: パスワードが間違っています");
            if (!aiAdviceData.advice) { // AIアドバイスがなければエラー表示
                container.innerHTML = '<p>認証エラー: パスワードが間違っています</p>';
            }
            return;
        }
        
        // 空のカテゴリーデータをチェック
        const categories = categoryData.categories || {};
        if (Object.keys(categories).length === 0 && !aiAdviceData.advice) {
            container.innerHTML = '<p>アドバイスを生成するためのデータがありません</p>';
            return;
        }
        
        // 最も成績の悪いカテゴリーを特定
        let worstCategory = null;
        let worstRate = 100;
        
        Object.entries(categories).forEach(([category, data]) => {
            const { correct, total } = data;
            const rate = total > 0 ? (correct / total) * 100 : 0;
            
            if (rate < worstRate && total > 5) { // 最低5問以上解いている場合のみ
                worstRate = rate;
                worstCategory = category;
            }
        });
        
        // アドバイスアイテムを追加
        if (worstCategory) {
            const weakAreas = categories[worstCategory].weakAreas;
            
            const adviceItem1 = document.createElement('div');
            adviceItem1.className = 'advice-item';
            adviceItem1.innerHTML = `
                <p><strong>重点学習分野:</strong> ${worstCategory}（正答率: ${worstRate.toFixed(1)}%）</p>
                <p>この分野に重点を置いて学習することで、全体の成績向上が期待できます。</p>
            `;
            container.appendChild(adviceItem1);
            
            if (weakAreas && weakAreas.length > 0) {
                const adviceItem2 = document.createElement('div');
                adviceItem2.className = 'advice-item';
                adviceItem2.innerHTML = `
                    <p><strong>特に注目すべき単元:</strong> ${weakAreas.join(', ')}</p>
                    <p>これらの単元を優先的に復習することをお勧めします。</p>
                `;
                container.appendChild(adviceItem2);
            }
        }
    } catch (error) {
        console.error('アドバイスデータの生成に失敗しました:', error);
        container.innerHTML = '<p>アドバイスの生成に失敗しました</p>';
    }
}

// ランキングデータを取得して表示する関数
async function fetchAndDisplayRanking(period = 'all') {
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
        // 期間パラメータを追加
        const url = period !== 'all' ? `/api/ranking?period=${period}` : '/api/ranking';
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
                            <div class="stat-item total">
                                <b>合計 ${total}問</b>
                            </div>
                            <div class="stat-item correct">
                                <i class="fas fa-check-circle"></i> ${user.correct}問正解
                            </div>
                            <div class="stat-item incorrect">
                                <i class="fas fa-times-circle"></i> ${user.bad}問不正解
                            </div>
                            <div class="stat-item accuracy">
                                <i class="fas fa-bullseye"></i> 正答率 ${accuracyRate}%
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
    // 期間フィルターの変更イベント
    const periodFilter = document.getElementById('ranking-period');
    if (periodFilter && !periodFilter.hasEventListener) {
        periodFilter.addEventListener('change', function() {
            fetchAndDisplayRanking(this.value);
        });
        periodFilter.hasEventListener = true;
    }
    
    // リフレッシュボタンのクリックイベント
    const refreshBtn = document.getElementById('ranking-refresh');
    if (refreshBtn && !refreshBtn.hasEventListener) {
        refreshBtn.addEventListener('click', function() {
            const periodFilter = document.getElementById('ranking-period');
            const period = periodFilter ? periodFilter.value : 'all';
            fetchAndDisplayRanking(period);
        });
        refreshBtn.hasEventListener = true;
    }
}


// グローバルに必要な関数を公開
window.iconmodal = iconmodal;