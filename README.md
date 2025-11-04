# WeChat Work AI Assistant - 部署指南

## 快速开始

### 前置要求

- Node.js v14+ 
- npm 或 yarn
- 企业微信应用凭证
- Coze AI API 密钥

### 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd wecom-app

# 安装依赖
npm install
```

### 环境配置

1. **复制环境配置文件**

```bash
# 开发环境
cp .env.example .env.development

# 生产环境（默认）
cp .env.example .env
```

2. **编辑配置文件**

编辑对应的环境文件，填入实际配置：

```env
# 企业信息（必填）
CORP_ID=your_corp_id
CORP_SECRET=your_corp_secret
AGENT_ID=your_agent_id

# Coze AI 配置（必填）
COZE_API_KEY=your_coze_api_key
COZE_BOT_ID=your_bot_id
COZE_WORKSPACE_ID=your_workspace_id

# 服务器配置
PORT=8892
```

## 启动应用

### 开发环境

```bash
# 使用 nodemon 热重载（加载 .env.development）
pnpm run dev

# 跳过企业微信认证（本地测试）
SKIP_OAUTH=true pnpm run dev
```

### 生产环境

```bash
# 默认启动（加载 .env）
pnpm start

# 后台运行
nohup npm start > app.log 2>&1 &
```

### 查看日志

```bash
# 实时查看日志
tail -f app.log

# 查看最新100行
tail -n 100 app.log
```
