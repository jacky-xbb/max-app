# Task: 完善加载状态和错误处理

**Stage**: 4 - 交互优化与错误处理
**Priority**: P0 (必须)
**Estimated Time**: 3-4 hours
**Status**: Not Started

---

## 目标

为所有异步操作添加统一的加载状态提示和错误处理,提升用户体验。

## 背景

当前各个功能的加载状态和错误处理不够完善,需要统一优化。

## 成功标准

- [ ] 所有异步操作都有清晰的加载状态提示
- [ ] 错误情况有友好的提示信息
- [ ] 加载状态使用统一的设计风格
- [ ] 支持骨架屏加载效果
- [ ] 网络错误有重试按钮

## 需要优化的场景

### 1. 会话列表加载
- 初次加载会话列表
- 刷新会话列表
- 加载失败的错误提示

### 2. 会话消息加载
- 切换会话加载历史消息
- 加载失败的错误提示

### 3. 会话操作
- 创建新会话
- 重命名会话
- 删除会话

### 4. 消息发送
- 发送消息中的状态
- 发送失败的重试

## 技术实现

### 1. 统一加载组件

**文件**: `public/js/loading.js` (新建)

#### 1.1 加载组件工具类
```javascript
// 加载状态管理工具
class LoadingManager {
  // 显示全屏加载
  static showFullLoading(message = '加载中...') {
    const existing = document.getElementById('fullLoading');
    if (existing) return;

    const loading = document.createElement('div');
    loading.id = 'fullLoading';
    loading.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    loading.innerHTML = `
      <div class="bg-white rounded-lg p-6 text-center">
        <svg class="animate-spin w-12 h-12 text-blue-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-gray-700">${message}</p>
      </div>
    `;
    document.body.appendChild(loading);
  }

  // 隐藏全屏加载
  static hideFullLoading() {
    const loading = document.getElementById('fullLoading');
    if (loading) {
      loading.remove();
    }
  }

  // 显示骨架屏
  static createSkeleton(count = 3) {
    return Array(count).fill(0).map(() => `
      <div class="animate-pulse p-3 bg-gray-100 rounded-lg mb-3">
        <div class="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
        <div class="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    `).join('');
  }

  // 显示内联加载
  static createInlineLoader(size = 'md') {
    const sizes = {
      sm: 'w-4 h-4',
      md: 'w-6 h-6',
      lg: 'w-8 h-8',
    };

    return `
      <svg class="animate-spin ${sizes[size]} text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    `;
  }

  // 显示错误状态
  static createError(message, onRetry) {
    const retryBtn = onRetry
      ? `<button class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors" onclick="(${onRetry.toString()})()">重试</button>`
      : '';

    return `
      <div class="flex flex-col items-center justify-center p-8 text-center">
        <svg class="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-sm text-gray-600 mb-2">${message}</p>
        ${retryBtn}
      </div>
    `;
  }

  // 显示空状态
  static createEmpty(message, icon = 'chat') {
    const icons = {
      chat: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>',
      folder: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>',
    };

    return `
      <div class="flex flex-col items-center justify-center h-full text-gray-400">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${icons[icon] || icons.chat}
        </svg>
        <p class="text-sm">${message}</p>
      </div>
    `;
  }
}

// 导出到全局
window.LoadingManager = LoadingManager;
```

### 2. 应用加载组件

**文件**: `public/js/chat.js`

#### 2.1 优化会话列表加载
```javascript
// 优化后的 fetchSessions 函数
async function fetchSessions() {
  const sessionList = document.getElementById('sessionList');
  const emptyState = document.getElementById('emptyState');

  try {
    // 显示骨架屏
    emptyState.classList.add('hidden');
    const existingItems = sessionList.querySelectorAll('.session-item');
    existingItems.forEach(item => item.remove());

    sessionList.innerHTML = LoadingManager.createSkeleton(3);

    const response = await fetch('/api/conversations', {
      method: 'GET',
      credentials: 'include',
    });

    if (response.status === 401) {
      console.log('未登录,无法获取会话列表');
      sessionList.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    // 清除骨架屏
    sessionList.innerHTML = '';

    if (result.success && result.data) {
      if (result.data.length === 0) {
        // 显示空状态
        emptyState.classList.remove('hidden');
      } else {
        renderSessionList(result.data);
      }
    } else {
      throw new Error(result.error || '获取会话列表失败');
    }
  } catch (error) {
    console.error('获取会话列表失败:', error);

    // 显示错误状态
    sessionList.innerHTML = LoadingManager.createError(
      '获取会话列表失败',
      fetchSessions
    );
  }
}
```

#### 2.2 优化消息加载
```javascript
// 优化后的 showMessagesLoading
function showMessagesLoading() {
  const chatContainer = document.getElementById('chatContainer');
  chatContainer.innerHTML = `
    <div class="flex items-center justify-center h-full">
      ${LoadingManager.createInlineLoader('lg')}
    </div>
  `;
}
```

#### 2.3 优化按钮加载状态
```javascript
// 按钮加载状态工具
class ButtonLoader {
  static setLoading(button, loadingText = '处理中...') {
    if (button.dataset.originalContent) return; // 已经在加载中

    button.dataset.originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `
      ${LoadingManager.createInlineLoader('sm')}
      <span class="ml-2">${loadingText}</span>
    `;
  }

  static reset(button) {
    if (!button.dataset.originalContent) return;

    button.disabled = false;
    button.innerHTML = button.dataset.originalContent;
    delete button.dataset.originalContent;
  }
}

window.ButtonLoader = ButtonLoader;

// 使用示例: 创建新会话
async function createNewSession() {
  const btn = document.getElementById('newSessionBtn');

  try {
    ButtonLoader.setLoading(btn, '创建中...');

    // API 调用...

    ButtonLoader.reset(btn);
  } catch (error) {
    ButtonLoader.reset(btn);
    showNotification('创建失败', 'error');
  }
}
```

### 3. 优化通知组件

**文件**: `public/js/notification.js` (新建)

```javascript
// 通知管理器
class NotificationManager {
  static show(message, type = 'success', duration = 3000) {
    // 移除现有通知
    const existing = document.getElementById('notification');
    if (existing) {
      existing.remove();
    }

    // 类型配置
    const config = {
      success: {
        bg: 'bg-green-500',
        icon: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>',
      },
      error: {
        bg: 'bg-red-500',
        icon: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>',
      },
      info: {
        bg: 'bg-blue-500',
        icon: '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>',
      },
      warning: {
        bg: 'bg-yellow-500',
        icon: '<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>',
      },
    };

    const typeConfig = config[type] || config.info;

    // 创建通知元素
    const notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = `
      fixed top-4 right-4 z-50
      px-6 py-3 rounded-lg shadow-lg
      ${typeConfig.bg} text-white
      flex items-center gap-3
      transition-all duration-300
      transform translate-x-0
    `;

    notification.innerHTML = `
      <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        ${typeConfig.icon}
      </svg>
      <span>${message}</span>
      <button class="ml-2 hover:bg-white hover:bg-opacity-20 rounded p-1 transition-colors" onclick="this.parentElement.remove()">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    `;

    document.body.appendChild(notification);

    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        notification.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }
  }
}

window.NotificationManager = NotificationManager;

// 兼容旧的 showNotification 函数
function showNotification(message, type = 'success') {
  NotificationManager.show(message, type);
}
```

### 4. HTML 引入新文件

**文件**: `public/chat.html`

```html
<!-- 在现有 script 标签前添加 -->
<script src="/js/loading.js"></script>
<script src="/js/notification.js"></script>
<script src="/js/chat.js"></script>
```

## 测试清单

### 加载状态测试
- [ ] 会话列表加载显示骨架屏
- [ ] 消息加载显示加载动画
- [ ] 按钮操作显示加载状态
- [ ] 加载完成后状态正确清除

### 错误处理测试
- [ ] 网络错误显示错误提示
- [ ] 错误提示包含重试按钮
- [ ] 点击重试按钮重新执行操作
- [ ] API 错误返回正确的错误信息

### 通知测试
- [ ] 成功通知显示绿色
- [ ] 错误通知显示红色
- [ ] 信息通知显示蓝色
- [ ] 警告通知显示黄色
- [ ] 通知自动消失
- [ ] 点击关闭按钮关闭通知

## 依赖

**前置任务**:
- 所有 Stage 3 的任务 (会话管理功能)

**后续任务**:
- `stage4-task2-tooltip-polish.md` - 完善 Tooltip 和交互细节

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 1.3.3 交互反馈
- Tailwind CSS Animation: https://tailwindcss.com/docs/animation

## 注意事项

1. **统一性**: 所有加载状态使用统一的设计和组件
2. **性能**: 避免不必要的 DOM 操作
3. **可访问性**: 加载状态添加 `aria-live` 属性
4. **用户体验**: 加载状态应该清晰但不突兀

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 所有异步操作都有加载状态
4. 错误情况都有友好提示
5. 提交信息格式: `feat(ux): improve loading states and error handling`
