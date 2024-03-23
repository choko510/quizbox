<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://fonts.googleapis.com/earlyaccess/notosansjapanese.css">
    <link rel="stylesheet" href="style.css">
    <title>notlet</title>
    <link rel="manifest" href="manifest.json">
</head>
<body>
    <div class="top">
        <a href="javascript:iconmodal();"><img class="icon" src="usericon.png"></a>

    </div>
    <div class="main">
        <div class="box1">
            <div class="category">
                <p>1級全般</p>
                <a href="play/">プログラミング・ビジネス 1級</a>
                <a href="beta/">プログラミング・ビジネス 1級 ハードモード</a>
                <a href="play/?id=for">プログラミング・ビジネス フォール系 特訓 </a>
            </div>
            <div class="category">
                <p>1級プログラミング</p>
                <a href="play/?id=prog">プログラミング 1級</a>
                <a href="beta/?id=proghard">プログラミング 1級 ハードモード</a>
                <a href="play/?id=re">プログラミング リ系 特訓 </a>
        
            </div>
            <div class="category">
                <p>1級ビジネス</p>
                <a href="play/?id=bizinesu">ビジネス 1級</a>
                <a href="beta/?id=hardbizinesu">ビジネス 1級 ハードモード</a>
                <a href="play/?id=excelmondai">ビジネス エクセル 1級</a>
            </div>
            <div class="category">
                <p>2級全般</p>
                <a href="play/?id=detabase">データベース全般</a>
                <a href="play/?id=excel2">エクセル関数全般</a>
                <a href="play/?id=mail">メールプロトコル</a>
            </div>
        </div>
    </div>
    <link rel="stylesheet" href="modal.css">
    <script src="https://unpkg.com/micromodal/dist/micromodal.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/js-cookie@3.0.5/dist/js.cookie.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <?php
    if(!isset($_COOKIE['id'])){
        $cookie_id = uniqid();
        setcookie('id', $cookie_id, time() + 60 * 60 * 24 * 30);
        $password = uniqid();
        setcookie('password', $password, time() + 60 * 60 * 24 * 30);
        echo "
        <script>
        async function init(id, password) {
            const response = await fetch(`http://localhost:8000/registration`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: id,
                    password: password
                })
            });
        }
        init('{$cookie_id}', '{$password}');
        </script>
        ";
    }
    ?>
    <script>

        async function fetchScores(id, password) {
            const response = await fetch(`http://localhost:8000/get`, {
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
            const response = await fetch(`http://localhost:8000/ranking`);
            //{"userid": userid, "correct": correct, "bad": bad}
            const data = await response.json();
            const ranking = data.map((d, i) => {
                return `${i + 1}位: ${d.userid} 正解数:${d.correct} 不正解数:${d.bad}`;
            });
            document.getElementById("ranking").textContent = ranking;
        }

        function displayScores(correct, bad, total,ritu) {
            document.getElementById("correct").textContent = "正解数:"+correct;
            document.getElementById("bad").textContent = "不正解数:"+bad;
            document.getElementById("total").textContent = "トータル:"+total;
            document.getElementById("ritu").textContent = "正答率:"+ritu;
        }
        
        async function iconmodal() {
            id = Cookies.get('id')
            password = Cookies.get('password')
            const scores = await fetchScores(id, password);
            if (!scores) return;
            const total = scores.correct + scores.bad;
            const ritu = Math.round(scores.correct / total * 100) + "%";
            MicroModal.show('modal-1');
            displayScores(scores.correct, scores.bad,total,ritu);
            drawChart();
            await fetchRanking();
        }

        async function fetchData(id, password) {
            const response = await fetch(`http://localhost:8000/get/${id}/${password}`);
            const data = await response.json();
            return data;
        }

        // グラフを描画する関数
        async function drawChart() {
        const ctx = document.getElementById('myChart').getContext('2d');
        id = Cookies.get('id')
        password = Cookies.get('password')
        const data = await fetchData(id, password);

        // ラベル(日付)とデータ(値)を抽出
        const labels = Object.keys(data.correct);

        const correctData = Object.values(data.correct);
        const badData = Object.values(data.bad);

        // 正答率とトータルを計算する
        const totalData = correctData.map((correct, index) => correct + badData[index]);
        //const accuracyData = correctData.map((correct, index) => correct / totalData[index] * 100);

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
            labels: labels,
            datasets: [
                {
                label: '正解数',
                data: correctData,
                borderColor: 'green',
                fill: false
                },
                {
                label: '不正解数',
                data: badData,
                borderColor: 'red',
                fill: false
                },

                {
                label: 'トータル',
                data: totalData,
                borderColor: 'purple',
                fill: false
                }
            ]
            },
            options: {
            scales: {
                xAxes: [{
                type: 'time',
                time: {
                    unit: 'day'
                }
                }],
                yAxes: [
                {
                    id: 'count', // 左側の縦軸
                    type: 'linear',
                    position: 'left',
                },
                {
                    id: 'percentage', // 右側の縦軸
                    type: 'linear',
                    position: 'right',
                    ticks: {
                    callback: value => `${value}%` // %表示
                    }
                }
                ]
            }
            }
        });
        }
    </script>
    <div class="modal micromodal-slide" id="modal-1" aria-hidden="true">
        <div class="modal__overlay" tabindex="-1" data-micromodal-close>
        <div class="modal__container" role="dialog" aria-modal="true" aria-labelledby="modal-1-title" style="text-align: center;">
            <main class="modal__content" id="modal-1-content">
                <div>
                    <div>
                        <h1>マイスコア</h1>
                        <p id="total">
                            トータル:0
                        </p>
                        <p id="correct">
                            正解数:0
                        </p>
                        <p id="bad">
                            不正解数:0
                        </p>
                        <p id="ritu">
                            正答率:0%
                        </p>
                        <div class="chart">
                            <canvas id="myChart"></canvas>
                        </div>
                        
                    </div>
                    <div>
                        <h1>ランキング</h1>
                        <p id="ranking"></p>
                    </div>
                </div>
            </main>
            <footer class="modal__footer">
                <button class="modal__btn" data-micromodal-close aria-label="Close this dialog window">閉じる</button>
            </footer>
        </div>
        </div>
    </div>
    <script>
        
    </script>
</body>
</html>
