# Task: 获取会话列表 API 集成

**Stage**: 3 - 会话管理功能集成
**Priority**: P0 (必须)
**Estimated Time**: 4-5 hours
**Status**: Not Started

---

## 目标

集成 Coze API,实现获取用户会话列表的功能,并在侧边栏展示。

## 背景

需要调用 Coze API 获取用户的所有会话,并在前端侧边栏展示。会话数据存储在 Coze 后端。

## 成功标准

- [ ] 登录后自动获取并显示用户的会话列表
- [ ] 会话列表按最后活跃时间倒序排列
- [ ] 会话列表显示加载状态
- [ ] 错误情况有友好的提示信息
- [ ] 会话列表数据来自 Coze API

## 技术实现

### 1. 后端 API 实现

**文件**: `server/routes/api.js`

#### 1.1 获取会话列表端点
```javascript
const express = require('express');
const router = express.Router();
const CozeSDKAdapter = require('../utils/cozeSDKAdapter');

// 获取用户会话列表
router.get('/api/conversations', async (req, res) => {
  try {
    // 检查登录状态
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const userId = req.session.userId;

    // 调用 Coze API 获取会话列表
    const conversations = await CozeSDKAdapter.listConversations(userId);

    // 返回会话列表
    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error('获取会话列表失败:', error);
    res.status(500).json({
      error: '获取会话列表失败',
      message: error.message,
    });
  }
});

module.exports = router;
```

### 2. Coze SDK 适配器扩展

**文件**: `server/utils/cozeSDKAdapter.js`

#### 2.1 添加会话列表方法
```javascript
const { CozeAPI } = require('@coze/api');
const jwtService = require('./jwtService');

class CozeSDKAdapter {
  constructor() {
    // 现有构造函数
  }

  // 获取用户会话列表
  async listConversations(userId) {
    try {
      // 生成 JWT token
      const token = await jwtService.generateUserToken(userId);

      // 初始化 Coze 客户端
      const coze = new CozeAPI({
        token,
        // 其他配置...
      });

      // 调用 Coze API 获取会话列表
      const response = await coze.conversations.list({
        // 根据 Coze SDK 文档填写参数
        // 可能需要: workspace_id, bot_id, user_id 等
      });

      // 处理响应数据
      const conversations = response.data || [];

      // 转换为前端需要的格式
      return conversations.map(conv => ({
        id: conv.conversation_id || conv.id,
        title: conv.meta_data?.title || null,
        firstMessage: this.extractFirstMessage(conv),
        lastActiveTime: conv.updated_at || conv.created_at,
        messageCount: conv.message_count || 0,
      }));
    } catch (error) {
      console.error('Coze API 获取会话列表失败:', error);
      throw new Error(`获取会话列表失败: ${error.message}`);
    }
  }

  // 提取第一条用户消息作为标题
  extractFirstMessage(conversation) {
    // 如果 Coze 返回的会话对象包含消息列表
    if (conversation.messages && conversation.messages.length > 0) {
      const firstUserMessage = conversation.messages.find(
        msg => msg.role === 'user'
      );
      return firstUserMessage?.content || '新会话';
    }

    // 如果没有消息,返回默认标题
    return '新会话';
  }

  // 获取会话的第一条消息 (如果 Coze 不直接提供)
  async getConversationFirstMessage(conversationId, userId) {
    try {
      const token = await jwtService.generateUserToken(userId);
      const coze = new CozeAPI({ token });

      // 获取会话消息列表 (仅第一条)
      const response = await coze.conversations.messages.list({
        conversation_id: conversationId,
        limit: 10, // 获取前10条,寻找第一条用户消息
      });

      const messages = response.data || [];
      const firstUserMessage = messages.find(msg => msg.role === 'user');

      return firstUserMessage?.content || '新会话';
    } catch (error) {
      console.error('获取会话首条消息失败:', error);
      return '新会话';
    }
  }
}

module.exports = new CozeSDKAdapter();
```

#### 2.2 优化方案 (如果 Coze 不返回第一条消息)
```javascript
// 批量获取会话的第一条消息
async listConversationsWithFirstMessage(userId) {
  try {
    // 1. 获取会话列表
    const conversations = await this.listConversations(userId);

    // 2. 并行获取每个会话的第一条消息
    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conv) => {
        // 如果已有标题,跳过
        if (conv.title) {
          return conv;
        }

        // 获取第一条消息
        const firstMessage = await this.getConversationFirstMessage(
          conv.id,
          userId
        );

        return {
          ...conv,
          firstMessage,
        };
      })
    );

    return conversationsWithMessages;
  } catch (error) {
    console.error('获取会话列表(含消息)失败:', error);
    throw error;
  }
}
```

### 3. 前端 API 调用

**文件**: `public/js/chat.js`

#### 3.1 获取会话列表
```javascript
// 获取会话列表
async function fetchSessions() {
  try {
    // 显示加载状态
    showSessionsLoading();

    const response = await fetch('/api/conversations', {
      method: 'GET',
      credentials: 'include', // 包含 session cookie
    });

    if (response.status === 401) {
      // 未登录
      console.log('未登录,无法获取会话列表');
      hideSessionsLoading();
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      // 渲染会话列表
      renderSessionList(result.data);

      // 如果有会话,自动加载第一个会话 (可选)
      if (result.data.length > 0 && !currentSessionId) {
        const firstSession = result.data[0];
        switchSession(firstSession.id);
      }
    } else {
      throw new Error(result.error || '获取会话列表失败');
    }

    hideSessionsLoading();
  } catch (error) {
    console.error('获取会话列表失败:', error);
    hideSessionsLoading();
    showSessionsError('获取会话列表失败,请刷新重试');
  }
}
```

#### 3.2 加载状态 UI
```javascript
// 显示会话列表加载状态
function showSessionsLoading() {
  const sessionList = document.getElementById('sessionList');
  const emptyState = document.getElementById('emptyState');

  // 隐藏空状态
  emptyState.classList.add('hidden');

  // 显示加载骨架屏
  const loadingHTML = `
    <div id="sessionsLoading" class="space-y-3">
      ${Array(3).fill(0).map(() => `
        <div class="animate-pulse p-3 bg-gray-100 rounded-lg">
          <div class="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
          <div class="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      `).join('')}
    </div>
  `;

  sessionList.insertAdjacentHTML('beforeend', loadingHTML);
}

// 隐藏会话列表加载状态
function hideSessionsLoading() {
  const loading = document.getElementById('sessionsLoading');
  if (loading) {
    loading.remove();
  }
}

// 显示会话列表错误
function showSessionsError(message) {
  const sessionList = document.getElementById('sessionList');
  const emptyState = document.getElementById('emptyState');

  // 隐藏空状态
  emptyState.classList.add('hidden');

  // 显示错误信息
  const errorHTML = `
    <div id="sessionsError" class="flex flex-col items-center justify-center p-8 text-center">
      <svg class="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <p class="text-sm text-gray-600 mb-4">${message}</p>
      <button onclick="fetchSessions()" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
        重试
      </button>
    </div>
  `;

  sessionList.insertAdjacentHTML('beforeend', errorHTML);
}
```

#### 3.3 登录后自动获取会话
```javascript
// 修改 updateUIForLoginState 函数
function updateUIForLoginState(isLoggedIn, userInfo = null) {
  if (isLoggedIn && userInfo) {
    // ... 现有代码 ...

    // 显示侧边栏
    showSidebar();

    // 自动获取会话列表
    fetchSessions();
  } else {
    // ... 现有代码 ...
  }
}

// 修改 onLoginSuccess 函数
function onLoginSuccess() {
  console.log('登录成功');

  // 重新检查登录状态并获取会话
  checkAndUpdateLoginStatus();

  // ... 现有代码 ...
}

// 检查登录状态并更新 UI
async function checkAndUpdateLoginStatus() {
  try {
    const response = await fetch('/auth/session');
    const data = await response.json();

    if (data.authenticated) {
      updateUIForLoginState(true, {
        userId: data.userId,
        userName: data.userName,
        avatar: data.userInfo?.avatar,
      });
    } else {
      updateUIForLoginState(false);
    }
  } catch (error) {
    console.error('检查登录状态失败:', error);
  }
}
```

### 4. 刷新会话列表

**文件**: `public/js/chat.js`

```javascript
// 刷新会话列表 (在创建/删除会话后调用)
async function refreshSessions() {
  await fetchSessions();
}
```

## 测试清单

### 后端 API 测试
- [ ] 已登录用户可以获取会话列表
- [ ] 未登录用户返回 401 错误
- [ ] Coze API 调用成功
- [ ] 会话数据格式正确
- [ ] 错误情况返回正确的错误信息

### 前端功能测试
- [ ] 登录后自动获取会话列表
- [ ] 会话列表正确渲染
- [ ] 加载状态正确显示
- [ ] 错误状态正确显示
- [ ] 点击重试按钮重新获取

### 边界测试
- [ ] 空会话列表的处理
- [ ] 网络错误的处理
- [ ] Coze API 超时的处理
- [ ] Session 过期的处理

### 性能测试
- [ ] 大量会话 (>50个) 的渲染性能
- [ ] 并发请求的处理

## 依赖

**前置任务**:
- `stage2-task2-session-item-ui.md` - 会话条目 UI 设计

**后续任务**:
- `stage3-task2-create-session.md` - 创建新会话功能
- `stage3-task4-switch-session.md` - 切换会话功能

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 3.3 Coze API 集成
- [CLAUDE.md](../CLAUDE.md) - CozeSDKAdapter
- [Coze API 文档](https://www.coze.com/docs/developer_guides/coze_api_overview)
- Coze SDK: `@coze/api` v1.3.5

## 注意事项

1. **Coze API 能力确认**:
   - 确认 Coze API 是否支持根据用户 ID 获取会话列表
   - 确认返回的会话对象结构
   - 确认是否包含第一条消息

2. **性能优化**:
   - 如果会话很多,考虑分页加载
   - 缓存会话列表,避免频繁请求

3. **错误处理**:
   - Coze API 调用失败的重试机制
   - 友好的错误提示

4. **数据映射**:
   - Coze 会话 ID → 前端 sessionId
   - 会话元数据 → 前端显示格式

## 待确认事项

- [ ] Coze API 是否支持根据 userId 获取会话列表?
- [ ] Coze 返回的会话对象是否包含第一条用户消息?
- [ ] 如果不包含,是否需要额外调用 `messages.list()`?
- [ ] Coze API 是否有会话数量限制?
- [ ] 是否需要实现分页?

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 成功调用 Coze API 获取会话列表
4. 会话列表在前端正确显示
5. 提交信息格式: `feat(sessions): integrate Coze API for fetching conversations`
