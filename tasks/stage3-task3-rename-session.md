# Task: 重命名会话功能

**Stage**: 3 - 会话管理功能集成
**Priority**: P1 (重要)
**Estimated Time**: 4-5 hours
**Status**: Not Started

---

## 目标

实现会话重命名功能,允许用户自定义会话标题。

## 背景

用户可以点击编辑按钮修改会话标题,提供更个性化的会话管理体验。

## 成功标准

- [ ] 点击编辑按钮后会话标题变为可编辑输入框
- [ ] 输入框自动获得焦点并选中文本
- [ ] 按回车或失去焦点时保存修改
- [ ] 按 ESC 键取消编辑
- [ ] 输入为空时提示"会话名称不能为空"并恢复原标题
- [ ] 保存成功后显示提示"重命名成功"
- [ ] 会话列表实时更新

## UI 设计规格

### 编辑状态
```
┌─────────────────────────────────────────┐
│ [📝] [_____输入框______]        │ [✓] [✗]
└─────────────────────────────────────────┘
```

## 技术实现

### 1. 后端 API 实现

**文件**: `server/routes/api.js`

#### 1.1 更新会话端点
```javascript
// 更新会话信息 (重命名)
router.patch('/api/conversations/:id', async (req, res) => {
  try {
    // 检查登录状态
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const conversationId = req.params.id;
    const { title } = req.body;

    // 验证标题
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: '会话名称不能为空' });
    }

    if (title.length > 100) {
      return res.status(400).json({ error: '会话名称过长(最多100字符)' });
    }

    const userId = req.session.userId;

    // 调用 Coze API 更新会话
    const conversation = await CozeSDKAdapter.updateConversation(
      conversationId,
      userId,
      { title: title.trim() }
    );

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error('更新会话失败:', error);
    res.status(500).json({
      error: '更新会话失败',
      message: error.message,
    });
  }
});
```

### 2. Coze SDK 适配器扩展

**文件**: `server/utils/cozeSDKAdapter.js`

#### 2.1 添加更新会话方法
```javascript
class CozeSDKAdapter {
  // 更新会话信息
  async updateConversation(conversationId, userId, updates) {
    try {
      // 生成 JWT token
      const token = await jwtService.generateUserToken(userId);

      // 初始化 Coze 客户端
      const coze = new CozeAPI({ token });

      // 调用 Coze API 更新会话
      const response = await coze.conversations.update({
        conversation_id: conversationId,
        meta_data: {
          title: updates.title,
        },
        // 其他可能的更新字段...
      });

      const conversation = response.data;

      // 转换为前端需要的格式
      return {
        id: conversation.conversation_id || conversation.id,
        title: conversation.meta_data?.title || updates.title,
        lastActiveTime: conversation.updated_at || new Date().toISOString(),
      };
    } catch (error) {
      console.error('Coze API 更新会话失败:', error);
      throw new Error(`更新会话失败: ${error.message}`);
    }
  }
}

module.exports = new CozeSDKAdapter();
```

### 3. 前端实现

**文件**: `public/js/chat.js`

#### 3.1 编辑会话函数
```javascript
// 当前正在编辑的会话 ID
let editingSessionId = null;

// 编辑会话
function editSession(sessionId) {
  // 如果已经在编辑其他会话,先取消
  if (editingSessionId && editingSessionId !== sessionId) {
    cancelEditSession(editingSessionId);
  }

  editingSessionId = sessionId;

  // 查找会话条目
  const sessionItem = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (!sessionItem) return;

  const titleElement = sessionItem.querySelector('.session-title');
  const originalTitle = titleElement.textContent.trim();

  // 创建输入框
  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalTitle;
  input.className = 'session-title-input w-full px-2 py-1 text-sm font-medium bg-white border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500';

  // 替换标题元素
  titleElement.replaceWith(input);

  // 自动获得焦点并选中文本
  input.focus();
  input.select();

  // 按回车保存
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveSessionTitle(sessionId, input.value, originalTitle);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditSession(sessionId, originalTitle);
    }
  });

  // 失去焦点时保存
  input.addEventListener('blur', async () => {
    // 延迟执行,避免与其他事件冲突
    setTimeout(async () => {
      if (editingSessionId === sessionId) {
        await saveSessionTitle(sessionId, input.value, originalTitle);
      }
    }, 100);
  });
}

// 保存会话标题
async function saveSessionTitle(sessionId, newTitle, originalTitle) {
  const sessionItem = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (!sessionItem) return;

  const input = sessionItem.querySelector('.session-title-input');
  if (!input) return;

  const trimmedTitle = newTitle.trim();

  // 验证标题
  if (!trimmedTitle) {
    showNotification('会话名称不能为空', 'error');
    cancelEditSession(sessionId, originalTitle);
    return;
  }

  if (trimmedTitle === originalTitle) {
    // 没有修改,直接取消编辑
    cancelEditSession(sessionId, originalTitle);
    return;
  }

  try {
    // 显示保存中状态
    input.disabled = true;
    input.classList.add('opacity-50');

    // 调用 API 更新会话
    const response = await fetch(`/api/conversations/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ title: trimmedTitle }),
    });

    if (response.status === 401) {
      showLoginModal();
      return;
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '更新失败');
    }

    const result = await response.json();

    if (result.success) {
      // 更新成功,替换回标题元素
      const newTitleElement = document.createElement('h3');
      newTitleElement.className = 'session-title text-sm font-medium text-gray-800 truncate';
      newTitleElement.textContent = trimmedTitle;
      newTitleElement.title = trimmedTitle;

      input.replaceWith(newTitleElement);

      editingSessionId = null;

      showNotification('重命名成功', 'success');

      // 刷新会话列表 (可选,确保数据同步)
      // await refreshSessions();
    } else {
      throw new Error(result.error || '更新失败');
    }
  } catch (error) {
    console.error('保存会话标题失败:', error);
    showNotification(`重命名失败: ${error.message}`, 'error');

    // 恢复原标题
    cancelEditSession(sessionId, originalTitle);
  }
}

// 取消编辑会话
function cancelEditSession(sessionId, originalTitle) {
  const sessionItem = document.querySelector(`[data-session-id="${sessionId}"]`);
  if (!sessionItem) return;

  const input = sessionItem.querySelector('.session-title-input');
  if (!input) return;

  // 创建标题元素
  const titleElement = document.createElement('h3');
  titleElement.className = 'session-title text-sm font-medium text-gray-800 truncate';
  titleElement.textContent = originalTitle;
  titleElement.title = originalTitle;

  // 替换输入框
  input.replaceWith(titleElement);

  editingSessionId = null;
}
```

#### 3.2 修改会话条目渲染
```javascript
// 修改 renderSessionItem 函数,添加编辑按钮事件
function renderSessionItem(session) {
  // ... 现有代码 ...

  // 编辑按钮事件
  const editBtn = div.querySelector('.edit-session-btn');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    editSession(session.id);
  });

  // ... 现有代码 ...

  return div;
}
```

### 4. 样式优化

**文件**: `public/css/input.css`

```css
/* 编辑输入框样式 */
.session-title-input {
  /* 确保输入框大小与标题一致 */
  font-family: inherit;
  line-height: inherit;
}

.session-title-input:focus {
  outline: none;
  border-color: #3b82f6;
  ring: 2px solid rgba(59, 130, 246, 0.5);
}
```

## 测试清单

### 功能测试
- [ ] 点击编辑按钮进入编辑模式
- [ ] 输入框自动获得焦点
- [ ] 输入框文本自动选中
- [ ] 按回车保存修改
- [ ] 失去焦点时保存修改
- [ ] 按 ESC 取消编辑
- [ ] 输入为空时提示错误并恢复原标题
- [ ] 保存成功后显示提示

### UI/UX 测试
- [ ] 输入框样式正确
- [ ] 编辑状态视觉反馈清晰
- [ ] 保存过程显示加载状态
- [ ] 成功/失败提示清晰

### 边界测试
- [ ] 标题过长的处理 (>100字符)
- [ ] 标题为空的处理
- [ ] 网络错误的处理
- [ ] 同时编辑多个会话的处理
- [ ] 快速切换编辑的处理

## 依赖

**前置任务**:
- `stage3-task1-fetch-sessions.md` - 获取会话列表 API
- `stage2-task2-session-item-ui.md` - 会话条目 UI

**后续任务**:
- `stage3-task5-delete-session.md` - 删除会话功能

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 1.2.2 会话操作, 1.3.3 交互反馈
- [Coze API 文档](https://www.coze.com/docs/developer_guides/coze_api_overview)

## 注意事项

1. **防止事件冲突**: 编辑按钮使用 `event.stopPropagation()` 防止触发会话切换
2. **输入验证**: 前后端都需要验证标题不为空和长度限制
3. **用户体验**:
   - 自动选中文本方便快速修改
   - ESC 键提供快速取消方式
4. **数据同步**: 保存成功后可选择性刷新会话列表

## 待确认事项

- [x] Coze API 是否支持更新会话的标题/名称? **已确认:支持**
- [ ] 如果不支持,是否需要在后端数据库存储自定义标题?

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 成功调用 Coze API 更新会话
4. 重命名后会话列表正确显示新标题
5. 提交信息格式: `feat(sessions): implement rename conversation`
