# Task: 实现登录模态框

**Stage**: 1 - 登录页面与登出功能
**Priority**: P0 (必须)
**Estimated Time**: 3-4 hours
**Status**: Not Started

---

## 目标

实现一个登录模态框,当未登录用户尝试发送消息时弹出,引导用户通过企业微信扫码登录。

## 背景

延迟登录模式下,用户点击发送按钮时需要检查登录状态。未登录时应弹出友好的登录模态框,而非直接跳转。

## 成功标准

- [ ] 未登录用户点击发送时弹出模态框
- [ ] 模态框包含企业微信登录按钮
- [ ] 点击登录按钮打开OAuth授权窗口
- [ ] 授权成功后自动关闭模态框
- [ ] 授权成功后继续发送消息
- [ ] 点击遮罩或关闭按钮可关闭模态框

## UI 设计规格

### 模态框结构
```html
<div id="loginModal" class="modal-overlay">
  <div class="modal-container">
    <button class="modal-close">&times;</button>
    <div class="modal-content">
      <div class="modal-logo">
        <!-- Logo or Product Name -->
      </div>
      <p class="modal-message">需要登录才能发送消息</p>
      <button class="wechat-login-btn">
        <img src="/img/wechat-work-icon.svg" alt="企业微信">
        企业微信登录
      </button>
    </div>
  </div>
</div>
```

### 样式要求
- 遮罩背景: 半透明黑色 (`rgba(0, 0, 0, 0.5)`)
- 模态框: 白色背景,圆角,居中显示
- 响应式: 桌面端固定宽度,移动端自适应
- 动画: 淡入淡出效果

## 技术实现

### 1. HTML 结构

**文件**: `public/chat.html`

**新增 HTML**:
```html
<!-- 在 body 结束前添加 -->
<div id="loginModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-8 relative">
    <!-- 关闭按钮 -->
    <button id="closeLoginModal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl">
      &times;
    </button>

    <!-- 内容区域 -->
    <div class="text-center">
      <!-- Logo -->
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-800">MAX AI</h2>
      </div>

      <!-- 提示信息 -->
      <p class="text-gray-600 mb-8">需要登录才能发送消息</p>

      <!-- 登录按钮 -->
      <button id="wechatLoginBtn" class="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-6 rounded-lg flex items-center justify-center gap-3 transition-colors">
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <!-- 企业微信图标 SVG -->
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
        </svg>
        <span>企业微信登录</span>
      </button>
    </div>
  </div>
</div>
```

### 2. JavaScript 实现

**文件**: `public/js/chat.js`

#### 2.1 显示/隐藏模态框
```javascript
// 模态框元素引用
let loginModal;
let closeLoginModalBtn;
let wechatLoginBtn;

// 初始化模态框
function initLoginModal() {
  loginModal = document.getElementById('loginModal');
  closeLoginModalBtn = document.getElementById('closeLoginModal');
  wechatLoginBtn = document.getElementById('wechatLoginBtn');

  // 关闭按钮事件
  closeLoginModalBtn.addEventListener('click', hideLoginModal);

  // 点击遮罩关闭
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) {
      hideLoginModal();
    }
  });

  // 登录按钮事件
  wechatLoginBtn.addEventListener('click', handleWechatLogin);
}

// 显示模态框
function showLoginModal() {
  loginModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // 防止背景滚动
}

// 隐藏模态框
function hideLoginModal() {
  loginModal.classList.add('hidden');
  document.body.style.overflow = '';
}
```

#### 2.2 企业微信登录逻辑
```javascript
// 打开企业微信登录窗口
function handleWechatLogin() {
  const loginUrl = '/auth/login';
  const width = 600;
  const height = 700;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;

  // 打开弹窗
  const loginWindow = window.open(
    loginUrl,
    'wechat_login',
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
  );

  // 监听登录成功事件
  const checkLoginInterval = setInterval(async () => {
    // 检查窗口是否关闭
    if (loginWindow.closed) {
      clearInterval(checkLoginInterval);
      return;
    }

    // 检查登录状态
    const isLoggedIn = await checkLoginStatus();
    if (isLoggedIn) {
      clearInterval(checkLoginInterval);
      loginWindow.close();
      hideLoginModal();
      onLoginSuccess();
    }
  }, 1000);
}

// 登录成功后的处理
function onLoginSuccess() {
  console.log('登录成功');

  // 更新 UI 状态
  updateUIForLoginState(true);

  // 如果有待发送的消息,继续发送
  if (pendingMessage) {
    sendMessage(pendingMessage);
    pendingMessage = null;
  }
}
```

#### 2.3 优化消息发送流程
```javascript
let pendingMessage = null;

// 修改 sendMessage 函数
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  // 检查登录状态
  const isLoggedIn = await checkLoginStatus();
  if (!isLoggedIn) {
    pendingMessage = message; // 保存待发送消息
    showLoginModal();
    return;
  }

  // 清空待发送消息
  pendingMessage = null;

  // 原有的发送逻辑
  // ...
}
```

### 3. 样式调整

**文件**: `public/css/input.css` (Tailwind 源文件)

**新增样式** (如果需要自定义样式):
```css
/* 模态框动画 */
#loginModal {
  transition: opacity 0.3s ease-in-out;
}

#loginModal.hidden {
  opacity: 0;
  pointer-events: none;
}

#loginModal:not(.hidden) {
  opacity: 1;
}

/* 企业微信按钮样式 */
.wechat-login-btn {
  background-color: #07c160; /* 企业微信绿色 */
}

.wechat-login-btn:hover {
  background-color: #06ad56;
}
```

### 4. OAuth 回调处理

**文件**: `server/routes/callback.js` (现有文件)

**确认逻辑**:
- OAuth 回调成功后,确保设置 session
- 如果是弹窗打开的,可以自动关闭窗口:

```javascript
// 回调成功后的响应
router.get('/auth/callback', async (req, res) => {
  try {
    // 现有的 OAuth 处理逻辑
    // ...

    // 设置 session
    req.session.userId = userId;
    req.session.userName = userName;

    // 如果是弹窗,返回自动关闭的页面
    res.send(`
      <html>
        <body>
          <script>
            window.close();
          </script>
          <p>登录成功!正在关闭窗口...</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/chat.html?error=login_failed');
  }
});
```

## 测试清单

### 功能测试
- [ ] 点击发送按钮触发模态框显示
- [ ] 点击关闭按钮隐藏模态框
- [ ] 点击遮罩隐藏模态框
- [ ] 点击登录按钮打开OAuth窗口
- [ ] OAuth授权成功后模态框自动关闭
- [ ] 登录成功后待发送消息自动发送

### UI/UX 测试
- [ ] 模态框居中显示
- [ ] 遮罩背景半透明
- [ ] 淡入淡出动画流畅
- [ ] 企业微信按钮样式正确
- [ ] 移动端响应式布局正确

### 边界测试
- [ ] 用户关闭OAuth窗口时的处理
- [ ] 网络错误时的处理
- [ ] 重复点击登录按钮的处理

## 依赖

**前置任务**:
- `stage1-task1-delayed-login-mode.md` - 必须先实现延迟登录检查

**后续任务**:
- `stage1-task3-logout-feature.md` - 实现登出功能

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 2.3.1 登录模态框设计
- Tailwind CSS Modal: https://tailwindcss.com/docs/
- Window.open() MDN: https://developer.mozilla.org/en-US/docs/Web/API/Window/open

## 注意事项

1. **安全性**: OAuth 回调必须验证 state 参数(如已实现)
2. **用户体验**: 登录成功后自动继续之前的操作
3. **浏览器兼容**: 部分浏览器可能阻止弹窗,需提示用户允许
4. **键盘支持**: ESC 键关闭模态框

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. 在桌面端和移动端测试正常
4. 提交信息格式: `feat(auth): add login modal for delayed login`
