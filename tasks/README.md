# 任务清单总览

本目录包含登录页面与会话管理功能的所有开发任务,按实现阶段组织。

## 开发顺序

建议按照以下顺序依次完成各个任务:

### Stage 1: 登录页面与登出功能

**目标**: 实现延迟登录模式和登出功能,重构认证流程

| 任务 | 文件 | 优先级 | 预计时间 | 状态 |
|------|------|--------|----------|------|
| 1.1 延迟登录模式 | [stage1-task1-delayed-login-mode.md](stage1-task1-delayed-login-mode.md) | P0 | 4-6h | ✅ 已完成 |
| 1.2 登录模态框 | [stage1-task2-login-modal.md](stage1-task2-login-modal.md) | P0 | 3-4h | ✅ 已完成 |
| 1.3 登出功能 | [stage1-task3-logout-feature.md](stage1-task3-logout-feature.md) | P0 | 2-3h | ✅ 已完成 |

**预计总时间**: 9-13 小时

---

### Stage 2: 侧边栏 UI 与基础布局

**目标**: 实现侧边栏的 UI 结构和响应式布局

| 任务 | 文件 | 优先级 | 预计时间 | 状态 |
|------|------|--------|----------|------|
| 2.1 侧边栏布局 | [stage2-task1-sidebar-layout.md](stage2-task1-sidebar-layout.md) | P0 | 4-5h | 未开始 |
| 2.2 会话条目 UI | [stage2-task2-session-item-ui.md](stage2-task2-session-item-ui.md) | P0 | 3-4h | 未开始 |

**预计总时间**: 7-9 小时

---

### Stage 3: 会话管理功能集成

**目标**: 对接 Coze API,实现会话的增删查改

| 任务 | 文件 | 优先级 | 预计时间 | 状态 |
|------|------|--------|----------|------|
| 3.1 获取会话列表 | [stage3-task1-fetch-sessions.md](stage3-task1-fetch-sessions.md) | P0 | 4-5h | 未开始 |
| 3.2 创建新会话 | [stage3-task2-create-session.md](stage3-task2-create-session.md) | P0 | 3-4h | 未开始 |
| 3.3 重命名会话 | [stage3-task3-rename-session.md](stage3-task3-rename-session.md) | P1 | 4-5h | 未开始 |
| 3.4 切换会话 | [stage3-task4-switch-session.md](stage3-task4-switch-session.md) | P0 | 5-6h | 未开始 |
| 3.5 删除会话 | [stage3-task5-delete-session.md](stage3-task5-delete-session.md) | P1 | 3-4h | 未开始 |

**预计总时间**: 19-24 小时

---

### Stage 4: 交互优化与错误处理

**目标**: 完善用户体验,增加加载状态和错误提示

| 任务 | 文件 | 优先级 | 预计时间 | 状态 |
|------|------|--------|----------|------|
| 4.1 加载状态优化 | [stage4-task1-loading-states.md](stage4-task1-loading-states.md) | P0 | 3-4h | 未开始 |
| 4.2 Tooltip 完善 | [stage4-task2-tooltip-polish.md](stage4-task2-tooltip-polish.md) | P2 | 2-3h | 未开始 |

**预计总时间**: 5-7 小时

---

## 总计

- **总任务数**: 12 个
- **P0 任务**: 9 个 (必须完成)
- **P1 任务**: 2 个 (重要)
- **P2 任务**: 1 个 (可选)
- **预计总时间**: 40-53 小时

## 任务依赖关系

```
Stage 1: 登录与登出
├─ 1.1 延迟登录模式 (无依赖)
├─ 1.2 登录模态框 (依赖 1.1)
└─ 1.3 登出功能 (依赖 1.1)

Stage 2: 侧边栏 UI
├─ 2.1 侧边栏布局 (依赖 1.3)
└─ 2.2 会话条目 UI (依赖 2.1)

Stage 3: 会话管理
├─ 3.1 获取会话列表 (依赖 2.2)
├─ 3.2 创建新会话 (依赖 3.1)
├─ 3.3 重命名会话 (依赖 3.1, 2.2)
├─ 3.4 切换会话 (依赖 3.1, 3.2)
└─ 3.5 删除会话 (依赖 3.1, 3.4)

Stage 4: 交互优化
├─ 4.1 加载状态优化 (依赖所有 Stage 3 任务)
└─ 4.2 Tooltip 完善 (依赖 4.1)
```

## 快速开始

### 1. 选择任务

从 **Stage 1** 开始,按顺序完成任务。每个任务文档包含:

- **目标**: 任务要达成的具体目标
- **成功标准**: 可验证的完成条件
- **技术实现**: 详细的代码实现指南
- **测试清单**: 需要测试的场景
- **依赖**: 前置和后续任务
- **注意事项**: 需要特别关注的点

### 2. 实施任务

1. 阅读任务文档
2. 确认前置任务已完成
3. 按照技术实现部分编写代码
4. 运行测试清单中的测试
5. 提交代码 (使用建议的 commit 格式)

### 3. 验收标准

每个任务完成后,确保:

- ✅ 代码通过 `npm run lint`
- ✅ 所有测试清单项通过
- ✅ 功能符合成功标准
- ✅ Commit 信息格式正确

## Coze API 待确认事项

在开始 Stage 3 之前,需要确认以下 Coze API 能力:

1. **会话列表获取** (Task 3.1)
   - [ ] Coze API 是否支持根据用户 ID 获取会话列表?
   - [ ] 返回的会话对象中是否包含"第一条用户消息"?
   - [ ] 如果不包含,是否需要额外调用 `messages.list()` 获取?

2. **会话重命名** (Task 3.3)
   - [x] Coze API 是否支持更新会话的标题/名称? **已确认:支持**

3. **会话删除** (Task 3.5)
   - [ ] Coze API 使用 `clear()` 还是 `delete()` 方法?
   - [ ] 删除会话是否真的删除,还是只清空消息?

4. **其他限制**
   - [ ] Coze 是否对单个用户的会话数量有限制?
   - [ ] 是否需要在前端做分页加载?

## 参考文档

- [REQUIREMENTS.md](../REQUIREMENTS.md) - 完整需求文档
- [CLAUDE.md](../CLAUDE.md) - 项目架构说明
- [Coze API 文档](https://www.coze.com/docs/developer_guides/coze_api_overview)
- [企业微信开发文档](https://developer.work.weixin.qq.com/document/)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)

## 开发规范

### Commit 信息格式

```
<type>(<scope>): <subject>

# 示例:
feat(auth): implement delayed login mode
fix(sessions): correct session switching logic
refactor(ui): improve sidebar layout code
docs(tasks): update task completion status
```

**Type 类型**:
- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 重构
- `docs`: 文档更新
- `style`: 代码格式调整
- `test`: 测试相关
- `chore`: 构建/工具相关

### 代码风格

- 运行 `npm run lint` 检查代码
- 运行 `npm run format` 格式化代码
- 提交前确保没有 ESLint 错误

### 测试

每个任务完成后:
1. 手动测试所有功能
2. 在桌面端和移动端测试
3. 测试错误场景
4. 测试边界情况

## 进度跟踪

建议使用以下方式跟踪进度:

1. **任务文档**: 更新每个任务文档中的"状态"字段
2. **本 README**: 更新上方表格中的"状态"列
3. **Git 分支**: 为每个 Stage 创建独立分支 (可选)

### 状态标记

- **未开始**: 还未开始实施
- **进行中**: 正在开发
- **已完成**: 开发完成,测试通过
- **已跳过**: 不需要实现 (P2 可选任务)

## 常见问题

### Q: 任务顺序可以调整吗?

**A**: 建议严格按照顺序执行,因为任务之间存在依赖关系。如果确实需要调整,请仔细检查"依赖"部分。

### Q: P1 和 P2 任务可以跳过吗?

**A**:
- **P0 (必须)**: 核心功能,必须完成
- **P1 (重要)**: 重要功能,建议完成
- **P2 (可选)**: 优化功能,可根据时间决定

### Q: 遇到技术问题怎么办?

**A**:
1. 查看任务文档中的"注意事项"和"参考资料"
2. 查阅项目的 CLAUDE.md 和 REQUIREMENTS.md
3. 查看 Coze API 官方文档
4. 在"待确认事项"中记录需要确认的问题

### Q: 如何确认任务完成?

**A**: 满足以下条件:
1. ✅ 功能符合"成功标准"
2. ✅ 代码通过 ESLint 检查
3. ✅ 所有"测试清单"项通过
4. ✅ 符合"验收标准"

## 更新日志

- **2025-01-20**: 创建任务文档,分解需求为 12 个可执行任务
- **2025-01-20**: ✅ **Stage 1 完成** - 延迟登录模式、登录模态框、登出功能已全部实现 ([查看总结](STAGE1_COMPLETION_SUMMARY.md))

---

**祝开发顺利!** 🚀
