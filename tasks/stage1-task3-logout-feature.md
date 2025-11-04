# Task: 实现登出功能

**Stage**: 1 - 登录页面与登出功能
**Priority**: P0 (必须)
**Estimated Time**: 2-3 hours
**Status**: Not Started

---

## 目标

实现用户登出功能,包括用户信息展示、登出按钮、登出逻辑和状态清理。

## 背景

已登录用户需要能够显式登出,清除所有认证信息和会话数据。

## 成功标准

- [ ] 左下角显示用户信息(已登录)或登录按钮(未登录)
- [ ] 点击用户信息弹出菜单,包含"登出"选项
- [ ] 点击登出清除前端和后端的所有认证信息
- [ ] 登出后 UI 更新为未登录状态
- [ ] 登出后侧边栏隐藏或显示空状态

## UI 设计规格

### 用户信息区域
```html
<!-- 左下角固定位置 -->
<div class="user-info-container">
  <!-- 未登录状态 -->
  <button id="loginButton" class="login-btn">
    <svg><!-- 登录图标 --></svg>
    <span>登录</span>
  </button>

  <!-- 已登录状态 -->
  <div id="userInfo" class="user-info">
    <img src="avatar_url" alt="用户头像" class="user-avatar">
    <span class="user-name">用户名</span>
    <svg><!-- 下拉箭头 --></svg>
  </div>
</div>

<!-- 用户菜单 (弹出) -->
<div id="userMenu" class="user-menu hidden">
  <button id="logoutBtn" class="menu-item">
    <svg><!-- 登出图标 --></svg>
    <span>登出</span>
  </button>
</div>
```

### 样式要求
- 位置: 固定在左下角
- 已登录: 显示用户名和头像
- 未登录: 显示"登录"文字和图标
- 菜单: 点击用户信息弹出,点击外部关闭

## 技术实现

### 1. HTML 结构

**文件**: `public/chat.html`

**新增用户信息区域**:
```html
<!-- 在聊天界面底部左侧添加 -->
<div id="userInfoContainer" class="fixed bottom-4 left-4 z-40">
  <!-- 未登录状态 -->
  <button id="loginButton" class="hidden px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
    </svg>
    <span>登录</span>
  </button>

  <!-- 已登录状态 -->
  <div id="userInfo" class="hidden relative">
    <button id="userInfoBtn" class="px-4 py-2 bg-white border border-gray-300 rounded-lg flex items-center gap-3 hover:bg-gray-50">
      <img id="userAvatar" src="" alt="头像" class="w-8 h-8 rounded-full">
      <span id="userName" class="text-gray-800 font-medium"></span>
      <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
      </svg>
    </button>

    <!-- 用户菜单 -->
    <div id="userMenu" class="hidden absolute bottom-full mb-2 left-0 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px]">
      <button id="logoutBtn" class="w-full px-4 py-3 text-left hover:bg-gray-100 flex items-center gap-3 text-gray-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
        <span>登出</span>
      </button>
    </div>
  </div>
</div>
```

### 2. JavaScript 实现

**文件**: `public/js/chat.js`

#### 2.1 初始化用户信息组件
```javascript
// DOM 元素引用
let loginButton;
let userInfo;
let userInfoBtn;
let userMenu;
let logoutBtn;
let userAvatar;
let userName;

// 初始化用户信息组件
function initUserInfo() {
  loginButton = document.getElementById('loginButton');
  userInfo = document.getElementById('userInfo');
  userInfoBtn = document.getElementById('userInfoBtn');
  userMenu = document.getElementById('userMenu');
  logoutBtn = document.getElementById('logoutBtn');
  userAvatar = document.getElementById('userAvatar');
  userName = document.getElementById('userName');

  // 登录按钮点击事件
  loginButton.addEventListener('click', showLoginModal);

  // 用户信息按钮点击事件
  userInfoBtn.addEventListener('click', toggleUserMenu);

  // 登出按钮点击事件
  logoutBtn.addEventListener('click', handleLogout);

  // 点击外部关闭菜单
  document.addEventListener('click', (e) => {
    if (!userInfo.contains(e.target)) {
      hideUserMenu();
    }
  });
}

// 切换用户菜单显示/隐藏
function toggleUserMenu() {
  userMenu.classList.toggle('hidden');
}

// 隐藏用户菜单
function hideUserMenu() {
  userMenu.classList.add('hidden');
}
```

#### 2.2 更新 UI 状态
```javascript
// 根据登录状态更新 UI
function updateUIForLoginState(isLoggedIn, userInfo = null) {
  if (isLoggedIn && userInfo) {
    // 显示用户信息
    loginButton.classList.add('hidden');
    userInfo.classList.remove('hidden');

    // 更新用户名和头像
    userName.textContent = userInfo.userName || userInfo.userId;
    userAvatar.src = userInfo.avatar || '/img/default-avatar.png';

    // 显示侧边栏 (Stage 2 实现)
    // showSidebar();
  } else {
    // 显示登录按钮
    loginButton.classList.remove('hidden');
    userInfo.classList.add('hidden');

    // 隐藏侧边栏
    // hideSidebar();
  }
}
```

#### 2.3 登出逻辑
```javascript
// 处理登出
async function handleLogout() {
  try {
    // 调用后端登出接口
    const response = await fetch('/auth/logout', {
      method: 'GET',
      credentials: 'include'
    });

    if (response.ok) {
      // 清除前端存储的数据
      clearLocalStorage();

      // 隐藏用户菜单
      hideUserMenu();

      // 更新 UI 为未登录状态
      updateUIForLoginState(false);

      // 清空聊天历史 (可选)
      clearChatHistory();

      // 显示提示
      showNotification('已成功登出');

      console.log('登出成功');
    } else {
      throw new Error('登出失败');
    }
  } catch (error) {
    console.error('登出错误:', error);
    showNotification('登出失败,请重试', 'error');
  }
}

// 清除本地存储
function clearLocalStorage() {
  // 清除 Coze token
  localStorage.removeItem('coze_token');
  localStorage.removeItem('coze_token_expires_at');

  // 清除其他认证相关数据
  localStorage.removeItem('user_id');
  localStorage.removeItem('conversation_id');

  // 可选: 清除其他临时数据
  // localStorage.clear(); // 谨慎使用,会清除所有数据
}

// 清空聊天历史 (UI)
function clearChatHistory() {
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    chatContainer.innerHTML = '';
  }
}

// 显示通知 (简单实现)
function showNotification(message, type = 'success') {
  // TODO: 实现更好的通知 UI
  alert(message);
}
```

#### 2.4 页面加载时检查登录状态
```javascript
// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 初始化组件
  initUserInfo();
  initLoginModal();

  // 检查登录状态
  try {
    const response = await fetch('/auth/session');
    const data = await response.json();

    if (data.authenticated) {
      updateUIForLoginState(true, {
        userId: data.userId,
        userName: data.userName,
        avatar: data.userInfo?.avatar
      });
    } else {
      updateUIForLoginState(false);
    }
  } catch (error) {
    console.error('检查登录状态失败:', error);
    updateUIForLoginState(false);
  }
});
```

### 3. 后端登出接口

**文件**: `server/routes/auth.js`

**调整登出接口**:
```javascript
// 登出接口
router.get('/auth/logout', (req, res) => {
  try {
    // 销毁 session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ error: '登出失败' });
      }

      // 清除 session cookie
      res.clearCookie('connect.sid'); // 根据实际 cookie 名称调整

      // 返回成功响应
      res.json({ success: true, message: '登出成功' });
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: '登出失败' });
  }
});
```

### 4. 样式调整

**文件**: `public/css/input.css`

**新增样式** (如果需要):
```css
/* 用户信息区域 */
#userInfoContainer {
  /* 确保在侧边栏上方 */
  z-index: 40;
}

/* 用户菜单动画 */
#userMenu {
  transition: opacity 0.2s ease-in-out;
}

#userMenu.hidden {
  opacity: 0;
  pointer-events: none;
}

#userMenu:not(.hidden) {
  opacity: 1;
}
```

## 测试清单

### 功能测试
- [ ] 未登录时显示"登录"按钮
- [ ] 已登录时显示用户名和头像
- [ ] 点击用户信息弹出菜单
- [ ] 点击"登出"成功登出
- [ ] 登出后清除所有认证信息
- [ ] 登出后 UI 更新为未登录状态

### 边界测试
- [ ] 登出接口失败时的错误处理
- [ ] 网络错误时的处理
- [ ] 重复点击登出按钮的处理
- [ ] Session 已过期时的处理

### UI/UX 测试
- [ ] 用户菜单正确定位
- [ ] 点击外部关闭菜单
- [ ] 菜单动画流畅
- [ ] 移动端布局正确

## 依赖

**前置任务**:
- `stage1-task1-delayed-login-mode.md` - 登录状态检查
- `stage1-task2-login-modal.md` - 登录功能

**后续任务**:
- `stage2-task1-sidebar-layout.md` - 侧边栏布局 (登出后需要隐藏侧边栏)

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 2.3.3 登出功能
- [CLAUDE.md](../CLAUDE.md) - Session Management
- Express Session: https://github.com/expressjs/session

## 注意事项

1. **完整清理**: 必须同时清除前端 localStorage 和后端 session
2. **Cookie 名称**: 确认项目中的 session cookie 名称
3. **安全性**: 登出后禁止访问受保护的资源
4. **用户体验**: 登出后提供明确的反馈

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 登出后无法访问需要认证的 API
4. 提交信息格式: `feat(auth): add logout functionality`
