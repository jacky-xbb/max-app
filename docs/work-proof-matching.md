# 工作证明前端渲染流程

本文档说明当用户输入"开工作证明"后，前端如何通过正则匹配Bot回复并渲染选项按钮。

## 实现位置

`public/js/chat.js` - `renderCertificateQuestions()` 函数

## 触发时机

在以下三个时机调用 `renderCertificateQuestions()`:

1. **流式渲染时** (`onToken` 回调): 每次收到token时检测并渲染
2. **完整消息更新时** (`onMessage` 回调): 收到完整消息时检测并渲染
3. **消息完成时** (`onFinish` 回调): 消息流结束后最终渲染

## 完整流程

### 步骤1: Bot返回包含选项的Markdown

Bot 返回的 markdown 内容示例：
```markdown
请选择工作证明的用途：

- 签证
- 贷款
- 其他用途
```

### 步骤2: 正则匹配检测

```javascript
function renderCertificateQuestions(contentElement, markdown) {
    // 检测问题类型
    const isYesNoQuestion = markdown.includes('是否基于工作部门及职位开具在职证明');
    
    // 正则匹配：检测是否为"用途"问题
    const normalized = markdown.replace(/\s/g, ''); // 去除所有空格
    const isPurposeQuestion =
        normalized.includes('工作证明用途') ||
        /工作证明的?用途/.test(normalized) ||
        /开具工作证明.{0,10}用途/.test(normalized) ||
        /请选择.*工作证明.*用途/.test(normalized);

    if (!isYesNoQuestion && !isPurposeQuestion) {
        return; // 不是工作证明相关问题，跳过
    }
    
    // 继续后续步骤...
}
```

**正则表达式说明**:

- `/工作证明的?用途/` - 匹配"工作证明用途"或"工作证明的用途"
- `/开具工作证明.{0,10}用途/` - 匹配"开具工作证明"后0-10个字符后跟"用途"
- `/请选择.*工作证明.*用途/` - 匹配"请选择...工作证明...用途"

### 步骤3: 提取选项

```javascript
// 从 markdown 中提取选项(以 - 或 * 开头的列表项)
const options = [];
const lines = markdown.split('\n');

for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const option = trimmed.substring(2).trim();
        if (option) {
            options.push(option);
        }
    }
}
// options = ["签证", "贷款", "其他用途"]
```

### 步骤4: 移除Markdown列表

```javascript
// 移除 markdown 渲染的列表元素，避免与按钮重复显示
const lists = contentElement.querySelectorAll('ul, ol');
lists.forEach(list => {
    const listItems = Array.from(list.querySelectorAll('li'));
    const listTexts = listItems.map(li => li.textContent.trim());
    
    // 如果列表项与选项匹配，移除整个列表
    const hasMatchingOptions = options.some(opt => listTexts.includes(opt));
    if (hasMatchingOptions) {
        list.remove(); // 删除 <ul> 或 <ol> 元素
    }
});
```

### 步骤5: 创建按钮容器

```javascript
// 创建垂直排列的选项容器
const optionsContainer = document.createElement('div');
optionsContainer.className = 'certificate-options';
```

### 步骤6: 为每个选项创建按钮

```javascript
options.forEach((option, index) => {
    const btn = document.createElement('button');
    btn.className = 'certificate-option-btn';
    btn.textContent = option;
    btn.setAttribute('data-option', option);
    btn.setAttribute('aria-label', `选择选项: ${option}`);

    // 绑定点击事件
    btn.onclick = function() {
        if (chatState.isProcessing) {
            return; // 正在处理中，忽略点击
        }

        // 禁用所有按钮，防止重复点击
        optionsContainer.querySelectorAll('.certificate-option-btn').forEach(b => {
            b.disabled = true;
            b.style.opacity = '0.5';
        });

        // 移除选项容器（延迟移除，让用户看到点击效果）
        setTimeout(() => {
            optionsContainer.remove();
        }, 200);

        // 添加用户消息并发送
        addMessage(option, 'user');
        sendMessageInternal(option);
    };

    optionsContainer.appendChild(btn);
});
```

### 步骤7: 添加到DOM

```javascript
// 将按钮组添加到消息内容中
contentElement.appendChild(optionsContainer);
```

## 完整代码

```javascript
function renderCertificateQuestions(contentElement, markdown) {
    // 1. 正则匹配检测
    const isYesNoQuestion = markdown.includes('是否基于工作部门及职位开具在职证明');
    const normalized = markdown.replace(/\s/g, '');
    const isPurposeQuestion =
        normalized.includes('工作证明用途') ||
        /工作证明的?用途/.test(normalized) ||
        /开具工作证明.{0,10}用途/.test(normalized) ||
        /请选择.*工作证明.*用途/.test(normalized);

    if (!isYesNoQuestion && !isPurposeQuestion) {
        return;
    }

    // 2. 提取选项
    const options = [];
    const lines = markdown.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const option = trimmed.substring(2).trim();
            if (option) {
                options.push(option);
            }
        }
    }

    if (options.length === 0) {
        return;
    }

    // 3. 移除 markdown 列表
    const lists = contentElement.querySelectorAll('ul, ol');
    lists.forEach(list => {
        const listItems = Array.from(list.querySelectorAll('li'));
        const listTexts = listItems.map(li => li.textContent.trim());
        const hasMatchingOptions = options.some(opt => listTexts.includes(opt));
        if (hasMatchingOptions) {
            list.remove();
        }
    });

    // 4. 创建按钮容器
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'certificate-options';

    // 5. 创建按钮并绑定事件
    options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'certificate-option-btn';
        btn.textContent = option;
        btn.setAttribute('data-option', option);
        btn.setAttribute('aria-label', `选择选项: ${option}`);

        btn.onclick = function() {
            if (chatState.isProcessing) {
                return;
            }

            optionsContainer.querySelectorAll('.certificate-option-btn').forEach(b => {
                b.disabled = true;
                b.style.opacity = '0.5';
            });

            setTimeout(() => {
                optionsContainer.remove();
            }, 200);

            addMessage(option, 'user');
            sendMessageInternal(option);
        };

        optionsContainer.appendChild(btn);
    });

    // 6. 添加到DOM
    contentElement.appendChild(optionsContainer);
}
```

## CSS样式

```css
/* 选项容器 - 垂直排列 */
.certificate-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
}

/* 选项按钮 */
.certificate-option-btn {
    width: 100%;
    background: var(--suggested-question-btn-bg);
    border: 1px solid var(--suggested-questions-border);
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 14px;
    color: var(--suggested-question-btn-text);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
}

.certificate-option-btn:hover {
    background: var(--primary-color);
    color: #fff;
    border-color: var(--primary-color);
    transform: translateX(2px);
    box-shadow: 0 2px 8px var(--primary-color-shadow);
}

.certificate-option-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
```

## 渲染效果

- ✅ **垂直排列**: 选项按钮垂直排列，每个按钮占满宽度
- ✅ **移除重复**: 自动移除markdown渲染的列表，只显示按钮
- ✅ **点击交互**: 点击按钮后发送该选项作为用户消息
- ✅ **防重复点击**: 点击后立即禁用所有按钮
- ✅ **视觉反馈**: 点击后有200ms延迟移除，让用户看到点击效果

## 相关文件

- `public/js/chat.js` - 前端渲染逻辑
- `public/css/style.css` - 按钮样式定义
