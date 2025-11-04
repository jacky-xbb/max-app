# Task: 实现侧边栏布局和响应式设计

**Stage**: 2 - 侧边栏 UI 与基础布局
**Priority**: P0 (必须)
**Estimated Time**: 4-5 hours
**Status**: Not Started

---

## 目标

实现侧边栏的 UI 结构和响应式布局,支持桌面端固定显示和移动端抽屉式展开/收起。

## 背景

会话管理功能需要一个侧边栏来展示历史会话列表。侧边栏需要适配不同屏幕尺寸。

## 成功标准

- [ ] 桌面端侧边栏固定在左侧,宽度约 280px
- [ ] 移动端侧边栏默认隐藏,通过汉堡菜单按钮展开
- [ ] 移动端侧边栏以抽屉式覆盖在聊天界面上
- [ ] 侧边栏包含顶部"新建会话"按钮
- [ ] 侧边栏包含会话列表容器(空状态提示)
- [ ] 展开/收起动画流畅

## UI 设计规格

### 桌面端布局
```
┌────────────────────────────────────────┐
│ ┌─────────┐ ┌─────────────────────────┐│
│ │         │ │                         ││
│ │ Sidebar │ │   Chat Area             ││
│ │ (280px) │ │                         ││
│ │         │ │                         ││
│ └─────────┘ └─────────────────────────┘│
└────────────────────────────────────────┘
```

### 移动端布局
```
未展开:                      展开:
┌──────────────────┐        ┌──────────────────┐
│ ☰ Chat Area      │        │ ┌─────────┐      │
│                  │        │ │Sidebar  │ Chat │
│                  │        │ │(overlay)│ Area │
│                  │        │ └─────────┘      │
└──────────────────┘        └──────────────────┘
```

### 侧边栏结构
```html
<aside id="sidebar">
  <!-- 顶部按钮 -->
  <header>
    <button id="newSessionBtn">+ 新建会话</button>
  </header>

  <!-- 会话列表 -->
  <div id="sessionList">
    <!-- 空状态 -->
    <div class="empty-state">
      <p>暂无会话</p>
    </div>

    <!-- 会话条目 (Stage 3 实现) -->
  </div>
</aside>

<!-- 移动端汉堡菜单按钮 -->
<button id="mobileMenuBtn" class="mobile-only">☰</button>

<!-- 移动端遮罩 -->
<div id="sidebarOverlay" class="mobile-only"></div>
```

## 技术实现

### 1. HTML 结构

**文件**: `public/chat.html`

**修改整体布局**:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <!-- 现有 head 内容 -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- ... -->
</head>
<body class="bg-gray-50">
  <!-- 移动端汉堡菜单按钮 -->
  <button id="mobileMenuBtn" class="fixed top-4 left-4 z-50 lg:hidden bg-white p-2 rounded-lg shadow-lg">
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  </button>

  <!-- 主容器 -->
  <div class="flex h-screen overflow-hidden">
    <!-- 侧边栏 -->
    <aside id="sidebar" class="
      fixed lg:static
      inset-y-0 left-0
      z-40
      w-[280px]
      bg-white border-r border-gray-200
      transform -translate-x-full lg:translate-x-0
      transition-transform duration-300 ease-in-out
      flex flex-col
    ">
      <!-- 顶部: 新建会话按钮 -->
      <header class="p-4 border-b border-gray-200">
        <button id="newSessionBtn" class="
          w-full
          px-4 py-3
          bg-blue-500 hover:bg-blue-600
          text-white font-medium
          rounded-lg
          flex items-center justify-center gap-2
          transition-colors
        ">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          <span>新建会话</span>
        </button>
      </header>

      <!-- 会话列表容器 -->
      <div id="sessionList" class="flex-1 overflow-y-auto p-4">
        <!-- 空状态 -->
        <div id="emptyState" class="flex flex-col items-center justify-center h-full text-gray-400">
          <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          <p class="text-sm">暂无会话</p>
          <p class="text-xs mt-1">点击上方按钮创建新会话</p>
        </div>

        <!-- 会话条目将在 Stage 3 添加 -->
      </div>
    </aside>

    <!-- 移动端遮罩 -->
    <div id="sidebarOverlay" class="
      fixed inset-0
      bg-black bg-opacity-50
      z-30
      lg:hidden
      hidden
      transition-opacity duration-300
    "></div>

    <!-- 聊天主区域 -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- 现有的聊天界面内容 -->
      <div id="chatContainer" class="flex-1 overflow-y-auto p-4">
        <!-- 聊天消息 -->
      </div>

      <!-- 输入区域 -->
      <div class="border-t border-gray-200 p-4">
        <!-- 现有的输入框 -->
      </div>
    </main>
  </div>

  <!-- 用户信息 (Stage 1 实现) -->
  <div id="userInfoContainer" class="fixed bottom-4 left-4 lg:left-[300px] z-40">
    <!-- ... -->
  </div>

  <!-- 登录模态框 (Stage 1 实现) -->
  <!-- ... -->

  <script src="/js/chat.js"></script>
</body>
</html>
```

### 2. JavaScript 实现

**文件**: `public/js/chat.js`

#### 2.1 侧边栏控制
```javascript
// DOM 元素引用
let sidebar;
let sidebarOverlay;
let mobileMenuBtn;

// 初始化侧边栏
function initSidebar() {
  sidebar = document.getElementById('sidebar');
  sidebarOverlay = document.getElementById('sidebarOverlay');
  mobileMenuBtn = document.getElementById('mobileMenuBtn');

  // 移动端菜单按钮事件
  mobileMenuBtn.addEventListener('click', toggleSidebar);

  // 遮罩点击关闭侧边栏
  sidebarOverlay.addEventListener('click', closeSidebar);

  // 窗口大小改变时处理
  window.addEventListener('resize', handleResize);
}

// 切换侧边栏
function toggleSidebar() {
  const isOpen = !sidebar.classList.contains('-translate-x-full');

  if (isOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// 打开侧边栏
function openSidebar() {
  sidebar.classList.remove('-translate-x-full');
  sidebarOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // 防止背景滚动
}

// 关闭侧边栏
function closeSidebar() {
  sidebar.classList.add('-translate-x-full');
  sidebarOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

// 显示侧边栏 (登录后调用)
function showSidebar() {
  sidebar.classList.remove('hidden');

  // 桌面端自动打开
  if (window.innerWidth >= 1024) {
    sidebar.classList.remove('-translate-x-full');
  }
}

// 隐藏侧边栏 (登出后调用)
function hideSidebar() {
  closeSidebar();
  sidebar.classList.add('hidden');
}

// 处理窗口大小改变
function handleResize() {
  if (window.innerWidth >= 1024) {
    // 桌面端: 自动打开侧边栏,隐藏遮罩
    if (!sidebar.classList.contains('hidden')) {
      sidebar.classList.remove('-translate-x-full');
      sidebarOverlay.classList.add('hidden');
      document.body.style.overflow = '';
    }
  } else {
    // 移动端: 保持当前状态
    // 可选: 自动关闭侧边栏
    // closeSidebar();
  }
}
```

#### 2.2 集成到登录状态管理
```javascript
// 修改 updateUIForLoginState 函数
function updateUIForLoginState(isLoggedIn, userInfo = null) {
  if (isLoggedIn && userInfo) {
    // 显示用户信息
    loginButton.classList.add('hidden');
    document.getElementById('userInfo').classList.remove('hidden');

    // 更新用户名和头像
    document.getElementById('userName').textContent = userInfo.userName || userInfo.userId;
    document.getElementById('userAvatar').src = userInfo.avatar || '/img/default-avatar.png';

    // 显示侧边栏
    showSidebar();
  } else {
    // 显示登录按钮
    loginButton.classList.remove('hidden');
    document.getElementById('userInfo').classList.add('hidden');

    // 隐藏侧边栏
    hideSidebar();
  }
}
```

#### 2.3 新建会话按钮 (占位)
```javascript
// 新建会话按钮事件 (Stage 3 实现具体逻辑)
document.getElementById('newSessionBtn').addEventListener('click', () => {
  console.log('创建新会话');
  // TODO: Stage 3 实现
  // createNewSession();
});
```

### 3. 响应式样式

**文件**: `public/css/input.css`

**Tailwind 配置调整** (如需自定义断点):
```css
/* 确保 Tailwind 配置包含正确的断点 */
/* tailwind.config.js 中应有:
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
    }
  }
*/

/* 侧边栏滚动条样式 */
#sessionList::-webkit-scrollbar {
  width: 6px;
}

#sessionList::-webkit-scrollbar-track {
  background: #f1f1f1;
}

#sessionList::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

#sessionList::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* 确保侧边栏在移动端覆盖整个高度 */
#sidebar {
  height: 100vh;
  height: 100dvh; /* 动态视口高度,适配移动端 */
}
```

### 4. 用户信息位置调整

**注意**: 用户信息区域需要根据侧边栏状态调整位置

```html
<!-- 调整 userInfoContainer 位置 -->
<div id="userInfoContainer" class="
  fixed bottom-4 left-4
  lg:left-[300px]  /* 桌面端在侧边栏右侧 */
  z-40
  transition-all duration-300
">
  <!-- ... -->
</div>
```

## 测试清单

### 桌面端测试
- [ ] 侧边栏固定在左侧
- [ ] 侧边栏宽度为 280px
- [ ] 侧边栏不遮挡聊天区域
- [ ] 用户信息区域位置正确
- [ ] 滚动条样式正确

### 移动端测试
- [ ] 侧边栏默认隐藏
- [ ] 点击汉堡菜单按钮展开侧边栏
- [ ] 侧边栏覆盖在聊天界面上
- [ ] 点击遮罩关闭侧边栏
- [ ] 展开/收起动画流畅

### 响应式测试
- [ ] 在不同屏幕尺寸下布局正确
- [ ] 断点切换时行为正确
- [ ] 窗口大小改变时适配正确

### 登录状态集成测试
- [ ] 未登录时侧边栏隐藏
- [ ] 登录后侧边栏显示
- [ ] 登出后侧边栏隐藏

## 依赖

**前置任务**:
- `stage1-task3-logout-feature.md` - 登出功能 (需要集成侧边栏显示/隐藏)

**后续任务**:
- `stage2-task2-session-item-ui.md` - 会话条目 UI 设计

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 1.3.1 侧边栏布局
- Tailwind CSS Responsive Design: https://tailwindcss.com/docs/responsive-design
- CSS Flexbox: https://css-tricks.com/snippets/css/a-guide-to-flexbox/

## 注意事项

1. **移动端优先**: 确保在小屏幕上体验良好
2. **性能**: 避免不必要的重绘和重排
3. **可访问性**:
   - 汉堡菜单按钮添加 `aria-label`
   - 侧边栏添加 `aria-hidden` 属性
4. **动画流畅**: 使用 CSS transform 而非 left/right

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 在桌面端和移动端测试正常
4. CSS build 成功: `npm run build`
5. 提交信息格式: `feat(ui): add sidebar layout and responsive design`
