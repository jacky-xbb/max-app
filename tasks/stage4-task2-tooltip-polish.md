# Task: 完善 Tooltip 和交互细节

**Stage**: 4 - 交互优化与错误处理
**Priority**: P2 (可选)
**Estimated Time**: 2-3 hours
**Status**: Not Started

---

## 目标

为UI添加 Tooltip 提示和完善各种交互细节,提升用户体验。

## 背景

当前界面缺少一些交互提示,用户可能不清楚某些功能的作用。需要添加 Tooltip 和优化交互反馈。

## 成功标准

- [ ] 会话标题过长时鼠标悬停显示完整标题
- [ ] 操作按钮有 Tooltip 提示
- [ ] 用户信息区域有 Tooltip
- [ ] 新建会话按钮有 Tooltip
- [ ] Tooltip 样式统一
- [ ] 移动端禁用 Tooltip (使用 title 属性替代)

## 需要添加 Tooltip 的位置

### 1. 会话列表
- 会话标题 (超长时)
- 编辑按钮: "重命名"
- 删除按钮: "删除"

### 2. 按钮
- 新建会话按钮: "创建新会话"
- 汉堡菜单按钮: "打开菜单"
- 登录按钮: "点击登录"
- 登出按钮: "登出"

### 3. 用户信息
- 用户头像/名称: 显示完整用户信息

## 技术实现

### 1. Tooltip 组件

**文件**: `public/js/tooltip.js` (新建)

```javascript
// Tooltip 管理器
class TooltipManager {
  constructor() {
    this.tooltip = null;
    this.init();
  }

  init() {
    // 创建 Tooltip 元素
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tooltip';
    this.tooltip.className = 'fixed z-[100] px-3 py-2 bg-gray-900 text-white text-sm rounded shadow-lg pointer-events-none opacity-0 transition-opacity duration-200 whitespace-nowrap';
    document.body.appendChild(this.tooltip);

    // 绑定事件
    this.bindEvents();
  }

  bindEvents() {
    // 使用事件委托
    document.addEventListener('mouseenter', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target && window.innerWidth >= 1024) {
        // 仅桌面端显示
        this.show(target.dataset.tooltip, target);
      }
    }, true);

    document.addEventListener('mouseleave', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        this.hide();
      }
    }, true);
  }

  show(text, target) {
    if (!text) return;

    this.tooltip.textContent = text;
    this.tooltip.classList.remove('opacity-0');
    this.tooltip.classList.add('opacity-100');

    // 定位 Tooltip
    this.position(target);
  }

  hide() {
    this.tooltip.classList.remove('opacity-100');
    this.tooltip.classList.add('opacity-0');
  }

  position(target) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();

    // 默认在上方显示
    let top = rect.top - tooltipRect.height - 8;
    let left = rect.left + (rect.width - tooltipRect.width) / 2;

    // 如果上方空间不足,显示在下方
    if (top < 10) {
      top = rect.bottom + 8;
    }

    // 如果左侧超出,调整位置
    if (left < 10) {
      left = 10;
    }

    // 如果右侧超出,调整位置
    if (left + tooltipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tooltipRect.width - 10;
    }

    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new TooltipManager();
});
```

### 2. 为元素添加 Tooltip

**文件**: `public/chat.html` 和 `public/js/chat.js`

#### 2.1 HTML 元素添加 data-tooltip
```html
<!-- 新建会话按钮 -->
<button id="newSessionBtn" data-tooltip="创建新会话" class="...">
  <!-- ... -->
</button>

<!-- 汉堡菜单按钮 -->
<button id="mobileMenuBtn" data-tooltip="打开菜单" class="...">
  <!-- ... -->
</button>

<!-- 登录按钮 -->
<button id="loginButton" data-tooltip="点击登录" class="...">
  <!-- ... -->
</button>
```

#### 2.2 动态元素添加 Tooltip (JS)
```javascript
// 修改 renderSessionItem 函数
function renderSessionItem(session) {
  const div = document.createElement('div');
  // ... 现有代码 ...

  // 为会话标题添加 title 属性 (原生 Tooltip)
  const titleElement = div.querySelector('.session-title');
  titleElement.title = session.title || session.firstMessage || '新会话';

  // 为编辑按钮添加 Tooltip
  const editBtn = div.querySelector('.edit-session-btn');
  editBtn.dataset.tooltip = '重命名';

  // 为删除按钮添加 Tooltip
  const deleteBtn = div.querySelector('.delete-session-btn');
  deleteBtn.dataset.tooltip = '删除';

  // ... 现有代码 ...

  return div;
}
```

### 3. 优化会话标题 Tooltip

**使用原生 `title` 属性**,仅在标题被截断时显示:

```javascript
// 修改 renderSessionItem 函数
function renderSessionItem(session) {
  // ... 现有代码 ...

  const title = session.title || session.firstMessage || '新会话';
  const truncatedTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;

  // 仅在截断时添加 title
  const titleAttr = title.length > 30 ? `title="${title}"` : '';

  div.innerHTML = `
    <div class="flex items-start gap-3">
      <!-- ... -->
      <div class="flex-1 min-w-0">
        <h3 class="session-title text-sm font-medium text-gray-800 truncate" ${titleAttr}>
          ${truncatedTitle}
        </h3>
        <!-- ... -->
      </div>
      <!-- ... -->
    </div>
  `;

  // ... 现有代码 ...
}
```

### 4. 优化用户信息 Tooltip

**文件**: `public/js/chat.js`

```javascript
// 修改 updateUIForLoginState 函数
function updateUIForLoginState(isLoggedIn, userInfo = null) {
  if (isLoggedIn && userInfo) {
    // ... 现有代码 ...

    // 为用户信息添加 Tooltip
    const userInfoBtn = document.getElementById('userInfoBtn');
    userInfoBtn.dataset.tooltip = `${userInfo.userName || userInfo.userId} (点击查看菜单)`;

    // ... 现有代码 ...
  }
}
```

### 5. HTML 引入 Tooltip 文件

**文件**: `public/chat.html`

```html
<!-- 在其他 script 标签前添加 -->
<script src="/js/tooltip.js"></script>
```

### 6. 样式优化

**文件**: `public/css/input.css`

```css
/* Tooltip 样式 */
#tooltip {
  max-width: 300px;
  word-wrap: break-word;
}

/* 移动端禁用自定义 Tooltip */
@media (max-width: 1023px) {
  #tooltip {
    display: none !important;
  }
}

/* 原生 title 属性样式 (浏览器控制,无法自定义) */
/* 但可以通过 title 属性在移动端提供基本提示 */
```

## 其他交互优化

### 1. 会话条目悬停效果优化

```css
/* 会话条目悬停动画 */
.session-item {
  transition: all 0.2s ease-in-out;
}

.session-item:hover {
  transform: translateX(2px);
}

.session-item.active {
  transform: none; /* 激活状态不偏移 */
}
```

### 2. 按钮点击反馈

```css
/* 按钮点击效果 */
button {
  transition: transform 0.1s ease-in-out;
}

button:active:not(:disabled) {
  transform: scale(0.95);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 3. 输入框焦点效果

```css
/* 输入框焦点样式 */
input:focus,
textarea:focus {
  outline: none;
  ring: 2px;
  ring-color: rgba(59, 130, 246, 0.5);
  border-color: #3b82f6;
}
```

## 测试清单

### Tooltip 测试
- [ ] 桌面端鼠标悬停显示 Tooltip
- [ ] Tooltip 位置正确 (不超出屏幕)
- [ ] Tooltip 内容正确
- [ ] 鼠标离开后 Tooltip 消失
- [ ] 移动端不显示自定义 Tooltip

### 会话标题 Tooltip
- [ ] 标题未截断时不显示 Tooltip
- [ ] 标题截断时显示完整内容
- [ ] Tooltip 文字正确

### 交互反馈测试
- [ ] 按钮悬停效果正确
- [ ] 按钮点击反馈明显
- [ ] 会话条目悬停效果流畅
- [ ] 输入框焦点样式正确

## 依赖

**前置任务**:
- `stage4-task1-loading-states.md` - 加载状态优化

**后续任务**:
- 无 (可选优化任务)

## 参考资料

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 1.3.2 会话条目设计
- CSS Transitions: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Transitions
- Tooltip Best Practices: https://inclusive-components.design/tooltips-toggletips/

## 注意事项

1. **可访问性**:
   - 添加 `aria-label` 属性
   - 确保键盘用户也能获得提示信息

2. **性能**:
   - 使用事件委托,避免大量事件监听
   - Tooltip 使用单例模式

3. **移动端**:
   - 移动端禁用自定义 Tooltip
   - 使用原生 `title` 属性提供基本提示

4. **响应式**:
   - Tooltip 位置自动调整,避免超出屏幕

## 验收标准

1. 代码通过 ESLint 检查
2. 所有测试清单项通过
3. Tooltip 在桌面端正确显示
4. 移动端不显示自定义 Tooltip
5. 提交信息格式: `feat(ux): add tooltips and polish interactions`
