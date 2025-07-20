function startTutorial() {
    const driver = window.driver.js.driver;

    const driverObj = driver({
        showProgress: true,
        nextBtnText: '次へ',
        prevBtnText: '前へ',
        doneBtnText: '終わる',
        steps: [
            {
                element: '#question',
                popover: {
                    title: '問題文',
                    description: 'ここに問題文が表示されます。'
                },
                onHighlightStarted: () => {
                    if (swiper.activeIndex !== 1) {
                        swiper.slideTo(1);
                    }
                }
            },
            {
                element: '#choice-answers',
                popover: {
                    title: '選択肢',
                    description: '4つの選択肢から正解を選んでください。'
                }
            },
            {
                element: '#settings-btn',
                popover: {
                    title: '設定',
                    description: 'ここから問題の出題方法などを設定できます。'
                },
                onHighlightStarted: () => {
                    MicroModal.show('settings-modal');
                }
            },
            {
                element: '#settings-modal-content h3:nth-of-type(1)',
                popover: {
                    title: '出題方法',
                    description: 'ここでは問題文と回答文を入れ替えたり、より難しい問題に挑戦するハードモードを設定できます。'
                },
                 onHighlightStarted: () => {
                    if (!document.querySelector('#settings-modal.is-open')) {
                         MicroModal.show('settings-modal');
                    }
                }
            },
            {
                element: '#settings-modal-content h3:nth-of-type(2)',
                popover: {
                    title: '出題順序',
                    description: '問題をランダムに出題するか、1問目から順番に出題するかを選べます。'
                }
            },
            {
                element: '#settings-modal-content h3:nth-of-type(3)',
                popover: {
                    title: '回答モード',
                    description: '4択、入力、手書きなど、様々な回答方法を選択できます。'
                }
            },
            {
                element: '#settings-modal-content h3:nth-of-type(4)',
                popover: {
                    title: '発音機能',
                    description: '英単語の問題では、正解時に単語の発音を再生するかどうかを設定できます。'
                }
            },
            {
                element: '.swiper-button-prev',
                popover: {
                    title: '進捗確認へ',
                    description: 'このボタンを押すか、左にスワイプすると学習の進捗を確認できます。'
                },
                onHighlightStarted: () => {
                    if (document.querySelector('#settings-modal.is-open')) {
                        MicroModal.close('settings-modal');
                    }
                    if (swiper.activeIndex !== 1) {
                        swiper.slideTo(1);
                    }
                }
            },
            {
                element: '.resultbox1',
                popover: {
                    title: '学習進捗',
                    description: '今までの学習の進捗状況が確認できます。'
                },
                onHighlightStarted: () => {
                    if (swiper.activeIndex !== 0) {
                        swiper.slideTo(0);
                    }
                }
            },
            {
                element: '.resultbox2',
                popover: {
                    title: '統計情報',
                    description: '正解率や連続正解数などの統計情報が確認できます。'
                }
            },
            {
                element: '.swiper-button-next',
                popover: {
                    title: '問題画面へ戻る',
                    description: 'このボタンで問題画面に戻ります。'
                },
                onHighlightStarted: () => {
                    if (swiper.activeIndex !== 0) {
                        swiper.slideTo(0);
                    }
                }
            },
            {
                element: '.swiper-button-next',
                popover: {
                    title: '単語リストへ',
                    description: '問題画面からさらに右にあるこのボタンを押すか、右にスワイプすると単語リストを確認できます。'
                },
                onHighlightStarted: () => {
                    if (swiper.activeIndex !== 1) {
                        swiper.slideTo(1);
                    }
                }
            },
            {
                element: '.tangolist',
                popover: {
                    title: '単語リスト',
                    description: '問題に出てくる単語の一覧です。検索や絞り込みもできます。'
                },
                onHighlightStarted: () => {
                    if (swiper.activeIndex !== 2) {
                        swiper.slideTo(2);
                    }
                }
            },
            {
                popover: {
                    title: 'チュートリアル終了',
                    description: 'これでチュートリアルは終わりです。学習を始めましょう！'
                },
                onHighlightStarted: () => {
                    if (swiper.activeIndex !== 1) {
                        swiper.slideTo(1);
                    }
                }
            }
        ],
        onDestroyed: () => {
            if (document.querySelector('#settings-modal.is-open')) {
                MicroModal.close('settings-modal');
            }
            if (swiper.activeIndex !== 1) {
                swiper.slideTo(1);
            }
        }
    });

    // チュートリアル開始時に必ず問題ページから始める
    if (swiper.activeIndex !== 1) {
        swiper.slideTo(1, 0); // アニメーションなしで移動
    }
    
    // 少し待ってからチュートリアルを開始（スライド移動のため）
    setTimeout(() => {
        driverObj.drive();
    }, 100);
}