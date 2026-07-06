// ============================================================
// 全局状态
// ============================================================
const state = {
    images: {
        geometry: null,
        coordinate: null,
        '3d': null
    },
    tables: {
        1: null,
        2: null
    },
    isSolving: false,
    rawSolution: ''
};

// ============================================================
// LaTeX 工具栏
// ============================================================
function insertLatex(latex) {
    const textarea = document.getElementById('text-input');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // 插入 LaTeX 代码（用 $ 包裹）
    const insertion = `$${latex}$`;
    textarea.value = text.substring(0, start) + insertion + text.substring(end);

    // 设置光标位置
    const cursorPos = start + insertion.length;
    textarea.setSelectionRange(cursorPos, cursorPos);
    textarea.focus();

    // 更新预览
    updatePreview();
}

// ============================================================
// 实时预览
// ============================================================
function updatePreview() {
    const input = document.getElementById('text-input').value;
    const preview = document.getElementById('input-preview');

    if (!input.trim()) {
        preview.innerHTML = '<span class="preview-placeholder">公式预览区</span>';
        return;
    }

    // 转义 HTML
    let html = input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    preview.innerHTML = html;

    // 渲染 KaTeX
    try {
        renderMathInElement(preview, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
        });
    } catch (e) {
        console.warn('KaTeX render error:', e);
    }
}

// 绑定输入事件
document.getElementById('text-input').addEventListener('input', updatePreview);

// ============================================================
// 图片上传处理
// ============================================================
function handleImageUpload(input, type) {
    const file = input.files[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
        alert('请上传图片文件（PNG, JPG, GIF, WebP 等）');
        input.value = '';
        return;
    }

    // 验证文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
        alert('图片大小不能超过 10MB');
        input.value = '';
        return;
    }

    // 显示预览
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = document.getElementById(`img-${type}`);
        const preview = document.getElementById(`preview-${type}`);
        const placeholder = document.getElementById(`placeholder-${type}`);

        img.src = e.target.result;
        preview.style.display = 'flex';
        placeholder.style.display = 'none';

        state.images[type] = file;
    };
    reader.readAsDataURL(file);
}

function removeImage(type, event) {
    event.stopPropagation();

    const input = document.getElementById(`image-${type}`);
    const preview = document.getElementById(`preview-${type}`);
    const placeholder = document.getElementById(`placeholder-${type}`);

    input.value = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';

    state.images[type] = null;
}

// ============================================================
// 表格上传处理
// ============================================================
function handleTableUpload(input, index) {
    const file = input.files[0];
    if (!file) return;

    // 验证文件类型
    const validTypes = ['image/', 'text/csv', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const isValid = validTypes.some(t => file.type.startsWith(t)) ||
                    file.name.endsWith('.csv') ||
                    file.name.endsWith('.xlsx') ||
                    file.name.endsWith('.xls');

    if (!isValid) {
        alert('请上传图片、CSV 或 Excel 文件');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById(`preview-table${index}`);
        const placeholder = document.getElementById(`placeholder-table${index}`);
        const filename = document.getElementById(`filename-table${index}`);

        if (file.type.startsWith('image/')) {
            const img = document.getElementById(`img-table${index}`);
            img.src = e.target.result;
            img.style.display = 'block';
        }

        filename.textContent = file.name;
        preview.style.display = 'flex';
        placeholder.style.display = 'none';

        state.tables[index] = file;
    };

    if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
    } else {
        reader.readAsDataURL(file);
        state.tables[index] = file;
        // 对于非图片文件，直接显示文件名
        const preview = document.getElementById(`preview-table${index}`);
        const placeholder = document.getElementById(`placeholder-table${index}`);
        const filename = document.getElementById(`filename-table${index}`);
        filename.textContent = file.name;
        preview.style.display = 'flex';
        placeholder.style.display = 'none';
    }
}

function removeTable(index, event) {
    event.stopPropagation();

    const input = document.getElementById(`table-${index}`);
    const preview = document.getElementById(`preview-table${index}`);
    const placeholder = document.getElementById(`placeholder-table${index}`);

    input.value = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';

    state.tables[index] = null;
}

// ============================================================
// 拖拽上传支持
// ============================================================
document.querySelectorAll('.upload-area').forEach(area => {
    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('drag-over');
    });

    area.addEventListener('dragleave', () => {
        area.classList.remove('drag-over');
    });

    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // 找到对应的 input
            const input = area.querySelector('input[type="file"]');
            if (input) {
                // 创建新的 DataTransfer 来设置文件
                const dt = new DataTransfer();
                dt.items.add(files[0]);
                input.files = dt.files;
                input.dispatchEvent(new Event('change'));
            }
        }
    });
});

// ============================================================
// 提交解题
// ============================================================
async function submitProblem() {
    if (state.isSolving) return;

    const textInput = document.getElementById('text-input').value.trim();
    const notes = document.getElementById('notes-input').value.trim();

    // 检查是否有输入
    const hasImages = Object.values(state.images).some(img => img !== null);
    const hasTables = Object.values(state.tables).some(t => t !== null);

    if (!textInput && !hasImages && !hasTables) {
        alert('请至少输入题目内容或上传图片/表格');
        return;
    }

    // 构建表单数据
    const formData = new FormData();
    formData.append('text_input', textInput);
    formData.append('notes', notes);

    // 添加图片备注到文本
    let imageNotes = [];
    ['geometry', 'coordinate', '3d'].forEach(type => {
        const note = document.getElementById(`note-${type}`).value.trim();
        if (note) {
            const typeNames = { geometry: '平面几何图', coordinate: '坐标系图', '3d': '立体图' };
            imageNotes.push(`${typeNames[type]}备注: ${note}`);
        }
    });

    if (imageNotes.length > 0) {
        formData.append('notes', notes + '\n\n【图片补充说明】\n' + imageNotes.join('\n'));
    }

    // 添加图片文件
    if (state.images.geometry) formData.append('image_geometry', state.images.geometry);
    if (state.images.coordinate) formData.append('image_coordinate', state.images.coordinate);
    if (state.images['3d']) formData.append('image_3d', state.images['3d']);

    // 添加表格文件
    if (state.tables[1]) formData.append('table_1', state.tables[1]);
    if (state.tables[2]) formData.append('table_2', state.tables[2]);

    // UI 状态更新
    state.isSolving = true;
    state.rawSolution = '';

    const solveBtn = document.getElementById('solve-btn');
    solveBtn.disabled = true;
    solveBtn.innerHTML = '<span class="btn-icon">⏳</span> 解题中...';

    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('solution-content').style.display = 'block';
    document.getElementById('solution-content').innerHTML = '';
    document.getElementById('loading-indicator').style.display = 'flex';

    try {
        const response = await fetch('/api/solve', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '请求失败');
        }

        // 流式读取响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        document.getElementById('loading-indicator').style.display = 'none';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            state.rawSolution += chunk;

            // 渲染 Markdown + LaTeX
            renderSolution(state.rawSolution);
        }

        // 最终渲染
        renderSolution(state.rawSolution);

    } catch (error) {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('solution-content').innerHTML =
            `<div style="color: var(--danger); padding: 20px; text-align: center;">
                <p style="font-size: 18px; margin-bottom: 8px;">❌ 解题失败</p>
                <p style="font-size: 14px; color: var(--text-secondary);">${error.message}</p>
            </div>`;
    } finally {
        state.isSolving = false;
        solveBtn.disabled = false;
        solveBtn.innerHTML = '<span class="btn-icon">🚀</span> 开始解题';
    }
}

// ============================================================
// 渲染解答（Markdown + LaTeX）
// ============================================================
function renderSolution(text) {
    const container = document.getElementById('solution-content');

    // 先用 marked 渲染 Markdown
    let html = marked.parse(text, {
        breaks: true,
        gfm: true
    });

    container.innerHTML = html;

    // 然后用 KaTeX 渲染 LaTeX
    try {
        renderMathInElement(container, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false,
            errorColor: '#ef4444'
        });
    } catch (e) {
        console.warn('KaTeX render error:', e);
    }

    // 自动滚动到底部
    const outputContent = document.getElementById('output-content');
    outputContent.scrollTop = outputContent.scrollHeight;
}

// ============================================================
// 工具函数
// ============================================================
function copySolution() {
    if (!state.rawSolution) {
        alert('暂无解答内容可复制');
        return;
    }

    navigator.clipboard.writeText(state.rawSolution).then(() => {
        // 简单的提示
        const btn = event.target;
        const original = btn.textContent;
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch(() => {
        // fallback
        const textarea = document.createElement('textarea');
        textarea.value = state.rawSolution;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    });
}

function toggleFullscreen() {
    const panel = document.querySelector('.output-panel');
    panel.classList.toggle('fullscreen');
}

function clearAll() {
    if (!confirm('确定要清空所有内容吗？')) return;

    // 清空文本
    document.getElementById('text-input').value = '';
    document.getElementById('notes-input').value = '';
    updatePreview();

    // 清空图片
    ['geometry', 'coordinate', '3d'].forEach(type => {
        removeImage(type, { stopPropagation: () => {} });
        document.getElementById(`note-${type}`).value = '';
    });

    // 清空表格
    [1, 2].forEach(i => {
        removeTable(i, { stopPropagation: () => {} });
    });

    // 清空解答
    state.rawSolution = '';
    document.getElementById('solution-content').style.display = 'none';
    document.getElementById('solution-content').innerHTML = '';
    document.getElementById('empty-state').style.display = 'flex';
    document.getElementById('loading-indicator').style.display = 'none';
}

// ============================================================
// 键盘快捷键
// ============================================================
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitProblem();
    }
});

// ============================================================
// 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    updatePreview();
});
