// スコアダッシュボードの機能を管理するJavaScriptファイル
document.addEventListener('DOMContentLoaded', async function() {
    // MicroModalの初期化
    MicroModal.init({
        onShow: function(modal) {
            console.log("モーダルを表示しました", modal.id);
        },
        onClose: function(modal) {
            console.log("モーダルを閉じました", modal.id);
        },
        awaitOpenAnimation: true,
        awaitCloseAnimation: true
    });
    
    // タブ切り替え機能
    setupTabs();

    // 目標設定の初期化
    initGoals();
    
    // アプリケーションの初期化完了
    console.log('アプリケーションの初期化が完了しました');
});

// ユーザーデータ保存用のキー
const USER_GOALS_KEY = 'user_goals';

// タブ切り替え機能の設定
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 現在アクティブなタブとコンテンツを非アクティブに
            document.querySelector('.tab.active').classList.remove('active');
            document.querySelector('.tab-content.active').classList.remove('active');
            
            // クリックされたタブとそれに対応するコンテンツをアクティブに
            tab.classList.add('active');
            const tabContentId = tab.getAttribute('data-tab');
            document.getElementById(tabContentId).classList.add('active');

            // タブによって追加のアクションを実行
            switch(tabContentId) {
                case 'trends':
                    drawTrendsChart();
                    calculateGrowth();
                    break;
                case 'categories':
                    drawCategoryChart();
                    generateCategoryPerformance();
                    generateWeakAreasHeatmap();
                    break;
                case 'goals':
                    updateGoalProgress();
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

    // 現在の名前を表示
    document.getElementById("nowname").textContent = "現在の名前: " + id;

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
    });
}

// 学習トレンドのグラフ描画
async function drawTrendsChart() {
    const ctx = document.getElementById('trendsChart').getContext('2d');
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

    // 正答率を計算
    const accuracyData = [];
    for (let i = 0; i < correctData.length; i++) {
        const total = correctData[i] + badData[i];
        accuracyData.push(total > 0 ? (correctData[i] / total) * 100 : 0);
    }

    // 移動平均を計算（7日間）
    const movingAverage = calculateMovingAverage(accuracyData, 7);

    // 既存のチャートがある場合は破棄
    if (window.trendsChart instanceof Chart) {
        window.trendsChart.destroy();
    }

    window.trendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '正答率',
                    data: accuracyData,
                    borderColor: '#ef6c00',
                    backgroundColor: 'rgba(239, 108, 0, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: '7日間平均',
                    data: movingAverage,
                    borderColor: '#6a1b9a',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
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
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                        }
                    }
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
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: '正答率 (%)'
                    }
                }
            }
        }
    });
}

// 移動平均を計算
function calculateMovingAverage(data, window) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < window - 1) {
            result.push(null); // 十分なデータがない場合はnull
        } else {
            let sum = 0;
            for (let j = 0; j < window; j++) {
                sum += data[i - j];
            }
            result.push(sum / window);
        }
    }
    return result;
}

// 成長率計算と表示
async function calculateGrowth() {
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    const data = await fetchData(id, password);

    if (!data || !data.correct) {
        document.getElementById('weekly-growth').textContent = 'データなし';
        document.getElementById('monthly-growth').textContent = 'データなし';
        document.getElementById('peak-period').textContent = 'データなし';
        return;
    }

    const dates = Object.keys(data.correct).sort();
    const correctData = dates.map(date => data.correct[date]);
    const badData = dates.map(date => data.bad[date]);

    // 週間成長率
    let weeklyGrowth = '計算中...';
    if (dates.length >= 14) {
        const currentWeek = calculateAverageScore(correctData.slice(-7), badData.slice(-7));
        const previousWeek = calculateAverageScore(correctData.slice(-14, -7), badData.slice(-14, -7));
        
        if (previousWeek > 0) {
            const growth = ((currentWeek - previousWeek) / previousWeek) * 100;
            const sign = growth >= 0 ? '+' : '';
            weeklyGrowth = sign + growth.toFixed(1) + '%';
        } else {
            weeklyGrowth = '比較データなし';
        }
    } else {
        weeklyGrowth = '十分なデータがありません';
    }

    // 月間成長率
    let monthlyGrowth = '計算中...';
    if (dates.length >= 60) { // 約2ヶ月分
        const currentMonth = calculateAverageScore(correctData.slice(-30), badData.slice(-30));
        const previousMonth = calculateAverageScore(correctData.slice(-60, -30), badData.slice(-60, -30));
        
        if (previousMonth > 0) {
            const growth = ((currentMonth - previousMonth) / previousMonth) * 100;
            const sign = growth >= 0 ? '+' : '';
            monthlyGrowth = sign + growth.toFixed(1) + '%';
        } else {
            monthlyGrowth = '比較データなし';
        }
    } else {
        monthlyGrowth = '十分なデータがありません';
    }

    // ピーク時期
    let peakPeriod = '計算中...';
    if (dates.length > 0) {
        let maxScore = 0;
        let maxIndex = 0;
        
        for (let i = 0; i < dates.length; i++) {
            const total = correctData[i] + badData[i];
            const score = total > 0 ? (correctData[i] / total) * 100 : 0;
            
            if (score > maxScore) {
                maxScore = score;
                maxIndex = i;
            }
        }
        
        const peakDate = new Date(dates[maxIndex]);
        peakPeriod = `${peakDate.getMonth() + 1}月${peakDate.getDate()}日 (${maxScore.toFixed(1)}%)`;
    } else {
        peakPeriod = 'データがありません';
    }

    document.getElementById('weekly-growth').textContent = weeklyGrowth;
    document.getElementById('monthly-growth').textContent = monthlyGrowth;
    document.getElementById('peak-period').textContent = peakPeriod;
}

// 平均スコア計算（正答率）
function calculateAverageScore(correctData, badData) {
    let totalCorrect = 0;
    let totalBad = 0;
    
    for (let i = 0; i < correctData.length; i++) {
        totalCorrect += correctData[i];
        totalBad += badData[i];
    }
    
    const total = totalCorrect + totalBad;
    return total > 0 ? (totalCorrect / total) * 100 : 0;
}

// カテゴリー別のグラフを描画
async function drawCategoryChart() {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    // APIから最新のデータを取得
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    let categories = [];
    let correctRates = [];
    
    try {
        const response = await fetch(`api/get/category_stats/${id}/${password}`);
        const data = await response.json();
        
        if (data.message === "password is wrong") {
            console.error("認証エラー: パスワードが間違っています");
            return;
        }
        
        // 空のカテゴリーデータをチェック
        const categoryData = data.categories || {};
        if (Object.keys(categoryData).length === 0) {
            console.log('カテゴリーデータがありません');
            return;
        }
        
        categories = Object.keys(categoryData);
        correctRates = categories.map(category => {
            const { correct, total } = categoryData[category];
            return total > 0 ? (correct / total) * 100 : 0;
        });
    } catch (error) {
        console.error('カテゴリーデータの取得に失敗しました:', error);
        return;
    }
    
    // 既存のチャートがある場合は破棄
    if (window.categoryChart instanceof Chart) {
        window.categoryChart.destroy();
    }
    
    // レーダーチャートの描画
    window.categoryChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: categories,
            datasets: [{
                label: '正答率',
                data: correctRates,
                backgroundColor: 'rgba(74, 108, 247, 0.2)',
                borderColor: '#4a6cf7',
                pointBackgroundColor: '#4a6cf7',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#4a6cf7'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: {
                        display: true
                    },
                    suggestedMin: 0,
                    suggestedMax: 100,
                    ticks: {
                        stepSize: 20
                    }
                }
            }
        }
    });
}

// カテゴリー別成績の表示
async function generateCategoryPerformance() {
    const container = document.getElementById('category-performance');
    container.innerHTML = '';
    
    // APIから最新のデータを取得
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        const response = await fetch(`api/get/category_stats/${id}/${password}`);
        const data = await response.json();
        
        if (data.message === "password is wrong") {
            console.error("認証エラー: パスワードが間違っています");
            container.innerHTML = '<p>認証エラー: パスワードが間違っています</p>';
            return;
        }
        
        // 空のカテゴリーデータをチェック
        const categoryData = data.categories || {};
        if (Object.keys(categoryData).length === 0) {
            container.innerHTML = '<p>カテゴリーデータがありません</p>';
            return;
        }
        
        // 各カテゴリーの成績を表示
        Object.entries(categoryData).forEach(([category, data]) => {
            const { correct, total } = data;
            const rate = total > 0 ? (correct / total) * 100 : 0;
            
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.innerHTML = `
                <div class="category-name">${category}</div>
                <div class="category-score">${rate.toFixed(1)}%</div>
                <div>${correct}/${total}問</div>
            `;
            
            container.appendChild(categoryItem);
        });
    } catch (error) {
        console.error('カテゴリーデータの取得に失敗しました:', error);
        container.innerHTML = '<p>データの取得に失敗しました</p>';
    }
}

// 苦手分野のヒートマップを生成
async function generateWeakAreasHeatmap() {
    const container = document.getElementById('weak-areas-heatmap');
    container.innerHTML = '';
    
    // APIから最新のデータを取得
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        const response = await fetch(`api/get/category_stats/${id}/${password}`);
        const data = await response.json();
        
        if (data.message === "password is wrong") {
            console.error("認証エラー: パスワードが間違っています");
            container.innerHTML = '<p>認証エラー: パスワードが間違っています</p>';
            return;
        }
        
        // 空のカテゴリーデータをチェック
        const categoryData = data.categories || {};
        if (Object.keys(categoryData).length === 0) {
            container.innerHTML = '<p>カテゴリーデータがありません</p>';
            return;
        }
        
        // 各カテゴリーの正答率を計算し、レベルを決定
        Object.entries(categoryData).sort((a, b) => {
            const rateA = a[1].total > 0 ? (a[1].correct / a[1].total) * 100 : 0;
            const rateB = b[1].total > 0 ? (b[1].correct / b[1].total) * 100 : 0;
            return rateA - rateB; // 正答率が低い順にソート
        }).forEach(([category, data]) => {
            const { correct, total } = data;
            const rate = total > 0 ? (correct / total) * 100 : 0;
            
            // 正答率に基づいてレベルを決定（レベル1が最も低い）
            let level;
            if (rate < 20) level = 1;
            else if (rate < 40) level = 2;
            else if (rate < 60) level = 3;
            else if (rate < 80) level = 4;
            else level = 5;
            
            const heatmapItem = document.createElement('div');
            heatmapItem.className = `heatmap-item level-${level}`;
            heatmapItem.innerHTML = `
                <div>${category}</div>
                <div><strong>${rate.toFixed(1)}%</strong></div>
            `;
            
            container.appendChild(heatmapItem);
        });
    } catch (error) {
        console.error('カテゴリーデータの取得に失敗しました:', error);
        container.innerHTML = '<p>データの取得に失敗しました</p>';
    }
}

// 目標設定の初期化
function initGoals() {
    // ローカルストレージから目標を取得、または初期値を設定
    let goals = JSON.parse(localStorage.getItem(USER_GOALS_KEY)) || {
        daily: { target: 10, current: 0 },
        weekly: { target: 50, current: 0 },
        accuracy: { target: 80, current: 0 }
    };
    
    // 入力フィールドに現在の目標値をセット
    document.getElementById('daily-goal').value = goals.daily.target;
    document.getElementById('weekly-goal').value = goals.weekly.target;
    document.getElementById('accuracy-goal').value = goals.accuracy.target;
    
    // 現在の進捗状況を更新
    updateGoalProgress();
}

// 目標設定保存
function saveGoal(type) {
    // ローカルストレージから現在の目標を取得
    let goals = JSON.parse(localStorage.getItem(USER_GOALS_KEY)) || {
        daily: { target: 10, current: 0 },
        weekly: { target: 50, current: 0 },
        accuracy: { target: 80, current: 0 }
    };
    
    // 新しい目標値を取得
    const value = parseInt(document.getElementById(`${type}-goal`).value);
    
    // 数値チェック
    if (isNaN(value) || value <= 0 || (type === 'accuracy' && value > 100)) {
        alert('有効な数値を入力してください');
        return;
    }
    
    // 目標を更新
    goals[type].target = value;
    
    // ローカルストレージに保存
    localStorage.setItem(USER_GOALS_KEY, JSON.stringify(goals));
    
    // 進捗バーを更新
    updateGoalProgress();
    
    // 保存成功メッセージ
    alert(`${type === 'daily' ? '日次' : type === 'weekly' ? '週間' : '正答率'}目標を保存しました`);
}

// 目標達成進捗の更新
async function updateGoalProgress() {
    // ローカルストレージから目標を取得
    let goals = JSON.parse(localStorage.getItem(USER_GOALS_KEY)) || {
        daily: { target: 10, current: 0 },
        weekly: { target: 50, current: 0 },
        accuracy: { target: 80, current: 0 }
    };
    
    // APIからスコアデータを取得
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    const scores = await fetchScores(id, password);
    const allData = await fetchData(id, password);
    
    if (scores && allData) {
        // 今日の解答数を計算
        const today = new Date();
        const todayStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
        const todayCorrect = allData.correct[todayStr] || 0;
        const todayBad = allData.bad[todayStr] || 0;
        const todayTotal = todayCorrect + todayBad;
        
        goals.daily.current = todayTotal;
        
        // 週間の解答数を計算
        let weeklyTotal = 0;
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
            
            weeklyTotal += (allData.correct[dateStr] || 0) + (allData.bad[dateStr] || 0);
        }
        goals.weekly.current = weeklyTotal;
        
        // 正答率
        const total = scores.correct + scores.bad;
        goals.accuracy.current = total > 0 ? (scores.correct / total) * 100 : 0;
    }
    
    // 進捗バーを更新
    updateProgressBar('daily', (goals.daily.current / goals.daily.target) * 100);
    updateProgressBar('weekly', (goals.weekly.current / goals.weekly.target) * 100);
    updateProgressBar('accuracy', (goals.accuracy.current / goals.accuracy.target) * 100);
    
    // ローカルストレージに保存
    localStorage.setItem(USER_GOALS_KEY, JSON.stringify(goals));
}

// 進捗バーの更新
function updateProgressBar(type, percentage) {
    percentage = Math.min(100, percentage); // 100%を超えないように
    document.getElementById(`${type}-progress`).style.width = `${percentage}%`;
}

// 学習アドバイスの生成
async function generateAdvice() {
    const container = document.getElementById('advice-content');
    container.innerHTML = '';
    
    // APIから最新のデータを取得
    const id = Cookies.get('id');
    const password = Cookies.get('password');
    
    try {
        const response = await fetch(`api/get/category_stats/${id}/${password}`);
        const data = await response.json();
        
        if (data.message === "password is wrong") {
            console.error("認証エラー: パスワードが間違っています");
            container.innerHTML = '<p>認証エラー: パスワードが間違っています</p>';
            return;
        }
        
        // 空のカテゴリーデータをチェック
        const categoryData = data.categories || {};
        if (Object.keys(categoryData).length === 0) {
            container.innerHTML = '<p>アドバイスを生成するためのデータがありません</p>';
            return;
        }
        
        // 最も成績の悪いカテゴリーを特定
        let worstCategory = null;
        let worstRate = 100;
        
        Object.entries(categoryData).forEach(([category, data]) => {
            const { correct, total } = data;
            const rate = total > 0 ? (correct / total) * 100 : 0;
            
            if (rate < worstRate && total > 0) {
                worstRate = rate;
                worstCategory = category;
            }
        });
        
        // アドバイスアイテムを追加
        if (worstCategory) {
            const weakAreas = categoryData[worstCategory].weakAreas;
            
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
        
        // 学習習慣のアドバイス
        const adviceItem3 = document.createElement('div');
        adviceItem3.className = 'advice-item';
        adviceItem3.innerHTML = `
            <p><strong>学習習慣のアドバイス:</strong></p>
            <p>毎日一定時間の学習を習慣化することで、長期的な成績向上につながります。</p>
            <p>特に間違えた問題は24時間後、7日後、30日後に復習すると記憶の定着率が高まります。</p>
        `;
        container.appendChild(adviceItem3);
        
        // 目標達成のアドバイス
        const goals = JSON.parse(localStorage.getItem(USER_GOALS_KEY));
        if (goals) {
            const adviceItem4 = document.createElement('div');
            adviceItem4.className = 'advice-item';
            adviceItem4.innerHTML = `
                <p><strong>目標達成のための提案:</strong></p>
                <p>現在の日次目標（${goals.daily.target}問）を達成するには、朝と夕方に分けて学習するのがおすすめです。</p>
                <p>正答率目標（${goals.accuracy.target}%）に近づくには、間違えた問題の復習に特に時間を割くことが効果的です。</p>
            `;
            container.appendChild(adviceItem4);
        }
    } catch (error) {
        console.error('アドバイスデータの生成に失敗しました:', error);
        container.innerHTML = '<p>アドバイスの生成に失敗しました</p>';
    }
}

// 既存の関数をオーバーライド（元のコードを残しつつ拡張）
const originalIconModal = window.iconmodal || function(){};
window.iconmodal = iconmodal;

window.saveGoal = saveGoal;