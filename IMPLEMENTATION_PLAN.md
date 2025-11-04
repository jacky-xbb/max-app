# 实现计划 - 登录页面与会话管理功能

**开始日期**: 2025-10-14
**预计完成**: TBD
**参考文档**: [REQUIREMENTS.md](./REQUIREMENTS.md)

---

## Stage 1: 登录页面与登出功能
**目标**: 实现独立登录页和登出功能，重构认证流程
**状态**: Not Started

### 成功标准
- [ ] 未登录用户访问聊天页时自动跳转到登录页
- [ ] 登录页可以通过企微扫码登录
- [ ] 聊天页有登出按钮，点击后清除状态并跳转到登录页
- [ ] 已登录用户访问登录页时自动跳转到聊天页

### 实现任务

#### 1.1 创建登录页面
- [ ] 创建 `/public/login.html` 页面
- [ ] 设计登录页 UI（企微品牌风格）
- [ ] 添加"企业微信登录"按钮，点击跳转到 `/auth/login`
- [ ] 确保响应式设计（桌面端和移动端）

#### 1.2 调整认证流程
- [ ] 修改 `/server/routes/auth.js` 的 `/auth/login` 路由
  - 检查用户是否已登录，如果已登录则重定向到 `/chat.html`
  - 未登录则继续企微 OAuth 流程
- [ ] 修改 `/server/routes/auth.js` 的 `/auth/callback` 路由
  - 成功授权后重定向到 `/chat.html`（而非当前页面）

#### 1.3 实现登出功能
- [ ] 在 `/server/routes/auth.js` 新增 `POST /auth/logout` 端点
  - 清除 Express session
  - 返回成功响应
- [ ] 在 `/public/chat.html` 添加登出按钮（顶部导航栏）
- [ ] 在 `/public/js/chat.js` 实现登出逻辑
  - 调用 `/auth/logout` API
  - 清除 localStorage 中的所有认证信息
  - 重定向到 `/login`

#### 1.4 访问控制中间件
- [ ] 创建 `/server/middleware/authGuard.js` 中间件
  - 检查用户是否已登录（检查 session）
  - 未登录返回 401 状态码
- [ ] 在需要认证的路由上应用中间件（`/api/*` 路由）
- [ ] 前端添加全局 401 错误处理器
  - 收到 401 时清除 localStorage 并跳转到 `/login`

#### 1.5 路由重定向逻辑
- [ ] 在 `/server/server.js` 或路由文件中添加根路径 `/` 处理
  - 已登录用户重定向到 `/chat.html`
  - 未登录用户重定向到 `/login`
- [ ] 修改 `/login` 路由，已登录用户自动跳转到 `/chat.html`
- [ ] 修改 `/chat.html` 路由，未登录用户自动跳转到 `/login`

### 测试
- [ ] 测试未登录访问 `/chat.html` 是否重定向到 `/login`
- [ ] 测试登录流程是否完整（扫码 → 授权 → 跳转到聊天页）
- [ ] 测试登出后是否清除所有状态并跳转到登录页
- [ ] 测试已登录用户访问 `/login` 是否重定向到 `/chat.html`
- [ ] 测试前端收到 401 错误时是否自动跳转到登录页

---

## Stage 2: 侧边栏 UI 与基础布局
**目标**: 实现侧边栏的 UI 结构和响应式布局
**状态**: Not Started

### 成功标准
- [ ] 桌面端侧边栏固定在左侧
- [ ] 移动端侧边栏以抽屉式展开/收起
- [ ] 侧边栏包含"新建会话"按钮和会话列表容器
- [ ] UI 样式符合设计规格

### 实现任务

#### 2.1 重构聊天页面结构
- [ ] 修改 `/public/chat.html` 结构
  ```html
  <div class="app-container">
    <aside class="sidebar">
      <button class="new-conversation-btn">新对话</button>
      <div class="conversation-list"></div>
    </aside>
    <main class="chat-main">
      <header class="chat-header">
        <!-- 包含登出按钮 -->
      </header>
      <div class="chat-messages"></div>
      <div class="chat-input"></div>
    </main>
  </div>
  ```

#### 2.2 实现桌面端侧边栏样式
- [ ] 在 `/public/css/input.css` 中添加侧边栏样式
  - 侧边栏宽度 280px，固定在左侧
  - 使用 Tailwind 的 flex 布局
  - 添加侧边栏与主内容区的分隔线

#### 2.3 实现移动端侧边栏（抽屉式）
- [ ] 添加汉堡菜单按钮（仅移动端显示）
- [ ] 实现侧边栏的展开/收起动画
  - 使用 CSS transition 或 Tailwind 的动画类
  - 侧边栏默认隐藏，覆盖在聊天界面上
- [ ] 添加遮罩层（点击遮罩关闭侧边栏）

#### 2.4 实现会话条目 UI
- [ ] 设计会话条目组件样式
  ```html
  <div class="conversation-item">
    <div class="conversation-icon">📝</div>
    <div class="conversation-content">
      <div class="conversation-title">会话标题</div>
      <div class="conversation-time">2小时前</div>
    </div>
    <div class="conversation-actions">
      <button class="edit-btn">✏️</button>
      <button class="delete-btn">🗑️</button>
    </div>
  </div>
  ```
- [ ] 实现鼠标悬停显示操作按钮（桌面端）
- [ ] 移动端始终显示操作按钮
- [ ] 当前激活会话高亮显示

#### 2.5 响应式断点处理
- [ ] 定义响应式断点（768px）
- [ ] 桌面端（>= 768px）：侧边栏固定显示
- [ ] 移动端（< 768px）：侧边栏默认隐藏，点击汉堡菜单展开

### 测试
- [ ] 测试桌面端侧边栏是否固定在左侧
- [ ] 测试移动端侧边栏是否正确展开/收起
- [ ] 测试会话条目样式是否符合设计
- [ ] 测试鼠标悬停时操作按钮是否显示
- [ ] 测试不同屏幕尺寸下的布局是否正确

---

## Stage 3: 会话管理功能集成
**目标**: 对接 Coze API，实现会话的增删查改
**状态**: Not Started

### 成功标准
- [ ] 登录后自动获取并显示用户的会话列表
- [ ] 点击"新建会话"创建新会话并切换到新会话
- [ ] 点击会话条目加载该会话的历史消息
- [ ] 点击编辑按钮可以重命名会话
- [ ] 点击删除按钮删除指定会话

### 实现任务

#### 3.1 研究 Coze SDK 会话管理 API
- [ ] 查看 Coze SDK v1.3.5 文档，确认以下 API 用法
  - `coze.conversations.list()` - 获取会话列表
  - `coze.conversations.create()` - 创建新会话
  - `coze.conversations.update()` - 更新会话（重命名）
  - `coze.conversations.messages.list()` - 获取会话消息
  - `coze.conversations.delete()` 或 `clear()` - 删除会话
- [ ] 确认 API 响应数据结构

#### 3.2 后端 API 实现
- [ ] 修改 `/server/routes/api.js`，实现以下端点：

##### 3.2.1 GET /api/conversations - 获取会话列表
- [ ] 调用 Coze SDK 获取用户的所有会话
- [ ] 返回会话列表（包含 conversation_id, title, updated_at）
- [ ] 如果 Coze 返回的会话中没有 title，调用 `messages.list()` 获取第一条用户消息作为标题

##### 3.2.2 POST /api/conversations - 创建新会话
- [ ] 调用 Coze SDK 创建新会话
- [ ] 返回新创建的会话对象（包含 conversation_id）

##### 3.2.3 PATCH /api/conversations/:id - 重命名会话
- [ ] 接收 `{ title: "新标题" }` 参数
- [ ] 调用 Coze SDK 更新会话标题
- [ ] 返回更新后的会话对象

##### 3.2.4 DELETE /api/conversations/:id - 删除会话
- [ ] 调用 Coze SDK 删除指定会话
- [ ] 返回成功响应

##### 3.2.5 GET /api/conversations/:id/messages - 获取会话消息
- [ ] 调用 Coze SDK 获取指定会话的历史消息
- [ ] 返回消息列表

#### 3.3 更新 cozeSDKAdapter
- [ ] 在 `/server/utils/cozeSDKAdapter.js` 中添加会话管理方法
  - `listConversations(userId)`
  - `createConversation(userId)`
  - `updateConversation(conversationId, data)`
  - `deleteConversation(conversationId)`
  - `getConversationMessages(conversationId)`

#### 3.4 前端会话管理逻辑
- [ ] 创建 `/public/js/conversationManager.js` 模块

##### 3.4.1 获取并渲染会话列表
- [ ] 在页面加载时调用 `/api/conversations` 获取会话列表
- [ ] 渲染会话列表到侧边栏
- [ ] 如果没有会话，自动创建一个新会话

##### 3.4.2 新建会话
- [ ] 点击"新建会话"按钮
- [ ] 调用 `POST /api/conversations` 创建新会话
- [ ] 将新会话添加到列表顶部
- [ ] 切换到新会话（清空聊天区域）
- [ ] 更新 localStorage 中的 `current_conversation_id`

##### 3.4.3 切换会话
- [ ] 点击会话条目
- [ ] 调用 `GET /api/conversations/:id/messages` 获取历史消息
- [ ] 清空当前聊天区域，渲染历史消息
- [ ] 高亮当前会话
- [ ] 更新 localStorage 中的 `current_conversation_id`
- [ ] 移动端自动收起侧边栏

##### 3.4.4 重命名会话
- [ ] 点击编辑按钮，会话标题变为可编辑的 input
- [ ] input 获得焦点并选中当前文本
- [ ] 监听键盘事件：
  - 回车键：保存并退出编辑模式
  - ESC 键：取消编辑，恢复原标题
- [ ] 监听 blur 事件：失去焦点时保存
- [ ] 验证输入：
  - 如果为空，提示"会话名称不能为空"并恢复原标题
  - 如果超过 100 个字符，截断并提示
- [ ] 调用 `PATCH /api/conversations/:id` 更新标题
- [ ] 更新侧边栏中的会话标题
- [ ] 显示"重命名成功"提示

##### 3.4.5 删除会话
- [ ] 点击删除按钮
- [ ] 显示二次确认弹窗："确认删除此会话？"
- [ ] 确认后调用 `DELETE /api/conversations/:id`
- [ ] 从侧边栏移除该会话
- [ ] 如果删除的是当前会话：
  - 切换到会话列表的第一个会话
  - 如果没有其他会话，自动创建一个新会话

#### 3.5 集成到现有聊天功能
- [ ] 修改 `/public/js/chat.js`，在发送消息时使用当前 conversation_id
- [ ] 修改 `/server/services/chatService.js`，确保使用正确的 conversation_id
- [ ] 确保新消息自动更新会话的 updated_at 时间

### 测试
- [ ] 测试会话列表是否正确加载
- [ ] 测试新建会话是否成功并切换到新会话
- [ ] 测试切换会话是否正确加载历史消息
- [ ] 测试重命名会话是否成功保存
- [ ] 测试重命名的输入验证（空名称、超长名称）
- [ ] 测试删除会话是否成功，并正确处理当前会话删除的情况
- [ ] 测试发送消息后会话列表是否更新排序
- [ ] 测试会话数据是否正确存储在 Coze 后端

---

## Stage 4: 交互优化与错误处理
**目标**: 完善用户体验，增加加载状态和错误提示
**状态**: Not Started

### 成功标准
- [ ] 所有异步操作都有加载状态提示
- [ ] 错误情况有友好的提示信息
- [ ] 删除会话有二次确认弹窗
- [ ] 会话标题过长时正确显示省略号和 tooltip

### 实现任务

#### 4.1 加载状态
- [ ] 加载会话列表时显示骨架屏（skeleton）
- [ ] 切换会话时显示加载动画
- [ ] 重命名/删除会话时显示 loading 状态（禁用按钮）

#### 4.2 错误处理
- [ ] 网络请求失败时显示错误提示
- [ ] Coze API 错误时显示友好的错误信息
- [ ] 401 错误自动跳转到登录页
- [ ] 其他错误显示通用提示："操作失败，请稍后重试"

#### 4.3 用户反馈
- [ ] 实现 Toast 提示组件（或使用现有库）
- [ ] 成功操作显示成功提示（如"重命名成功"）
- [ ] 失败操作显示错误提示

#### 4.4 UI 细节优化
- [ ] 会话标题过长时显示省略号
- [ ] 鼠标悬停在标题上时显示完整标题（tooltip）
- [ ] 会话时间使用相对时间（如"2小时前"，"昨天"）
- [ ] 空会话列表时显示友好提示："暂无会话，点击新建会话开始聊天"

#### 4.5 二次确认弹窗
- [ ] 实现确认弹窗组件（或使用 `window.confirm`）
- [ ] 删除会话时显示："确认删除此会话？"
- [ ] 确认和取消按钮样式

#### 4.6 性能优化
- [ ] 会话列表使用虚拟滚动（如果会话数量很多）
- [ ] 防抖处理（如重命名输入）
- [ ] 节流处理（如滚动加载）

### 测试
- [ ] 测试所有加载状态是否正确显示
- [ ] 测试错误提示是否友好且准确
- [ ] 测试 Toast 提示是否正常工作
- [ ] 测试会话标题省略号和 tooltip
- [ ] 测试二次确认弹窗
- [ ] 测试各种边界情况（空列表、超长标题、网络失败等）

---

## 注意事项

1. **Coze API 调研**：在 Stage 3 开始前，务必先研究 Coze SDK 文档，确认 API 用法
2. **增量提交**：每完成一个小任务就 commit，确保代码可回滚
3. **测试优先**：每完成一个功能立即测试，不要等到最后
4. **错误处理**：所有 API 调用都要有错误处理
5. **代码复用**：尽量复用现有代码和样式，保持项目一致性

---

## 完成标准

所有 4 个 Stage 的任务都完成，并且：
- [ ] 所有功能测试通过
- [ ] 代码通过 ESLint 检查
- [ ] 代码通过 Prettier 格式化
- [ ] 更新 [REQUIREMENTS.md](./REQUIREMENTS.md) 中的实现状态
- [ ] 删除本文件 `IMPLEMENTATION_PLAN.md`
