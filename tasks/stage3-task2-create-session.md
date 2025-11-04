# Task: 创建新会话功能

**Stage**: 3 - 会话管理功能集成
**Priority**: P0 (必须)
**Estimated Time**: 3-4 hours
**Status**: Not Started

---

## 目标

实现创建新会话的功能,包括调用 Coze API 创建会话,并立即切换到新会话。

## 背景

用户点击"新建会话"按钮时,需要创建一个新的会话,并切换到该会话,清空聊天区域。

## 成功标准

- [ ] 点击"新建会话"按钮创建新会话
- [ ] 创建成功后立即切换到新会话
- [ ] 清空聊天区域
- [ ] 新会话出现在会话列表顶部
- [ ] 移动端创建会话后自动关闭侧边栏
- [ ] 显示加载状态和错误提示

## 技术实现

### 1. 后端 API 实现

**文件**: `server/routes/api.js`

#### 1.1 创建会话端点
```javascript
// 创建新会话
router.post('/api/conversations', async (req, res) => {
  try {
    // 检查登录状态
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const userId = req.session.userId;

    // 调用 Coze API 创建会话
    const conversation = await CozeSDKAdapter.createConversation(userId);

    // 返回新会话
    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error('创建会话失败:', error);
    res.status(500).json({
      error: '创建会话失败',
      message: error.message,
    });
  }
});
```

### 2. Coze SDK 适配器扩展

**文件**: `server/utils/cozeSDKAdapter.js`

#### 2.1 添加创建会话方法
```javascript
class CozeSDKAdapter {
  // 创建新会话
  async createConversation(userId) {
    try {
      // 生成 JWT token
      const token = await jwtService.generateUserToken(userId);

      // 初始化 Coze 客户端
      const coze = new CozeAPI({ token });

      // 调用 Coze API 创建会话
      const response = await coze.conversations.create({
        // 根据 Coze SDK 文档填写参数
        // 可能需要: bot_id, workspace_id 等
        bot_id: process.env.COZE_BOT_ID,
        // meta_data: { title: '新会话' }, // 如果支持
      });

      const conversation = response.data;

      // 转换为前端需要的格式
      return {
        id: conversation.conversation_id || conversation.id,
        title: conversation.meta_data?.title || null,
        firstMessage: null, // 新会话没有消息
        lastActiveTime: conversation.created_at || new Date().toISOString(),
        messageCount: 0,
      };
    } catch (error) {
      console.error('Coze API 创建会话失败:', error);
      throw new Error(`创建会话失败: ${error.message}`);
    }
  }
}

module.exports = new CozeSDKAdapter();
```

### 3. 前端实现

**文件**: `public/js/chat.js`

#### 3.1 创建新会话
```javascript
// 创建新会话
async function createNewSession() {
  try {
    // 显示加载状态
    const newSessionBtn = document.getElementById('newSessionBtn');
    const originalText = newSessionBtn.innerHTML;
    newSessionBtn.disabled = true;
    newSessionBtn.innerHTML = `
      <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>创建中...</span>
    `;

    // 调用 API 创建会话
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (response.status === 401) {
      // 未登录,显示登录模态框
      showLoginModal();
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      const newSession = result.data;

      // 刷新会话列表
      await refreshSessions();

      // 切换到新会话
      switchSession(newSession.id);

      // 移动端自动关闭侧边栏
      if (window.innerWidth < 1024) {
        closeSidebar();
      }

      console.log('新会话创建成功:', newSession.id);
    } else {
      throw new Error(result.error || '创建会话失败');
    }
  } catch (error) {
    console.error('创建新会话失败:', error);
    showNotification('创建会话失败,请重试', 'error');
  } finally {
    // 恢复按钮状态
    const newSessionBtn = document.getElementById('newSessionBtn');
    newSessionBtn.disabled = false;
    newSessionBtn.innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>
      <span>新建会话</span>
    `;
  }
}

// 绑定新建会话按钮事件
document.getElementById('newSessionBtn').addEventListener('click', createNewSession);
```

#### 3.2 切换会话 (基础实现)
```javascript
// 切换会话
async function switchSession(sessionId) {
  try {
    // 更新当前会话 ID
    currentSessionId = sessionId;

    // 清空聊天区域
    clearChatMessages();

    // 更新会话列表的激活状态
    updateSessionListActiveState(sessionId);

    // TODO: Stage 3 Task 4 - 加载会话历史消息
    // await loadSessionMessages(sessionId);

    // 移动端关闭侧边栏
    if (window.innerWidth < 1024) {
      closeSidebar();
    }

    console.log('切换到会话:', sessionId);
  } catch (error) {
    console.error('切换会话失败:', error);
    showNotification('切换会话失败', 'error');
  }
}

// 清空聊天消息
function clearChatMessages() {
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    chatContainer.innerHTML = '';
  }
}

// 更新会话列表的激活状态
function updateSessionListActiveState(activeSessionId) {
  const sessionItems = document.querySelectorAll('.session-item');

  sessionItems.forEach(item => {
    const sessionId = item.dataset.sessionId;

    if (sessionId === activeSessionId) {
      // 激活状态
      item.classList.add('active', 'bg-blue-500', 'text-white');
      item.classList.remove('hover:bg-gray-100');

      // 更新图标和文字颜色
      item.querySelectorAll('svg, h3, p').forEach(el => {
        if (el.tagName === 'svg') {
          el.classList.remove('text-gray-500', 'text-gray-600');
          el.classList.add('text-white');
        } else if (el.tagName === 'H3') {
          el.classList.remove('text-gray-800');
          el.classList.add('text-white');
        } else if (el.tagName === 'P') {
          el.classList.remove('text-gray-500');
          el.classList.add('text-blue-100');
        }
      });
    } else {
      // 非激活状态
      item.classList.remove('active', 'bg-blue-500', 'text-white');
      item.classList.add('hover:bg-gray-100');

      // 恢复图标和文字颜色
      item.querySelectorAll('svg, h3, p').forEach(el => {
        if (el.tagName === 'svg') {
          el.classList.remove('text-white');
          el.classList.add('text-gray-500');
        } else if (el.tagName === 'H3') {
          el.classList.remove('text-white');
          el.classList.add('text-gray-800');
        } else if (el.tagName === 'P') {
          el.classList.remove('text-blue-100');
          el.classList.add('text-gray-500');
        }
      });
    }
  });
}
```

#### 3.3 优化会话列表渲染
```javascript
// 修改 renderSessionList 函数,支持新增会话
function renderSessionList(sessions, newSessionId = null) {
  const sessionList = document.getElementById('sessionList');
  const emptyState = document.getElementById('emptyState');

  if (!sessions || sessions.length === 0) {
    emptyState.classList.remove('hidden');
    const existingItems = sessionList.querySelectorAll('.session-item');
    existingItems.forEach(item => item.remove());
    return;
  }

  emptyState.classList.add('hidden');

  // 清空现有会话条目
  const existingItems = sessionList.querySelectorAll('.session-item');
  existingItems.forEach(item => item.remove());

  // 按时间倒序排列
  const sortedSessions = sessions.sort((a, b) => {
    return new Date(b.lastActiveTime) - new Date(a.lastActiveTime);
  });

  // 渲染每个会话条目
  sortedSessions.forEach(session => {
    const item = renderSessionItem(session);
    sessionList.appendChild(item);

    // 如果是新创建的会话,添加淡入动画
    if (session.id === newSessionId) {
      item.classList.add('animate-fade-in');
    }
  });
}
```

#### 3.4 添加淡入动画
**文件**: `public/css/input.css`

```css
/* 新会话淡入动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}
```

### 4. 通知组件

**文件**: `public/js/chat.js`

```javascript
// 改进的通知函数
function showNotification(message, type = 'success') {
  // 移除现有通知
  const existing = document.getElementById('notification');
  if (existing) {
    existing.remove();
  }

  // 创建通知元素
  const notification = document.createElement('div');
  notification.id = 'notification';
  notification.className = `
    fixed top-4 right-4 z-50
    px-6 py-3 rounded-lg shadow-lg
    flex items-center gap-3
    transition-all duration-300
    ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}
  `;

  const icon = type === 'success'
    ? '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>'
    : '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>';

  notification.innerHTML = `
    ${icon}
    <span>${message}</span>
  `;

  document.body.appendChild(notification);

  // 3秒后自动移除
  setTimeout(() => {
    notification.classList.add('opacity-0', 'translate-x-full');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
```

## 测试清单

### 功能测试
- [ ] 点击"新建会话"按钮创建会话
- [ ] 创建成功后会话列表更新
- [ ] 创建成功后自动切换到新会话
- [ ] 聊天区域被清空
- [ ] 新会话出现在列表顶部
- [ ] 移动端创建后自动关闭侧边栏

### UI/UX 测试
- [ ] 创建过程显示加载状态
- [ ] 按钮在创建过程中不可点击
- [ ] 创建成功显示成功提示
- [ ] 创建失败显示错误提示
- [ ] 新会话有淡入动画

### 边界测试
- [ ] 未登录时创建会话的处理
- [ ] 网络错误时的处理
- [ ] Coze API 失败时的处理
- [ ] 快速连续点击创建按钮的处理

## 依赖

**前置任务**:
- `stage3-task1-fetch-sessions.md` - 获取会话列表 API

**后续任务**:
- `stage3-task4-switch-session.md` - 切换会话并加载历史消息

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 1.2.2 会话操作
- [Coze API 文档](https://www.coze.com/docs/developer_guides/coze_api_overview)
- Coze SDK: `@coze/api` v1.3.5

## 注意事项

1. **立即切换**: 创建成功后立即切换到新会话,不等待用户手动点击
2. **清空聊天**: 切换到新会话时清空聊天区域
3. **按钮状态**: 创建过程中禁用按钮,防止重复点击
4. **移动端体验**: 创建后自动关闭侧边栏,直接进入聊天

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 成功调用 Coze API 创建会话
4. 创建的会话在列表中正确显示
5. 提交信息格式: `feat(sessions): implement create new conversation`
