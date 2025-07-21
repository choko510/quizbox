/**
 * 表形式問題エディタ
 * インライン編集機能付きの問題作成テーブル
 */

class TableEditor {
    constructor() {
        this.problems = [];
        this.selectedRows = new Set();
        this.editingCell = null;
        this.autoSaveTimer = null;
        this.searchTimeout = null;
        this.sortField = null;
        this.sortDirection = 'asc';
        this.isMobile = window.innerWidth <= 768;
        this.fabMenuOpen = false;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.swipeThreshold = 100;
        // 元に戻す機能のためのヒストリー
        this.undoHistory = [];
        this.maxUndoHistory = 50;
        // スクロール制御用
        this.lastScrollTop = 0;
        this.scrollThreshold = 10;
        this.headerHideTimeout = null;
        
        this.init();
        this.setupMobileFeatures();
        this.setupScrollControl();
    }

    init() {
        this.setupEventListeners();
        this.loadProblemsFromStorage();
        this.render();
        this.startAutoSave();
        this.updateUndoButton();
    }

    setupEventListeners() {
        // ツールバーボタン
        document.getElementById('addRowBtn').addEventListener('click', () => this.addNewRow());
        document.getElementById('bulkDeleteBtn').addEventListener('click', () => this.bulkDelete());
        document.getElementById('duplicateBtn').addEventListener('click', () => this.duplicateSelected());
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('checkAllBtn').addEventListener('click', () => this.qualityCheckAll());
        document.getElementById('exportBtn').addEventListener('click', (e) => this.toggleExportMenu(e));
        document.getElementById('saveBtn').addEventListener('click', () => this.saveProblems());
        document.getElementById('releaseBtn').addEventListener('click', () => this.releaseProblems());

        // 検索機能
        document.getElementById('tableSearch').addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.filterTable(e.target.value);
            }, 300);
        });

        // 全選択チェックボックス
        document.getElementById('selectAll').addEventListener('change', (e) => {
            this.selectAll(e.target.checked);
        });

        // ソート機能
        document.querySelectorAll('.sort-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                this.sortTable(e.target.dataset.sort);
            });
        });

        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        // テーブルのクリックイベント（イベント委譲）
        document.getElementById('problemTableBody').addEventListener('click', (e) => {
            this.handleTableClick(e);
        });

        // ウィンドウクリックでセル編集終了とドロップダウン閉じる
        document.addEventListener('click', (e) => {
            // 編集中のテキストエリア内をクリックした場合は何もしない
            if (this.editingCell && e.target.closest('.inline-editor')) {
                return;
            }
            
            // テーブル外をクリックした場合のみ編集終了
            if (!e.target.closest('.problem-table') && this.editingCell) {
                this.finishEditing();
            }
            
            // ドロップダウンメニューを閉じる
            if (!e.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown-menu').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
    }

    // 新しい行を追加
    addNewRow() {
        // 操作をヒストリーに保存
        this.saveToHistory('addRow');
        
        const newProblem = {
            id: Date.now() + Math.random(),
            question: '',
            answer: '',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            quality: null
        };

        this.problems.push(newProblem);
        this.render();
        this.autoSave();

        // 新しい行の最初のセルにフォーカス
        setTimeout(() => {
            const lastRow = document.querySelector('#problemTableBody tr:last-child');
            if (lastRow) {
                const firstCell = lastRow.querySelector('.cell-content[data-field="question"]');
                if (firstCell) {
                    this.startEditing(firstCell);
                }
            }
        }, 100);
    }

    // 選択された行を削除
    bulkDelete() {
        if (this.selectedRows.size === 0) {
            this.showToast('削除する問題を選択してください', 'warning');
            return;
        }

        if (confirm(`選択された${this.selectedRows.size}件の問題を削除しますか？`)) {
            // 削除前の状態をヒストリーに保存
            const selectedProblems = this.problems.filter(problem =>
                this.selectedRows.has(problem.id)
            );
            this.saveToHistory('bulkDelete', {
                problems: selectedProblems.map(p => ({ ...p })),
                selectedIds: [...this.selectedRows]
            });
            
            const deleteCount = this.selectedRows.size;
            
            // 選択されたIDの問題を削除
            this.problems = this.problems.filter(problem =>
                !this.selectedRows.has(problem.id)
            );
            
            this.selectedRows.clear();
            this.render();
            this.autoSave();
            this.showToast(`${deleteCount}件の問題を削除しました`, 'success');
        }
    }

    // 選択された行を複製
    duplicateSelected() {
        if (this.selectedRows.size === 0) {
            this.showToast('複製する問題を選択してください', 'warning');
            return;
        }

        const selectedProblems = this.problems.filter(problem => 
            this.selectedRows.has(problem.id)
        );

        selectedProblems.forEach(problem => {
            const duplicate = {
                ...problem,
                id: Date.now() + Math.random(),
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };
            this.problems.push(duplicate);
        });

        this.selectedRows.clear();
        this.render();
        this.autoSave();
        this.showToast(`${selectedProblems.length}件の問題を複製しました`, 'success');
    }

    // テーブルをレンダリング
    render() {
        if (this.isMobile) {
            this.renderMobile();
            return;
        }

        const tbody = document.getElementById('problemTableBody');
        const emptyState = document.getElementById('emptyState');
        
        if (this.problems.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            document.querySelector('.table-wrapper').style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            document.querySelector('.table-wrapper').style.display = 'block';
            
            tbody.innerHTML = this.problems.map((problem, index) =>
                this.renderRow(problem, index)
            ).join('');
        }

        this.updateStatusBar();
        this.updateUndoButton();
    }

    // 行をレンダリング
    renderRow(problem, index) {
        const isSelected = this.selectedRows.has(problem.id);
        const qualityClass = this.getQualityClass(problem.quality);
        
        // 文字数計算
        const questionLength = (problem.question || '').length;
        const answerLength = (problem.answer || '').length;
        const totalLength = questionLength + answerLength;
        
        return `
            <tr data-id="${problem.id}" class="${isSelected ? 'selected' : ''}">
                <td class="col-number">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                        <input type="checkbox"
                               ${isSelected ? 'checked' : ''}
                               onchange="tableEditor.toggleRowSelection('${problem.id}', this.checked)">
                        <span class="row-number">${index + 1}</span>
                        <div class="problem-meta" title="問題文: ${questionLength}文字, 回答: ${answerLength}文字">
                            ${totalLength}
                        </div>
                    </div>
                </td>
                <td class="col-question">
                    <div class="cell-wrapper">
                        <div class="cell-content ${!problem.question ? 'empty' : ''}"
                             data-field="question"
                             data-id="${problem.id}"
                             title="クリックして編集">
                            ${this.escapeHtml(problem.question)}
                        </div>
                    </div>
                </td>
                <td class="col-answer">
                    <div class="cell-wrapper">
                        <div class="cell-content ${!problem.answer ? 'empty' : ''}"
                             data-field="answer"
                             data-id="${problem.id}"
                             title="クリックして編集">
                            ${this.escapeHtml(problem.answer)}
                        </div>
                    </div>
                </td>
                <td class="col-actions">
                    <div class="action-buttons">
                        <button class="action-btn duplicate"
                                onclick="tableEditor.duplicateRow('${problem.id}')"
                                data-tooltip="複製">
                            <i class="bi bi-files"></i>
                        </button>
                        <button class="action-btn delete"
                                onclick="tableEditor.deleteRow('${problem.id}')"
                                data-tooltip="削除">
                            <i class="bi bi-trash"></i>
                        </button>
                        <button class="action-btn help"
                                onclick="tableEditor.checkProblemQuality('${problem.id}')"
                                data-tooltip="品質チェック">
                            <i class="bi bi-question-circle"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    // テーブルクリックハンドリング
    handleTableClick(e) {
        const cellContent = e.target.closest('.cell-content');
        
        // 編集中の場合はクリックされたセルと同じかチェック
        if (this.editingCell && cellContent) {
            // 同じセルをクリックした場合は何もしない
            if (this.editingCell === cellContent) {
                return;
            }
            // 異なるセルをクリックした場合は編集を終了してから新しい編集を開始
            this.finishEditing();
        }
        
        if (cellContent && !e.target.closest('.action-buttons')) {
            this.startEditing(cellContent);
        }
    }

    // セル編集開始
    startEditing(cellElement) {
        if (this.editingCell) {
            this.finishEditing();
        }

        this.editingCell = cellElement;
        const field = cellElement.dataset.field;
        const problemId = cellElement.dataset.id;
        const problem = this.problems.find(p => p.id == problemId);
        
        if (!problem) return;

        const currentValue = problem[field] || '';
        
        // テキストエリアを作成
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-editor';
        textarea.value = currentValue;
        textarea.dataset.originalValue = currentValue;
        
        // セルの内容を置き換え
        cellElement.innerHTML = '';
        cellElement.appendChild(textarea);
        cellElement.classList.add('editing');
        cellElement.closest('tr').classList.add('editing');
        
        // フォーカスと選択
        textarea.focus();
        textarea.select();
        
        // イベントリスナー
        textarea.addEventListener('blur', () => this.finishEditing());
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.finishEditing();
                this.moveToNextCell(cellElement, 'down');
            } else if (e.key === 'Escape') {
                this.cancelEditing();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.finishEditing();
                this.moveToNextCell(cellElement, e.shiftKey ? 'left' : 'right');
            }
        });
        
        // 自動リサイズ
        this.autoResizeTextarea(textarea);
        textarea.addEventListener('input', () => this.autoResizeTextarea(textarea));
    }

    // セル編集終了
    finishEditing() {
        if (!this.editingCell) return;

        const textarea = this.editingCell.querySelector('.inline-editor');
        if (!textarea) return;

        const field = this.editingCell.dataset.field;
        const problemId = this.editingCell.dataset.id;
        const newValue = textarea.value.trim();
        const originalValue = textarea.dataset.originalValue;

        // 値が変更された場合のみ更新
        if (newValue !== originalValue) {
            this.updateProblemField(problemId, field, newValue);
        }

        // 編集状態をクリア
        this.editingCell.classList.remove('editing');
        this.editingCell.closest('tr').classList.remove('editing');
        this.editingCell = null;

        // テーブルを再レンダリング
        this.render();
        this.autoSave();
    }

    // セル編集キャンセル
    cancelEditing() {
        if (!this.editingCell) return;

        this.editingCell.classList.remove('editing');
        this.editingCell.closest('tr').classList.remove('editing');
        this.editingCell = null;

        this.render();
    }

    // 次のセルに移動
    moveToNextCell(currentCell, direction) {
        const currentRow = currentCell.closest('tr');
        const allRows = Array.from(document.querySelectorAll('#problemTableBody tr'));
        const currentRowIndex = allRows.indexOf(currentRow);
        
        let nextCell = null;

        switch (direction) {
            case 'right':
                nextCell = currentRow.querySelector(`[data-field="${currentCell.dataset.field === 'question' ? 'answer' : 'question'}"]`);
                break;
            case 'left':
                nextCell = currentRow.querySelector(`[data-field="${currentCell.dataset.field === 'answer' ? 'question' : 'answer'}"]`);
                break;
            case 'down':
                if (currentRowIndex < allRows.length - 1) {
                    nextCell = allRows[currentRowIndex + 1].querySelector(`[data-field="${currentCell.dataset.field}"]`);
                } else {
                    // 最後の行の場合、新しい行を追加
                    this.addNewRow();
                    return;
                }
                break;
            case 'up':
                if (currentRowIndex > 0) {
                    nextCell = allRows[currentRowIndex - 1].querySelector(`[data-field="${currentCell.dataset.field}"]`);
                }
                break;
        }

        if (nextCell) {
            setTimeout(() => this.startEditing(nextCell), 100);
        }
    }

    // 問題フィールドを更新
    updateProblemField(problemId, field, value) {
        const problem = this.problems.find(p => p.id == problemId);
        if (problem) {
            // 変更前の状態をヒストリーに保存
            this.saveToHistory('updateField', {
                problemId: problemId,
                field: field,
                oldValue: problem[field],
                newValue: value
            });
            
            problem[field] = value;
            problem.updated = new Date().toISOString();
            
            // 品質スコアをリセット（再チェックが必要）
            if (problem.quality !== null) {
                problem.quality = null;
            }
        }
    }

    // テキストエリアの自動リサイズ
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(60, textarea.scrollHeight) + 'px';
    }

    // 行選択切り替え
    toggleRowSelection(problemId, selected) {
        if (selected) {
            this.selectedRows.add(problemId);
        } else {
            this.selectedRows.delete(problemId);
        }
        this.updateStatusBar();
        this.updateSelectAllCheckbox();
    }

    // 全選択/全解除
    selectAll(selectAll) {
        if (selectAll) {
            this.problems.forEach(problem => this.selectedRows.add(problem.id));
        } else {
            this.selectedRows.clear();
        }
        this.render();
    }

    // 全選択チェックボックスの状態更新
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAll');
        const totalRows = this.problems.length;
        const selectedRows = this.selectedRows.size;
        
        if (selectedRows === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedRows === totalRows) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    // ステータスバー更新
    updateStatusBar() {
        document.getElementById('problemCount').textContent = this.problems.length;
        document.getElementById('selectedCount').textContent = this.selectedRows.size;
        
        // 品質スコア計算
        const qualityScores = this.problems
            .filter(p => p.quality !== null)
            .map(p => p.quality);
            
        if (qualityScores.length > 0) {
            const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
            document.getElementById('qualityScore').textContent = Math.round(avgQuality) + '%';
        } else {
            document.getElementById('qualityScore').textContent = '-';
        }
    }

    // 単一行削除
    deleteRow(problemId) {
        if (confirm('この問題を削除しますか？')) {
            // 削除前の状態をヒストリーに保存
            const problemToDelete = this.problems.find(p => p.id == problemId);
            if (problemToDelete) {
                this.saveToHistory('deleteRow', {
                    problem: { ...problemToDelete },
                    index: this.problems.findIndex(p => p.id == problemId)
                });
            }
            
            this.problems = this.problems.filter(p => p.id != problemId);
            this.selectedRows.delete(problemId);
            this.render();
            this.autoSave();
            this.showToast('問題を削除しました', 'success');
        }
    }

    // 単一行複製
    duplicateRow(problemId) {
        const problem = this.problems.find(p => p.id == problemId);
        if (problem) {
            const duplicate = {
                ...problem,
                id: Date.now() + Math.random(),
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };
            
            // 元の問題の直後に挿入
            const index = this.problems.findIndex(p => p.id == problemId);
            this.problems.splice(index + 1, 0, duplicate);
            
            this.render();
            this.autoSave();
            this.showToast('問題を複製しました', 'success');
        }
    }

    // テーブルフィルタリング
    filterTable(searchTerm) {
        const rows = document.querySelectorAll('#problemTableBody tr');
        const term = searchTerm.toLowerCase();
        
        rows.forEach(row => {
            const question = row.querySelector('[data-field="question"]').textContent.toLowerCase();
            const answer = row.querySelector('[data-field="answer"]').textContent.toLowerCase();
            
            if (question.includes(term) || answer.includes(term)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    // テーブルソート
    sortTable(field) {
        // ソート状態の管理
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }

        this.problems.sort((a, b) => {
            const aValue = (a[field] || '').toLowerCase();
            const bValue = (b[field] || '').toLowerCase();
            
            if (this.sortDirection === 'asc') {
                return aValue.localeCompare(bValue);
            } else {
                return bValue.localeCompare(aValue);
            }
        });
        
        this.updateSortIcons();
        this.render();
        this.autoSave();
    }

    // ソートアイコンの状態を更新
    updateSortIcons() {
        // すべてのソートアイコンをリセット
        document.querySelectorAll('.sort-icon').forEach(icon => {
            icon.classList.remove('active', 'asc', 'desc');
        });

        // アクティブなソートアイコンを設定
        if (this.sortField) {
            const activeIcon = document.querySelector(`.sort-icon[data-sort="${this.sortField}"]`);
            if (activeIcon) {
                activeIcon.classList.add('active', this.sortDirection);
            }
        }
    }

    // キーボードショートカット
    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 's':
                    e.preventDefault();
                    this.saveProblems();
                    break;
                case 'a':
                    if (!this.editingCell) {
                        e.preventDefault();
                        this.selectAll(true);
                    }
                    break;
                case 'n':
                    e.preventDefault();
                    this.addNewRow();
                    break;
                case 'z':
                    if (!this.editingCell) {
                        e.preventDefault();
                        this.undo();
                    }
                    break;
            }
        } else if (e.key === 'Delete' && this.selectedRows.size > 0 && !this.editingCell) {
            this.bulkDelete();
        }
    }

    // 品質チェック
    async qualityCheckAll() {
        const problemsToCheck = this.problems.filter(p => 
            p.question.trim() && p.answer.trim()
        );
        
        if (problemsToCheck.length === 0) {
            this.showToast('チェックする問題がありません', 'warning');
            return;
        }

        this.showToast(`${problemsToCheck.length}件の問題をチェック中...`, 'info');
        
        // 各問題を順次チェック
        for (const problem of problemsToCheck) {
            try {
                const response = await fetch('/api/process/text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: [`問題：${problem.question}\n回答：${problem.answer}`],
                        checkType: 'quality'
                    })
                });
                
                const data = await response.json();
                if (data.status === 'success' && data.results && data.results.length > 0) {
                    // 品質スコアを設定（仮実装）
                    problem.quality = this.calculateQualityScore(data.results[0].feedback);
                }
            } catch (error) {
                console.error('品質チェックエラー:', error);
                problem.quality = 0;
            }
        }
        
        this.render();
        this.autoSave();
        this.showToast('品質チェックが完了しました', 'success');
    }

    // 品質スコア計算（仮実装）
    calculateQualityScore(feedback) {
        if (!feedback) return 0;
        
        // フィードバック内容に基づいてスコアを計算
        if (feedback.includes('問題ありません') || feedback.includes('良好')) {
            return 85 + Math.floor(Math.random() * 15); // 85-100
        } else if (feedback.includes('改善')) {
            return 50 + Math.floor(Math.random() * 35); // 50-85
        } else {
            return Math.floor(Math.random() * 50); // 0-50
        }
    }

    // 品質スコアの表示クラス取得
    getQualityClass(quality) {
        if (quality === null) return 'unknown';
        if (quality >= 80) return 'excellent';
        if (quality >= 60) return 'good';
        if (quality >= 40) return 'fair';
        return 'poor';
    }

    // 品質スコアの表示文字取得
    getQualityScore(quality) {
        if (quality === null) return '?';
        return Math.round(quality);
    }

    // ローカルストレージから読み込み
    loadProblemsFromStorage() {
        try {
            const saved = localStorage.getItem('editor-problems');
            if (saved) {
                const parsed = JSON.parse(saved);
                // 既存の形式から新しい形式に変換
                this.problems = parsed.map(p => ({
                    id: p.id || Date.now() + Math.random(),
                    question: p.question || '',
                    answer: p.answer || '',
                    created: p.created || new Date().toISOString(),
                    updated: p.updated || new Date().toISOString(),
                    quality: p.quality || null
                }));
            }
        } catch (error) {
            console.error('データ読み込みエラー:', error);
            this.problems = [];
        }
    }

    // ローカルストレージに保存
    saveToStorage() {
        try {
            localStorage.setItem('editor-problems', JSON.stringify(this.problems));
            document.getElementById('autoSaveStatus').textContent = 
                new Date().toLocaleTimeString() + ' に保存';
        } catch (error) {
            console.error('データ保存エラー:', error);
            this.showToast('保存に失敗しました', 'error');
        }
    }

    // 自動保存開始
    startAutoSave() {
        this.autoSaveTimer = setInterval(() => {
            this.saveToStorage();
        }, 30000); // 30秒間隔
    }

    // 自動保存実行
    autoSave() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveToStorage();
        }, 1000);
    }

    // ドロップダウンメニューの切り替え
    toggleExportMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('exportMenu');
        menu.classList.toggle('show');
        
        // 他の場所をクリックしたときにメニューを閉じる
        document.addEventListener('click', () => {
            menu.classList.remove('show');
        }, { once: true });
    }

    // 問題エクスポート（複数形式対応）
    exportProblems(format = 'json') {
        if (this.problems.length === 0) {
            this.showToast('エクスポートする問題がありません', 'warning');
            return;
        }

        const validProblems = this.problems.filter(p =>
            p.question.trim() && p.answer.trim()
        );

        if (validProblems.length === 0) {
            this.showToast('有効な問題がありません', 'warning');
            return;
        }

        const timestamp = new Date().toISOString().slice(0, 10);
        
        switch (format) {
            case 'json':
                this.exportAsJSON(validProblems, timestamp);
                break;
            case 'csv':
                this.exportAsCSV(validProblems, timestamp);
                break;
            case 'excel':
                this.exportAsExcel(validProblems, timestamp);
                break;
            case 'txt':
                this.exportAsText(validProblems, timestamp);
                break;
            default:
                this.exportAsJSON(validProblems, timestamp);
        }

        this.showToast(`問題を${format.toUpperCase()}形式でエクスポートしました`, 'success');
    }

    // JSON形式でエクスポート
    exportAsJSON(problems, timestamp) {
        const exportData = problems.map(p => ({
            question: p.question,
            answer: p.answer,
            created: p.created,
            updated: p.updated,
            quality: p.quality
        }));

        const dataStr = JSON.stringify(exportData, null, 2);
        this.downloadFile(dataStr, `mondai_${timestamp}.json`, 'application/json');
    }

    // CSV形式でエクスポート
    exportAsCSV(problems, timestamp) {
        const headers = ['問題', '回答', '作成日', '更新日', '品質スコア'];
        const rows = problems.map(p => [
            `"${p.question.replace(/"/g, '""')}"`,
            `"${p.answer.replace(/"/g, '""')}"`,
            p.created ? new Date(p.created).toLocaleDateString() : '',
            p.updated ? new Date(p.updated).toLocaleDateString() : '',
            p.quality || ''
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
        this.downloadFile(bom + csvContent, `mondai_${timestamp}.csv`, 'text/csv');
    }

    // Excel形式でエクスポート（簡易HTML table形式）
    exportAsExcel(problems, timestamp) {
        const headers = ['問題', '回答', '作成日', '更新日', '品質スコア'];
        const rows = problems.map(p => [
            p.question,
            p.answer,
            p.created ? new Date(p.created).toLocaleDateString() : '',
            p.updated ? new Date(p.updated).toLocaleDateString() : '',
            p.quality || ''
        ]);

        const htmlContent = `
            <table border="1">
                <thead>
                    <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
                </tbody>
            </table>
        `;

        this.downloadFile(htmlContent, `mondai_${timestamp}.xls`, 'application/vnd.ms-excel');
    }

    // テキスト形式でエクスポート
    exportAsText(problems, timestamp) {
        const textContent = problems.map((p, index) =>
            `問題${index + 1}: ${p.question}\n回答${index + 1}: ${p.answer}\n`
        ).join('\n');

        this.downloadFile(textContent, `mondai_${timestamp}.txt`, 'text/plain');
    }

    // ファイルダウンロード共通関数
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 問題保存（サーバー）
    async saveProblems() {
        const validProblems = this.problems.filter(p => 
            p.question.trim() && p.answer.trim()
        );

        if (validProblems.length === 0) {
            this.showToast('保存する問題がありません', 'error');
            return;
        }

        const name = prompt('問題セットの名前を入力してください:');
        if (!name) return;

        const userId = Cookies.get('id');
        const password = Cookies.get('password');

        if (!userId || !password) {
            this.showToast('ログインが必要です', 'error');
            return;
        }

        try {
            const mondaiData = validProblems.map(p => `${p.answer},${p.question}`);
            
            const response = await fetch('/api/make/mondai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                this.showToast('問題が保存されました', 'success');
                
                // 保存成功後はクリア
                this.problems = [];
                this.selectedRows.clear();
                this.render();
                this.saveToStorage();
            } else {
                this.showToast('保存に失敗しました: ' + (result.message || ''), 'error');
            }
        } catch (error) {
            console.error('保存エラー:', error);
            this.showToast('サーバーとの通信に失敗しました', 'error');
        }
    }

    // 問題公開（サーバー）
    async releaseProblems() {
        const validProblems = this.problems.filter(p => 
            p.question.trim() && p.answer.trim()
        );

        if (validProblems.length === 0) {
            this.showToast('公開する問題がありません', 'error');
            return;
        }

        const name = prompt('公開する問題セットの名前を入力してください:');
        if (!name) return;

        const userId = Cookies.get('id');
        const password = Cookies.get('password');

        if (!userId || !password) {
            this.showToast('ログインが必要です', 'error');
            return;
        }

        try {
            const mondaiData = validProblems.map(p => `${p.answer},${p.question}`);
            
            const response = await fetch('/api/make/mondai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                this.showToast('問題が公開されました', 'success');
                
                // 公開成功後はクリア
                this.problems = [];
                this.selectedRows.clear();
                this.render();
                this.saveToStorage();
            } else {
                this.showToast('公開に失敗しました: ' + (result.message || ''), 'error');
            }
        } catch (error) {
            console.error('公開エラー:', error);
            this.showToast('サーバーとの通信に失敗しました', 'error');
        }
    }

    // HTMLエスケープ
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // トースト通知
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        const container = document.getElementById('toast-container');
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // 問題の品質チェック
    async checkProblemQuality(problemId) {
        const problem = this.problems.find(p => p.id === problemId);
        if (!problem || !problem.question || !problem.answer) {
            this.showToast('問題文と回答の両方が必要です', 'warning');
            return;
        }

        try {
            // 簡易的な品質評価
            const score = this.calculateSimpleQuality(problem);
            problem.quality = score;
            this.render();
            
            let message = `品質チェック結果: ${score}点`;
            if (score >= 80) {
                message += '\n良好な問題です！';
            } else if (score >= 60) {
                message += '\n改善の余地があります。';
            } else {
                message += '\n問題文や回答を見直してください。';
            }
            
            this.showToast(message, score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error');
        } catch (error) {
            console.error('品質チェックエラー:', error);
            this.showToast('品質チェックに失敗しました', 'error');
        }
    }

    // 簡易品質評価
    calculateSimpleQuality(problem) {
        let score = 50; // ベーススコア

        // 問題文の長さチェック
        if (problem.question.length > 10 && problem.question.length < 100) {
            score += 20;
        }

        // 回答の長さチェック
        if (problem.answer.length > 1 && problem.answer.length < 50) {
            score += 20;
        }

        // 疑問符があるかチェック
        if (problem.question.includes('？') || problem.question.includes('?')) {
            score += 10;
        }

        return Math.min(100, score);
    }

    // ヒストリーに操作を保存
    saveToHistory(action, data = null) {
        const historyItem = {
            action: action,
            data: data,
            problems: JSON.parse(JSON.stringify(this.problems)), // ディープコピー
            selectedRows: new Set(this.selectedRows),
            timestamp: Date.now()
        };
        
        this.undoHistory.push(historyItem);
        
        // ヒストリーサイズ制限
        if (this.undoHistory.length > this.maxUndoHistory) {
            this.undoHistory.shift();
        }
        
        // 元に戻すボタンの状態を更新
        this.updateUndoButton();
    }

    // 元に戻す機能
    undo() {
        if (this.undoHistory.length === 0) {
            this.showToast('元に戻す操作がありません', 'warning');
            return;
        }

        const lastAction = this.undoHistory.pop();
        
        // 状態を復元
        this.problems = lastAction.problems;
        this.selectedRows = lastAction.selectedRows;
        
        this.render();
        this.autoSave();
        this.updateUndoButton();
        
        const actionText = this.getActionText(lastAction.action);
        this.showToast(`「${actionText}」を元に戻しました`, 'success');
    }

    // 元に戻すボタンの状態を更新
    updateUndoButton() {
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) {
            if (this.undoHistory.length === 0) {
                undoBtn.disabled = true;
                undoBtn.title = '元に戻す操作がありません';
            } else {
                undoBtn.disabled = false;
                const lastAction = this.undoHistory[this.undoHistory.length - 1];
                const actionText = this.getActionText(lastAction.action);
                undoBtn.title = `「${actionText}」を元に戻す (Ctrl+Z)`;
            }
        }
    }

    // アクション名を取得
    getActionText(action) {
        const actionMap = {
            'addRow': '問題追加',
            'deleteRow': '問題削除',
            'bulkDelete': '一括削除',
            'updateField': 'フィールド更新'
        };
        return actionMap[action] || action;
    }

    // スクロール制御のセットアップ
    setupScrollControl() {
        // タブレット横向きでのみ有効
        if (window.innerWidth <= 1024) {
            this.enableHeaderScrollControl();
        }
        
        // ウィンドウリサイズ時の制御
        window.addEventListener('resize', () => {
            if (window.innerWidth <= 1024) {
                this.enableHeaderScrollControl();
            } else {
                this.disableHeaderScrollControl();
            }
        });
    }

    // ヘッダーのスクロール制御を有効化
    enableHeaderScrollControl() {
        // 既存のハンドラを削除して重複を防ぐ
        this.disableHeaderScrollControl();

        const scrollHandler = () => {
            const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const header = document.getElementById('mainHeader');
            
            if (!header) return;
            
            // スクロール方向を判定
            if (Math.abs(currentScrollTop - this.lastScrollTop) < this.scrollThreshold) {
                return;
            }
            
            // 下スクロールでヘッダーを隠す
            if (currentScrollTop > this.lastScrollTop && currentScrollTop > 100) {
                header.classList.add('hidden');
                
                // 一定時間後に表示する
                clearTimeout(this.headerHideTimeout);
                this.headerHideTimeout = setTimeout(() => {
                    header.classList.remove('hidden');
                }, 3000);
            }
            // 上スクロールでヘッダーを表示
            else if (currentScrollTop < this.lastScrollTop) {
                header.classList.remove('hidden');
                clearTimeout(this.headerHideTimeout);
            }
            
            this.lastScrollTop = currentScrollTop;
        };
        
        // スクロールイベントをスロットル化
        let ticking = false;
        const throttledScrollHandler = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    scrollHandler();
                    ticking = false;
                });
                ticking = true;
            }
        };
        
        window.addEventListener('scroll', throttledScrollHandler, { passive: true });
        this.scrollHandler = throttledScrollHandler;
    }

    // ヘッダーのスクロール制御を無効化
    disableHeaderScrollControl() {
        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = null;
        }
        
        const header = document.getElementById('mainHeader');
        if (header) {
            header.classList.remove('hidden');
        }
        
        clearTimeout(this.headerHideTimeout);
    }

    // モバイル専用機能のセットアップ
    setupMobileFeatures() {
        if (!this.isMobile) return;

        // 画面サイズ変更の監視
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
            this.render();
        });

        // フローティングアクションボタンのセットアップ
        this.createFloatingActionButton();
        
        // タッチイベントのセットアップ
        this.setupTouchEvents();
    }

    // フローティングアクションボタンの作成
    createFloatingActionButton() {
        if (!this.isMobile) return;

        const fab = document.createElement('button');
        fab.className = 'mobile-fab';
        fab.innerHTML = '<i class="bi bi-plus"></i>';
        fab.addEventListener('click', () => this.toggleFabMenu());

        const fabMenu = document.createElement('div');
        fabMenu.className = 'fab-menu';
        fabMenu.innerHTML = `
            <div class="fab-item">
                <div class="fab-item-label">新しい問題を追加</div>
                <button class="fab-item-button" onclick="tableEditor.addNewRow()">
                    <i class="bi bi-plus-circle"></i>
                </button>
            </div>
            <div class="fab-item">
                <div class="fab-item-label">選択した問題を削除</div>
                <button class="fab-item-button" onclick="tableEditor.bulkDelete()">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <div class="fab-item">
                <div class="fab-item-label">選択した問題を複製</div>
                <button class="fab-item-button" onclick="tableEditor.duplicateSelected()">
                    <i class="bi bi-files"></i>
                </button>
            </div>
            <div class="fab-item">
                <div class="fab-item-label">保存</div>
                <button class="fab-item-button" onclick="tableEditor.saveProblems()">
                    <i class="bi bi-save"></i>
                </button>
            </div>
        `;

        document.body.appendChild(fab);
        document.body.appendChild(fabMenu);

        // FABメニュー外をクリックしたら閉じる
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.mobile-fab') && !e.target.closest('.fab-menu')) {
                this.closeFabMenu();
            }
        });
    }

    // FABメニューの切り替え
    toggleFabMenu() {
        const fab = document.querySelector('.mobile-fab');
        const fabMenu = document.querySelector('.fab-menu');
        
        if (this.fabMenuOpen) {
            this.closeFabMenu();
        } else {
            this.openFabMenu();
        }
    }

    openFabMenu() {
        const fab = document.querySelector('.mobile-fab');
        const fabMenu = document.querySelector('.fab-menu');
        
        fab.classList.add('rotate');
        fabMenu.classList.add('show');
        this.fabMenuOpen = true;
    }

    closeFabMenu() {
        const fab = document.querySelector('.mobile-fab');
        const fabMenu = document.querySelector('.fab-menu');
        
        if (fab) fab.classList.remove('rotate');
        if (fabMenu) fabMenu.classList.remove('show');
        this.fabMenuOpen = false;
    }

    // タッチイベントのセットアップ
    setupTouchEvents() {
        if (!this.isMobile) return;

        document.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: true });
        document.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
    }

    // タッチ開始
    handleTouchStart(e) {
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
    }

    // タッチ移動
    handleTouchMove(e) {
        if (!this.touchStartX || !this.touchStartY) return;

        const touch = e.touches[0];
        const diffX = this.touchStartX - touch.clientX;
        const diffY = this.touchStartY - touch.clientY;

        // スワイプの検出
        const card = e.target.closest('.problem-card');
        if (card && Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
            if (diffX > 0) {
                // 左スワイプ - 削除アクションを表示
                card.classList.add('swipe-revealed');
            } else {
                // 右スワイプ - アクションを隠す
                card.classList.remove('swipe-revealed');
            }
        }
    }

    // タッチ終了
    handleTouchEnd(e) {
        this.touchStartX = 0;
        this.touchStartY = 0;
    }

    // モバイル用のレンダリング
    renderMobile() {
        const container = document.querySelector('.table-editor-container');
        
        // モバイル用ツールバーの作成
        const mobileToolbar = this.createMobileToolbar();
        
        // カード表示用のコンテナ作成
        const mobileView = document.createElement('div');
        mobileView.className = 'mobile-card-view';
        mobileView.id = 'mobileCardView';
        
        if (this.problems.length === 0) {
            mobileView.innerHTML = `
                <div class="empty-table">
                    <i class="bi bi-journal-text"></i>
                    <h3>問題がまだありません</h3>
                    <p>右下の「+」ボタンをタップして最初の問題を作成しましょう</p>
                </div>
            `;
        } else {
            mobileView.innerHTML = this.problems.map((problem, index) =>
                this.renderMobileCard(problem, index)
            ).join('');
        }

        // 既存のコンテンツを置き換え
        const existingMobile = document.getElementById('mobileCardView');
        if (existingMobile) {
            existingMobile.replaceWith(mobileView);
        } else {
            container.appendChild(mobileView);
        }

        this.updateStatusBar();
    }

    // モバイル用ツールバーの作成
    createMobileToolbar() {
        return `
            <div class="mobile-toolbar">
                <div class="mobile-toolbar-top">
                    <div class="mobile-toolbar-actions">
                        <button class="mobile-action-btn" onclick="tableEditor.selectAll(true)">
                            <i class="bi bi-check-square"></i>
                            全選択
                        </button>
                        <button class="mobile-action-btn danger" onclick="tableEditor.bulkDelete()">
                            <i class="bi bi-trash"></i>
                            削除
                        </button>
                    </div>
                    <div class="mobile-toolbar-actions">
                        <button class="mobile-action-btn primary" onclick="tableEditor.saveProblems()">
                            <i class="bi bi-save"></i>
                            保存
                        </button>
                    </div>
                </div>
                <div class="mobile-search-container">
                    <input type="text" class="mobile-search-input" placeholder="問題・回答を検索..."
                           oninput="tableEditor.filterMobileCards(this.value)">
                </div>
            </div>
        `;
    }

    // モバイル用カードのレンダリング
    renderMobileCard(problem, index) {
        const isSelected = this.selectedRows.has(problem.id);
        const qualityClass = this.getQualityClass(problem.quality);
        const qualityScore = this.getQualityScore(problem.quality);
        
        // 文字数計算
        const questionLength = (problem.question || '').length;
        const answerLength = (problem.answer || '').length;
        const totalLength = questionLength + answerLength;
        
        return `
            <div class="problem-card ${isSelected ? 'selected' : ''}" data-id="${problem.id}">
                <div class="card-header">
                    <div class="card-number">
                        <input type="checkbox" class="card-checkbox"
                               ${isSelected ? 'checked' : ''}
                               onchange="tableEditor.toggleRowSelection('${problem.id}', this.checked)">
                        <span>問題 ${index + 1}</span>
                    </div>
                    <div class="card-meta">
                        <i class="bi bi-fonts"></i>
                        <span>${totalLength}文字</span>
                    </div>
                </div>
                
                <div class="card-content">
                    <div class="card-field">
                        <div class="card-field-label">
                            <i class="bi bi-question-circle"></i>
                            問題文
                        </div>
                        <div class="card-field-content ${!problem.question ? 'empty' : ''}"
                             data-field="question"
                             data-id="${problem.id}"
                             onclick="tableEditor.startMobileEditing(this)">
                            ${this.escapeHtml(problem.question)}
                        </div>
                    </div>
                    
                    <div class="card-field">
                        <div class="card-field-label">
                            <i class="bi bi-check-circle"></i>
                            回答
                        </div>
                        <div class="card-field-content ${!problem.answer ? 'empty' : ''}"
                             data-field="answer"
                             data-id="${problem.id}"
                             onclick="tableEditor.startMobileEditing(this)">
                            ${this.escapeHtml(problem.answer)}
                        </div>
                    </div>
                </div>
                
                <div class="card-actions">
                    <div class="quality-indicator">
                        <div class="quality-badge ${qualityClass}">${qualityScore}</div>
                        <span>品質</span>
                    </div>
                    <div class="card-action-buttons">
                        <button class="card-action-btn duplicate"
                                onclick="tableEditor.duplicateRow('${problem.id}')"
                                title="複製">
                            <i class="bi bi-files"></i>
                        </button>
                        <button class="card-action-btn quality"
                                onclick="tableEditor.checkProblemQuality('${problem.id}')"
                                title="品質チェック">
                            <i class="bi bi-shield-check"></i>
                        </button>
                        <button class="card-action-btn delete"
                                onclick="tableEditor.deleteRow('${problem.id}')"
                                title="削除">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="swipe-actions">
                    <button class="swipe-action-btn" onclick="tableEditor.deleteRow('${problem.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // モバイル用編集開始
    startMobileEditing(element) {
        if (!this.isMobile) return this.startEditing(element);

        const field = element.dataset.field;
        const problemId = element.dataset.id;
        const problem = this.problems.find(p => p.id == problemId);
        
        if (!problem) return;

        const currentValue = problem[field] || '';
        
        // フルスクリーンモーダルを作成
        const modal = document.createElement('div');
        modal.className = 'mobile-edit-modal';
        modal.innerHTML = `
            <div class="mobile-edit-container">
                <div class="mobile-edit-header">
                    <button class="mobile-edit-cancel" onclick="tableEditor.cancelMobileEditing()">
                        <i class="bi bi-x"></i>
                    </button>
                    <h3>${field === 'question' ? '問題文を編集' : '回答を編集'}</h3>
                    <button class="mobile-edit-save" onclick="tableEditor.saveMobileEditing()">
                        <i class="bi bi-check"></i>
                    </button>
                </div>
                <div class="mobile-edit-content">
                    <textarea class="mobile-edit-textarea"
                              placeholder="${field === 'question' ? '問題文を入力してください' : '回答を入力してください'}"
                              data-field="${field}"
                              data-id="${problemId}">${currentValue}</textarea>
                    <div class="mobile-edit-info">
                        <span class="char-count">0文字</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        const textarea = modal.querySelector('.mobile-edit-textarea');
        const charCount = modal.querySelector('.char-count');
        
        // 文字数カウンター
        const updateCharCount = () => {
            charCount.textContent = textarea.value.length + '文字';
        };
        
        textarea.addEventListener('input', updateCharCount);
        updateCharCount();
        
        // フォーカス
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }, 100);
        
        this.currentMobileModal = modal;
    }

    // モバイル編集の保存
    saveMobileEditing() {
        const modal = this.currentMobileModal;
        if (!modal) return;

        const textarea = modal.querySelector('.mobile-edit-textarea');
        const field = textarea.dataset.field;
        const problemId = textarea.dataset.id;
        const newValue = textarea.value.trim();

        this.updateProblemField(problemId, field, newValue);
        this.cancelMobileEditing();
        this.render();
        this.autoSave();
    }

    // モバイル編集のキャンセル
    cancelMobileEditing() {
        if (this.currentMobileModal) {
            this.currentMobileModal.remove();
            this.currentMobileModal = null;
        }
    }

    // モバイル用カードのフィルタリング
    filterMobileCards(searchTerm) {
        const cards = document.querySelectorAll('.problem-card');
        const term = searchTerm.toLowerCase();
        
        cards.forEach(card => {
            const question = card.querySelector('[data-field="question"]').textContent.toLowerCase();
            const answer = card.querySelector('[data-field="answer"]').textContent.toLowerCase();
            
            if (question.includes(term) || answer.includes(term)) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    }
}

// グローバル変数として初期化
let tableEditor;

// ページ読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', () => {
    // 表形式エディタの要素が存在する場合のみ初期化
    if (document.getElementById('problemTable')) {
        tableEditor = new TableEditor();
        // グローバルアクセス用
        window.tableEditor = tableEditor;
    }
});

// 既存の関数との互換性のための関数
function addNewRow() {
    if (tableEditor) {
        tableEditor.addNewRow();
    }
}

// 既存のeditor.jsとの互換性関数
window.convertToTableEditor = function() {
    if (window.problems && window.problems.length > 0) {
        // 既存の問題データを表形式エディタに変換
        const convertedProblems = window.problems.map(p => ({
            id: Date.now() + Math.random(),
            question: p.question || '',
            answer: p.answer || '',
            created: p.created || new Date().toISOString(),
            updated: p.updated || new Date().toISOString(),
            quality: null
        }));
        
        if (tableEditor) {
            tableEditor.problems = convertedProblems;
            tableEditor.render();
            tableEditor.saveToStorage();
        }
    }
};