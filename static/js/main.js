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
    rawSolution: '',
    chatHistory: [],
    conversationHistory: [],
    solveStartTime: null,
    tokenCount: 0
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
    state.solveStartTime = Date.now();
    state.tokenCount = 0;

    const solveBtn = document.getElementById('solve-btn');
    solveBtn.disabled = true;
    solveBtn.innerHTML = '<span class="btn-icon">⏳</span> 解题中...';

    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('solution-content').style.display = 'block';
    document.getElementById('solution-content').innerHTML = '';
    document.getElementById('loading-indicator').style.display = 'flex';
    document.getElementById('solution-meta').style.display = 'none';

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
            state.tokenCount += estimateTokenCount(chunk);

            // 渲染 Markdown + LaTeX
            renderSolution(state.rawSolution);
            updateSolutionMeta();
        }

        // 最终渲染
        renderSolution(state.rawSolution);
        updateSolutionMeta();

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

    // 先用 marked 渲染 Markdown，配置选项以保留 LaTeX 命令
    let html = marked.parse(text, {
        breaks: true,
        gfm: true,
        mangle: false,
        headerIds: false
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
// 更新解题元信息（时间、Token 数量）
// ============================================================
function updateSolutionMeta() {
    const metaDiv = document.getElementById('solution-meta');
    const timeSpan = document.getElementById('solve-time');
    const tokenSpan = document.getElementById('token-count');

    if (!metaDiv || !timeSpan || !tokenSpan) return;

    // 显示元信息区域
    metaDiv.style.display = 'block';

    // 计算解题时间
    if (state.solveStartTime) {
        const elapsed = ((Date.now() - state.solveStartTime) / 1000).toFixed(1);
        timeSpan.textContent = elapsed + 's';
    }

    // 显示 Token 数量
    tokenSpan.textContent = state.tokenCount.toLocaleString();
}

// ============================================================
// 估算 Token 数量（简单按字符数估算）
// ============================================================
function estimateTokenCount(text) {
    // 粗略估算：英文约 4 字符 1 token，中文约 1.5 字符 1 token
    const englishChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    return Math.ceil(englishChars / 4 + chineseChars / 1.5);
}

// ============================================================
// 渲染 LaTeX 解答
// ============================================================
function renderLatexSolution() {
    if (!state.rawSolution) {
        alert('暂无解答内容可渲染');
        return;
    }

    // 创建新窗口
    const printWindow = window.open('', '_blank');
    
    // 构建完整的 HTML 文档
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>解题过程 - LaTeX 渲染</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js"></script>
    <script>
        // 配置 marked 选项，禁用对反斜杠的转义，保留 LaTeX 命令
        marked.setOptions({
            mangle: false,
            headerIds: false
        });
    </script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.8;
            color: #1e293b;
        }
        h1, h2, h3 { color: #1e293b; margin: 24px 0 12px; }
        h1 { font-size: 28px; }
        h2 { font-size: 22px; }
        h3 { font-size: 18px; }
        p { margin: 12px 0; }
        ul, ol { padding-left: 24px; margin: 12px 0; }
        li { margin: 6px 0; }
        .katex-display { margin: 20px 0; overflow-x: auto; overflow-y: hidden; }
        @media print {
            body { padding: 20px; }
        }
    </style>
</head>
<body>
    <div id="content"></div>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const rawSolution = ${JSON.stringify(state.rawSolution)};
            const contentDiv = document.getElementById('content');
            contentDiv.innerHTML = marked.parse(rawSolution, { 
                breaks: true, 
                gfm: true,
                mangle: false,
                headerIds: false
            });
            
            renderMathInElement(contentDiv, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false,
                errorColor: '#ef4444'
            });
        });
    <\/script>
</body>
</html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
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
    loadChatHistory();
});

// ============================================================
// 对话功能
// ============================================================

// 打开对话对话框
function openChatDialog() {
    const overlay = document.getElementById('chat-dialog-overlay');
    overlay.classList.add('active');
    renderChatMessages();
    setTimeout(() => document.getElementById('chat-input').focus(), 300);
}

// 关闭对话对话框
function closeChatDialog(event) {
    if (!event || event.target === document.getElementById('chat-dialog-overlay')) {
        document.getElementById('chat-dialog-overlay').classList.remove('active');
    }
}

// 打开历史面板
function openHistoryPanel() {
    const overlay = document.getElementById('history-panel-overlay');
    overlay.classList.add('active');
    renderHistoryList();
}

// 关闭历史面板
function closeHistoryPanel(event) {
    if (!event || event.target === document.getElementById('history-panel-overlay')) {
        document.getElementById('history-panel-overlay').classList.remove('active');
    }
}

// 处理聊天输入框键盘事件
function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

// 发送聊天消息
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // 添加用户消息到聊天历史
    state.chatHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });
    
    // 清空输入框
    input.value = '';
    
    // 渲染消息
    renderChatMessages();
    
    // 显示加载状态
    const messagesContainer = document.getElementById('chat-messages');
    const loadingId = 'loading-' + Date.now();
    messagesContainer.innerHTML += '<div class="chat-message system-message" id="' + loadingId + '"><div class="message-avatar">🤖</div><div class="message-content">思考中...</div></div>';
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    try {
        // 构建对话上下文
        const conversationContext = buildConversationContext();
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                solution: state.rawSolution,
                conversation: conversationContext
            })
        });
        
        if (!response.ok) {
            throw new Error('请求失败');
        }
        
        const data = await response.json();
        
        // 移除加载提示
        var loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        
        // 添加助手回复
        state.chatHistory.push({
            role: 'assistant',
            content: data.response || '抱歉，我暂时无法回答这个问题。',
            timestamp: new Date().toISOString()
        });
        
        // 保存到对话历史
        saveToConversationHistory(message, data.response);
        
        // 持久化保存
        saveChatHistory();
        
        // 重新渲染
        renderChatMessages();
        
    } catch (error) {
        var loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        state.chatHistory.push({
            role: 'assistant',
            content: '抱歉，发生错误：' + error.message,
            timestamp: new Date().toISOString()
        });
        renderChatMessages();
    }
}

// 构建对话上下文（包含最近的几条消息）
function buildConversationContext() {
    var recentMessages = state.chatHistory.slice(-10);
    return recentMessages.map(function(msg) {
        return { role: msg.role, content: msg.content };
    });
}

// 渲染聊天消息
function renderChatMessages() {
    var container = document.getElementById('chat-messages');
    
    if (state.chatHistory.length === 0) {
        container.innerHTML = '<div class="chat-message system-message"><div class="message-content">你好！我是对你的解题助手。如果你对解答步骤有任何疑问，或者需要进一步的解释，请随时问我！</div></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < state.chatHistory.length; i++) {
        var msg = state.chatHistory[i];
        var isUser = msg.role === 'user';
        var avatar = isUser ? '👤' : '🤖';
        var messageClass = isUser ? 'user-message' : 'system-message';
        
        // 简单转义
        var renderedContent = msg.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        html += '<div class="chat-message ' + messageClass + '">';
        html += '<div class="message-avatar">' + avatar + '</div>';
        html += '<div class="message-content">' + renderedContent + '</div>';
        html += '</div>';
    }
    
    container.innerHTML = html;
    
    // 渲染 KaTeX
    try {
        renderMathInElement(container, {
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
    
    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}

// 保存到对话历史
function saveToConversationHistory(userMessage, assistantResponse) {
    var preview = userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
    state.conversationHistory.unshift({
        id: Date.now(),
        title: '关于解题的讨论',
        preview: preview,
        date: new Date().toLocaleString('zh-CN'),
        messages: state.chatHistory.slice()
    });
    
    // 限制历史记录数量
    if (state.conversationHistory.length > 50) {
        state.conversationHistory = state.conversationHistory.slice(0, 50);
    }
    
    // 保存到 localStorage
    localStorage.setItem('conversationHistory', JSON.stringify(state.conversationHistory));
}

// 保存聊天历史到 localStorage
function saveChatHistory() {
    localStorage.setItem('chatHistory', JSON.stringify(state.chatHistory));
}

// 从 localStorage 加载聊天历史
function loadChatHistory() {
    var saved = localStorage.getItem('chatHistory');
    if (saved) {
        try {
            state.chatHistory = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load chat history:', e);
        }
    }
    
    var savedConv = localStorage.getItem('conversationHistory');
    if (savedConv) {
        try {
            state.conversationHistory = JSON.parse(savedConv);
        } catch (e) {
            console.error('Failed to load conversation history:', e);
        }
    }
}

// 渲染历史记录列表
function renderHistoryList() {
    var container = document.getElementById('history-list');
    
    if (state.conversationHistory.length === 0) {
        container.innerHTML = '<div class="empty-history"><div class="empty-history-icon">📜</div><p>暂无对话历史</p></div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < state.conversationHistory.length; i++) {
        var item = state.conversationHistory[i];
        html += '<div class="history-item" onclick="loadConversation(' + item.id + ')">';
        html += '<div class="history-item-title">' + item.title + '</div>';
        html += '<div class="history-item-date">' + item.date + '</div>';
        html += '<div class="history-item-preview">' + item.preview + '</div>';
        html += '</div>';
    }
    
    container.innerHTML = html;
}

// 加载指定对话
function loadConversation(id) {
    var conversation = null;
    for (var i = 0; i < state.conversationHistory.length; i++) {
        if (state.conversationHistory[i].id === id) {
            conversation = state.conversationHistory[i];
            break;
        }
    }
    
    if (conversation) {
        state.chatHistory = conversation.messages.slice();
        saveChatHistory();
        renderChatMessages();
        closeHistoryPanel();
        openChatDialog();
    }
}

// 导出历史记录
function exportHistory() {
    if (state.conversationHistory.length === 0) {
        alert('暂无可导出的历史记录');
        return;
    }
    
    var exportData = state.conversationHistory.map(function(item) {
        return { title: item.title, date: item.date, messages: item.messages };
    });
    
    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '对话历史_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

// 清空历史记录
function clearHistory() {
    if (!confirm('确定要清空所有对话历史吗？此操作不可恢复。')) return;
    
    state.conversationHistory = [];
    state.chatHistory = [];
    localStorage.removeItem('conversationHistory');
    localStorage.removeItem('chatHistory');
    renderHistoryList();
}
