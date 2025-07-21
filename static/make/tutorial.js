function startTutorial(switchViewCallback) {
    const driver = window.driver.js.driver;

    const driverObj = driver({
        showProgress: true,
        steps: [
            {
                element: '.welcome-container',
                popover: {
                    title: 'ようこそ！',
                    description: '問題作成ページのチュートリアルへようこそ。基本的な使い方をご案内します。',
                    side: "left",
                    align: 'start'
                }
            },
            {
                element: '#option-create-new',
                popover: {
                    title: '問題の作成方法',
                    description: 'まず、「新規作成」を選択して、新しい問題セットの作成を開始します。',
                    side: "bottom",
                    align: 'start'
                },
                onNextClick: () => {
                    document.getElementById("option-create-new").click();
                }
            },
            {
                element: '#addRowBtn',
                popover: {
                    title: '問題の追加',
                    description: 'このボタンをクリックすると、新しい問題行がテーブルに追加されます。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '#problemTableBody',
                popover: {
                    title: '問題と回答の入力',
                    description: '追加された行の「問題」と「回答」セルをクリックして、内容を入力します。',
                    side: "top",
                    align: 'start'
                },
                onNextClick: () => {
                    // チュートリアル用にダミーの行を追加
                    if (document.getElementById('problemTableBody').rows.length === 0) {
                        document.getElementById('addRowBtn').click();
                    }
                    driverObj.moveNext();
                }
            },
            {
                element: '#saveBtn',
                popover: {
                    title: '作業内容の保存',
                    description: '「保存」ボタンを押すと、作成中の問題が下書きとして保存されます。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '#releaseBtn',
                popover: {
                    title: '問題の公開',
                    description: '問題が完成したら、「公開」ボタンで他の人が利用できるようにします。',
                    side: "bottom",
                    align: 'start'
                }
            },
            {
                element: '.sidebar-nav',
                popover: {
                    title: 'ナビゲーション',
                    description: 'ここから他の機能（テンプレート、インポートなど）にアクセスできます。',
                    side: "right",
                    align: 'start'
                }
            },
            {
                popover: {
                    title: 'チュートリアル完了',
                    description: 'これで基本的な操作は完了です。さっそく問題を作成してみましょう！'
                }
            }
        ]
    });

    driverObj.drive();
}