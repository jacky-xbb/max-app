# Task: 切换会话并加载历史消息

**Stage**: 3 - 会话管理功能集成
**Priority**: P0 (必须)
**Estimated Time**: 5-6 hours
**Status**: Not Started

---

## 目标

实现切换会话功能,加载选中会话的历史消息并在聊天区域显示。

## 背景

用户点击会话条目时,需要切换到该会话,加载并显示该会话的历史消息。

## 成功标准

- [ ] 点击会话条目加载该会话的历史消息
- [ ] 加载过程显示加载动画
- [ ] 历史消息按时间顺序正确显示
- [ ] 切换会话后输入框自动关联到新会话
- [ ] 移动端切换后自动关闭侧边栏
- [ ] 滚动到消息底部

## 技术实现

### 1. 后端 API 实现

**文件**: `server/routes/api.js`

#### 1.1 获取会话消息端点
```javascript
// 获取会话历史消息
router.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    // 检查登录状态
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const conversationId = req.params.id;
    const userId = req.session.userId;

    // 分页参数 (可选)
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before; // 游标

    // 调用 Coze API 获取消息列表
    const messages = await CozeSDKAdapter.getConversationMessages(
      conversationId,
      userId,
      { limit, before }
    );

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('获取会话消息失败:', error);
    res.status(500).json({
      error: '获取会话消息失败',
      message: error.message,
    });
  }
});
```

### 2. Coze SDK 适配器扩展

**文件**: `server/utils/cozeSDKAdapter.js`

#### 2.1 添加获取消息方法
```javascript
class CozeSDKAdapter {
  // 获取会话历史消息
  async getConversationMessages(conversationId, userId, options = {}) {
    try {
      // 生成 JWT token
      const token = await jwtService.generateUserToken(userId);

      // 初始化 Coze 客户端
      const coze = new CozeAPI({ token });

      // 调用 Coze API 获取消息列表
      const response = await coze.conversations.messages.list({
        conversation_id: conversationId,
        limit: options.limit || 50,
        before_id: options.before, // 分页游标
        // order: 'asc', // 按时间升序
      });

      const messages = response.data || [];

      // 转换为前端需要的格式
      return messages.map(msg => ({
        id: msg.id,
        role: msg.role, // 'user' | 'assistant'
        content: msg.content,
        type: msg.type, // 'text' | 'image' | etc.
        createdAt: msg.created_at,
      }));
    } catch (error) {
      console.error('Coze API 获取消息失败:', error);
      throw new Error(`获取消息失败: ${error.message}`);
    }
  }
}

module.exports = new CozeSDKAdapter();
```

### 3. 前端实现

**文件**: `public/js/chat.js`

#### 3.1 完善切换会话函数
```javascript
// 切换会话
async function switchSession(sessionId) {
  try {
    // 如果已经是当前会话,不重复加载
    if (currentSessionId === sessionId) {
      return;
    }

    // 更新当前会话 ID
    currentSessionId = sessionId;

    // 更新会话列表的激活状态
    updateSessionListActiveState(sessionId);

    // 清空聊天区域
    clearChatMessages();

    // 显示加载状态
    showMessagesLoading();

    // 加载会话历史消息
    await loadSessionMessages(sessionId);

    // 隐藏加载状态
    hideMessagesLoading();

    // 滚动到底部
    scrollToBottom();

    // 移动端关闭侧边栏
    if (window.innerWidth < 1024) {
      closeSidebar();
    }

    console.log('切换到会话:', sessionId);
  } catch (error) {
    console.error('切换会话失败:', error);
    hideMessagesLoading();
    showNotification('加载会话失败', 'error');
  }
}
```

#### 3.2 加载会话消息
```javascript
// 加载会话历史消息
async function loadSessionMessages(sessionId) {
  try {
    const response = await fetch(`/api/conversations/${sessionId}/messages`, {
      method: 'GET',
      credentials: 'include',
    });

    if (response.status === 401) {
      showLoginModal();
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      const messages = result.data;

      // 渲染消息
      renderMessages(messages);

      console.log(`加载了 ${messages.length} 条消息`);
    } else {
      throw new Error(result.error || '加载消息失败');
    }
  } catch (error) {
    console.error('加载会话消息失败:', error);
    throw error;
  }
}

// 渲染消息列表
function renderMessages(messages) {
  const chatContainer = document.getElementById('chatContainer');

  // 清空现有消息
  chatContainer.innerHTML = '';

  // 按时间顺序渲染每条消息
  messages.forEach(message => {
    const messageElement = createMessageElement(message);
    chatContainer.appendChild(messageElement);
  });
}

// 创建消息元素
function createMessageElement(message) {
  const div = document.createElement('div');
  div.className = `message-item mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`;

  const messageClass = message.role === 'user'
    ? 'inline-block px-4 py-2 bg-blue-500 text-white rounded-lg max-w-[70%]'
    : 'inline-block px-4 py-2 bg-gray-200 text-gray-800 rounded-lg max-w-[70%]';

  div.innerHTML = `
    <div class="${messageClass}">
      ${escapeHtml(message.content)}
    </div>
    <div class="text-xs text-gray-500 mt-1">
      ${formatMessageTime(message.createdAt)}
    </div>
  `;

  return div;
}

// 转义 HTML (防止 XSS)
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 格式化消息时间
function formatMessageTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (messageDate.getTime() === today.getTime()) {
    // 今天
    return timeStr;
  } else if (messageDate.getTime() === today.getTime() - 86400000) {
    // 昨天
    return `昨天 ${timeStr}`;
  } else {
    // 其他日期
    return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
  }
}
```

#### 3.3 加载状态 UI
```javascript
// 显示消息加载状态
function showMessagesLoading() {
  const chatContainer = document.getElementById('chatContainer');

  const loadingHTML = `
    <div id="messagesLoading" class="flex items-center justify-center h-full">
      <div class="text-center">
        <svg class="animate-spin w-8 h-8 text-blue-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-sm text-gray-600">加载消息中...</p>
      </div>
    </div>
  `;

  chatContainer.innerHTML = loadingHTML;
}

// 隐藏消息加载状态
function hideMessagesLoading() {
  const loading = document.getElementById('messagesLoading');
  if (loading) {
    loading.remove();
  }
}

// 滚动到底部
function scrollToBottom() {
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}
```

#### 3.4 发送消息时关联会话
```javascript
// 修改发送消息函数,使用当前会话 ID
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  // 检查登录状态
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) {
    pendingMessage = message;
    showLoginModal();
    return;
  }

  pendingMessage = null;

  // 如果没有当前会话,创建新会话
  if (!currentSessionId) {
    await createNewSession();
    // 等待会话创建完成后,currentSessionId 会被设置
  }

  // 发送消息 (使用 currentSessionId)
  try {
    // 现有的 SSE 发送逻辑
    // 确保 conversation_id 参数使用 currentSessionId
    const url = `/api/chat?query=${encodeURIComponent(message)}&conversation_id=${currentSessionId}`;

    // ... 现有的 EventSource 代码 ...

  } catch (error) {
    console.error('发送消息失败:', error);
    showNotification('发送失败', 'error');
  }
}
```

## 测试清单

### 功能测试
- [ ] 点击会话条目加载历史消息
- [ ] 消息按时间顺序正确显示
- [ ] 用户消息和 AI 消息样式区分
- [ ] 切换会话后输入框关联到新会话
- [ ] 移动端切换后自动关闭侧边栏
- [ ] 自动滚动到消息底部

### UI/UX 测试
- [ ] 加载过程显示加载动画
- [ ] 加载完成后动画消失
- [ ] 消息时间格式正确
- [ ] 长消息换行正确
- [ ] 消息气泡样式正确

### 边界测试
- [ ] 空会话的处理
- [ ] 大量消息的性能 (>100条)
- [ ] 网络错误的处理
- [ ] 快速切换会话的处理
- [ ] XSS 攻击防护 (HTML 转义)

## 依赖

**前置任务**:
- `stage3-task1-fetch-sessions.md` - 获取会话列表 API
- `stage3-task2-create-session.md` - 创建新会话

**后续任务**:
- `stage3-task5-delete-session.md` - 删除会话功能

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 1.2.2 会话操作
- [CLAUDE.md](../CLAUDE.md) - Real-time Chat Architecture
- [Coze API 文档](https://www.coze.com/docs/developer_guides/coze_api_overview)

## 注意事项

1. **消息顺序**: 确保消息按时间升序排列
2. **性能优化**: 大量消息时考虑虚拟滚动或分页加载
3. **安全性**: 必须对消息内容进行 HTML 转义,防止 XSS
4. **用户体验**: 加载完成后自动滚动到最新消息

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 成功加载和显示会话历史消息
4. 消息样式和交互正确
5. 提交信息格式: `feat(sessions): implement switch session and load history`
