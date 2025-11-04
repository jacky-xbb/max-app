# Task: 实现会话条目 UI 设计

**Stage**: 2 - 侧边栏 UI 与基础布局
**Priority**: P0 (必须)
**Estimated Time**: 3-4 hours
**Status**: Not Started

---

## 目标

设计和实现会话列表条目的 UI,包括会话标题、时间戳、编辑/删除按钮和交互效果。

## 背景

侧边栏需要展示用户的历史会话列表,每个会话条目需要清晰展示信息并提供操作按钮。

## 成功标准

- [ ] 会话条目显示会话标题(第一条用户消息)
- [ ] 会话条目显示最后活跃时间
- [ ] 会话标题最多显示 30 个字符,超出显示省略号
- [ ] 鼠标悬停显示完整标题(tooltip)
- [ ] 编辑和删除按钮鼠标悬停时显示(移动端始终显示)
- [ ] 当前激活会话高亮显示
- [ ] 会话列表按时间倒序排列

## UI 设计规格

### 会话条目结构
```
┌─────────────────────────────────────────┐
│ [📝] 会话标题(第一条用户消息)   │ [✏️] [🗑️]
│      最后活跃时间                   │
└─────────────────────────────────────────┘
```

### 状态变化
- **默认状态**: 白色背景
- **悬停状态**: 浅灰色背景,显示编辑/删除按钮
- **激活状态**: 蓝色背景,白色文字

## 技术实现

### 1. HTML 结构

**文件**: `public/chat.html`

**会话条目模板** (在 sessionList 中):
```html
<!-- 单个会话条目 -->
<div class="session-item group relative p-3 mb-2 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors" data-session-id="session_123">
  <!-- 主内容区域 -->
  <div class="flex items-start gap-3">
    <!-- 会话图标 -->
    <div class="flex-shrink-0 mt-1">
      <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
    </div>

    <!-- 会话信息 -->
    <div class="flex-1 min-w-0">
      <!-- 会话标题 -->
      <h3 class="session-title text-sm font-medium text-gray-800 truncate" title="完整会话标题">
        会话标题(最多30字符)
      </h3>

      <!-- 最后活跃时间 -->
      <p class="session-time text-xs text-gray-500 mt-1">
        2小时前
      </p>
    </div>

    <!-- 操作按钮 (默认隐藏,悬停显示) -->
    <div class="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
      <!-- 编辑按钮 -->
      <button class="edit-session-btn p-1.5 hover:bg-gray-200 rounded transition-colors" title="重命名">
        <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
      </button>

      <!-- 删除按钮 -->
      <button class="delete-session-btn p-1.5 hover:bg-red-100 rounded transition-colors" title="删除">
        <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </button>
    </div>
  </div>
</div>

<!-- 激活状态的会话条目 -->
<div class="session-item active bg-blue-500 text-white ...">
  <!-- 图标和文字颜色改为白色 -->
</div>
```

### 2. JavaScript 实现

**文件**: `public/js/chat.js`

#### 2.1 会话条目渲染函数
```javascript
// 渲染会话条目
function renderSessionItem(session) {
  const div = document.createElement('div');
  div.className = 'session-item group relative p-3 mb-2 rounded-lg cursor-pointer transition-colors';
  div.dataset.sessionId = session.id;

  // 判断是否为激活会话
  const isActive = session.id === currentSessionId;
  if (isActive) {
    div.classList.add('active', 'bg-blue-500', 'text-white');
  } else {
    div.classList.add('hover:bg-gray-100');
  }

  // 会话标题 (最多30字符)
  const title = session.title || session.firstMessage || '新会话';
  const truncatedTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;

  // 时间格式化
  const timeText = formatSessionTime(session.lastActiveTime);

  div.innerHTML = `
    <div class="flex items-start gap-3">
      <!-- 图标 -->
      <div class="flex-shrink-0 mt-1">
        <svg class="w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
      </div>

      <!-- 信息 -->
      <div class="flex-1 min-w-0">
        <h3 class="session-title text-sm font-medium ${isActive ? 'text-white' : 'text-gray-800'} truncate" title="${title}">
          ${truncatedTitle}
        </h3>
        <p class="session-time text-xs ${isActive ? 'text-blue-100' : 'text-gray-500'} mt-1">
          ${timeText}
        </p>
      </div>

      <!-- 操作按钮 -->
      <div class="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        <button class="edit-session-btn p-1.5 hover:bg-gray-200 rounded transition-colors" title="重命名" onclick="event.stopPropagation(); editSession('${session.id}')">
          <svg class="w-4 h-4 ${isActive ? 'text-white' : 'text-gray-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button class="delete-session-btn p-1.5 hover:bg-red-100 rounded transition-colors" title="删除" onclick="event.stopPropagation(); confirmDeleteSession('${session.id}')">
          <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // 点击会话条目切换会话
  div.addEventListener('click', () => {
    switchSession(session.id);
  });

  return div;
}
```

#### 2.2 时间格式化工具
```javascript
// 格式化会话时间
function formatSessionTime(timestamp) {
  if (!timestamp) return '刚刚';

  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  // 超过 7 天显示具体日期
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
```

#### 2.3 会话列表渲染
```javascript
// 渲染会话列表
function renderSessionList(sessions) {
  const sessionList = document.getElementById('sessionList');
  const emptyState = document.getElementById('emptyState');

  if (!sessions || sessions.length === 0) {
    // 显示空状态
    emptyState.classList.remove('hidden');
    // 清空会话条目
    const existingItems = sessionList.querySelectorAll('.session-item');
    existingItems.forEach(item => item.remove());
    return;
  }

  // 隐藏空状态
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
  });
}
```

#### 2.4 占位函数 (Stage 3 实现)
```javascript
// 当前会话 ID
let currentSessionId = null;

// 切换会话 (Stage 3 实现)
function switchSession(sessionId) {
  console.log('切换到会话:', sessionId);
  currentSessionId = sessionId;
  // TODO: Stage 3 实现
  // - 加载会话历史消息
  // - 更新 UI 状态
  // - 关闭移动端侧边栏
}

// 编辑会话 (Stage 3 实现)
function editSession(sessionId) {
  console.log('编辑会话:', sessionId);
  // TODO: Stage 3 实现
}

// 确认删除会话 (Stage 3 实现)
function confirmDeleteSession(sessionId) {
  console.log('删除会话:', sessionId);
  // TODO: Stage 3 实现
}
```

### 3. 样式调整

**文件**: `public/css/input.css`

```css
/* 会话条目激活状态 */
.session-item.active {
  background-color: #3b82f6; /* blue-500 */
  color: white;
}

/* 移动端操作按钮始终显示 */
@media (max-width: 1023px) {
  .session-item .opacity-0 {
    opacity: 1 !important;
  }
}

/* 标题截断 */
.session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 确保 tooltip 显示 */
.session-title[title] {
  cursor: help;
}
```

### 4. 测试数据

**用于开发调试**:
```javascript
// 模拟会话数据 (开发时使用)
const mockSessions = [
  {
    id: 'session_1',
    title: '如何使用 Tailwind CSS 创建响应式布局',
    firstMessage: '如何使用 Tailwind CSS 创建响应式布局',
    lastActiveTime: new Date(Date.now() - 3600000).toISOString(), // 1小时前
  },
  {
    id: 'session_2',
    title: 'JavaScript 异步编程最佳实践',
    firstMessage: 'JavaScript 异步编程最佳实践',
    lastActiveTime: new Date(Date.now() - 7200000).toISOString(), // 2小时前
  },
  {
    id: 'session_3',
    title: '这是一个很长很长很长很长很长很长的会话标题用于测试截断效果',
    firstMessage: '这是一个很长很长很长很长很长很长的会话标题用于测试截断效果',
    lastActiveTime: new Date(Date.now() - 86400000).toISOString(), // 1天前
  },
];

// 测试渲染
// renderSessionList(mockSessions);
```

## 测试清单

### UI 测试
- [ ] 会话标题正确显示
- [ ] 标题超过30字符显示省略号
- [ ] 鼠标悬停显示完整标题
- [ ] 时间格式化正确 (刚刚/分钟/小时/天/日期)
- [ ] 激活会话高亮显示
- [ ] 桌面端悬停显示操作按钮
- [ ] 移动端操作按钮始终显示

### 交互测试
- [ ] 点击会话条目触发切换
- [ ] 点击编辑按钮不触发切换
- [ ] 点击删除按钮不触发切换
- [ ] 会话列表滚动正常

### 响应式测试
- [ ] 桌面端布局正确
- [ ] 移动端布局正确
- [ ] 不同屏幕尺寸下显示正常

## 依赖

**前置任务**:
- `stage2-task1-sidebar-layout.md` - 侧边栏布局

**后续任务**:
- `stage3-task1-fetch-sessions.md` - 获取会话列表 API 集成
- `stage3-task3-rename-session.md` - 重命名会话功能

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 1.3.2 会话条目设计
- Tailwind CSS Truncate: https://tailwindcss.com/docs/text-overflow
- CSS Group Hover: https://tailwindcss.com/docs/hover-focus-and-other-states#styling-based-on-parent-state

## 注意事项

1. **事件冒泡**: 编辑/删除按钮使用 `event.stopPropagation()` 防止触发会话切换
2. **性能**: 大量会话时考虑虚拟滚动 (可选)
3. **可访问性**:
   - 为按钮添加 `aria-label`
   - 使用语义化的 HTML
4. **移动端体验**: 操作按钮始终可见

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 使用模拟数据测试 UI 正确
4. 提交信息格式: `feat(ui): add session item UI design`
