# Task: 删除会话功能

**Stage**: 3 - 会话管理功能集成
**Priority**: P1 (重要)
**Estimated Time**: 3-4 hours
**Status**: Not Started

---

## 目标

实现删除会话功能,包括二次确认弹窗和会话数据清理。

## 背景

用户可以点击删除按钮删除不需要的会话,删除前需要二次确认。

## 成功标准

- [ ] 点击删除按钮弹出确认对话框
- [ ] 确认对话框提示"确认删除此会话?"
- [ ] 点击确认后删除会话
- [ ] 删除成功后会话从列表中移除
- [ ] 如果删除的是当前激活会话,自动切换到其他会话或清空聊天区域
- [ ] 显示删除成功提示

## UI 设计规格

### 确认对话框
```
┌─────────────────────────────────┐
│          确认删除               │
│                                 │
│  确认删除此会话?                 │
│  此操作无法撤销                  │
│                                 │
│  [ 取消 ]    [ 确认删除 ]       │
└─────────────────────────────────┘
```

## 技术实现

### 1. 后端 API 实现

**文件**: `server/routes/api.js`

#### 1.1 删除会话端点
```javascript
// 删除会话
router.delete('/api/conversations/:id', async (req, res) => {
  try {
    // 检查登录状态
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录' });
    }

    const conversationId = req.params.id;
    const userId = req.session.userId;

    // 调用 Coze API 删除会话
    await CozeSDKAdapter.deleteConversation(conversationId, userId);

    res.json({
      success: true,
      message: '会话已删除',
    });
  } catch (error) {
    console.error('删除会话失败:', error);
    res.status(500).json({
      error: '删除会话失败',
      message: error.message,
    });
  }
});
```

### 2. Coze SDK 适配器扩展

**文件**: `server/utils/cozeSDKAdapter.js`

#### 2.1 添加删除会话方法
```javascript
class CozeSDKAdapter {
  // 删除会话
  async deleteConversation(conversationId, userId) {
    try {
      // 生成 JWT token
      const token = await jwtService.generateUserToken(userId);

      // 初始化 Coze 客户端
      const coze = new CozeAPI({ token });

      // 调用 Coze API 删除会话
      // 注意: 根据 Coze API 文档,可能是 clear() 或 delete()
      await coze.conversations.clear({
        conversation_id: conversationId,
      });

      // 或者使用 delete (如果支持)
      // await coze.conversations.delete({
      //   conversation_id: conversationId,
      // });

      return true;
    } catch (error) {
      console.error('Coze API 删除会话失败:', error);
      throw new Error(`删除会话失败: ${error.message}`);
    }
  }
}

module.exports = new CozeSDKAdapter();
```

### 3. 前端实现

**文件**: `public/js/chat.js`

#### 3.1 确认删除对话框
```javascript
// 确认删除会话
function confirmDeleteSession(sessionId) {
  // 创建确认对话框
  const modal = document.createElement('div');
  modal.id = 'deleteConfirmModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
      <h3 class="text-lg font-bold text-gray-800 mb-4">确认删除</h3>
      <p class="text-gray-600 mb-2">确认删除此会话?</p>
      <p class="text-sm text-gray-500 mb-6">此操作无法撤销</p>

      <div class="flex justify-end gap-3">
        <button id="cancelDeleteBtn" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors">
          取消
        </button>
        <button id="confirmDeleteBtn" class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
          确认删除
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 取消按钮事件
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    modal.remove();
  });

  // 确认按钮事件
  document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    await deleteSession(sessionId);
    modal.remove();
  });

  // 点击遮罩关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}
```

#### 3.2 删除会话函数
```javascript
// 删除会话
async function deleteSession(sessionId) {
  try {
    // 调用 API 删除会话
    const response = await fetch(`/api/conversations/${sessionId}`, {
      method: 'DELETE',
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

    if (result.success) {
      // 删除成功
      showNotification('会话已删除', 'success');

      // 如果删除的是当前会话,需要切换
      if (currentSessionId === sessionId) {
        await handleDeleteCurrentSession(sessionId);
      }

      // 刷新会话列表
      await refreshSessions();
    } else {
      throw new Error(result.error || '删除失败');
    }
  } catch (error) {
    console.error('删除会话失败:', error);
    showNotification(`删除失败: ${error.message}`, 'error');
  }
}

// 处理删除当前会话
async function handleDeleteCurrentSession(deletedSessionId) {
  // 清空聊天区域
  clearChatMessages();

  // 重置当前会话 ID
  currentSessionId = null;

  // 获取其他会话
  const sessionItems = document.querySelectorAll('.session-item');
  const remainingSessions = Array.from(sessionItems)
    .filter(item => item.dataset.sessionId !== deletedSessionId);

  if (remainingSessions.length > 0) {
    // 切换到第一个会话
    const firstSession = remainingSessions[0];
    const firstSessionId = firstSession.dataset.sessionId;
    await switchSession(firstSessionId);
  } else {
    // 没有其他会话,显示空状态
    console.log('没有更多会话');
  }
}
```

#### 3.3 修改会话条目渲染
```javascript
// 修改 renderSessionItem 函数,添加删除按钮事件
function renderSessionItem(session) {
  // ... 现有代码 ...

  // 删除按钮事件
  const deleteBtn = div.querySelector('.delete-session-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDeleteSession(session.id);
  });

  // ... 现有代码 ...

  return div;
}
```

### 4. 优化确认对话框样式

**文件**: `public/css/input.css`

```css
/* 确认对话框动画 */
#deleteConfirmModal {
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

#deleteConfirmModal > div {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

## 测试清单

### 功能测试
- [ ] 点击删除按钮弹出确认对话框
- [ ] 点击取消关闭对话框
- [ ] 点击确认删除会话
- [ ] 删除成功后会话从列表移除
- [ ] 删除当前会话后自动切换到其他会话
- [ ] 删除最后一个会话后显示空状态

### UI/UX 测试
- [ ] 确认对话框居中显示
- [ ] 确认对话框有淡入动画
- [ ] 点击遮罩关闭对话框
- [ ] 删除成功显示提示

### 边界测试
- [ ] 删除不存在的会话的处理
- [ ] 网络错误的处理
- [ ] 快速连续删除的处理
- [ ] 删除时会话正在加载的处理

## 依赖

**前置任务**:
- `stage3-task1-fetch-sessions.md` - 获取会话列表 API
- `stage3-task4-switch-session.md` - 切换会话功能

**后续任务**:
- `stage4-task1-loading-states.md` - 完善加载状态

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 1.2.2 会话操作, 1.3.3 交互反馈
- [Coze API 文档](https://www.coze.com/docs/developer_guides/coze_api_overview)

## 注意事项

1. **二次确认**: 必须有确认对话框,防止误删除
2. **当前会话处理**: 删除当前会话后需要切换到其他会话
3. **最后一个会话**: 删除最后一个会话后显示空状态
4. **事件冒泡**: 删除按钮使用 `event.stopPropagation()`

## 待确认事项

- [ ] Coze API 使用 `clear()` 还是 `delete()` 方法?
- [ ] 删除会话是否真的删除,还是只清空消息?

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 成功调用 Coze API 删除会话
4. 删除后会话列表正确更新
5. 提交信息格式: `feat(sessions): implement delete conversation`
