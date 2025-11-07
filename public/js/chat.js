// public/js/chat.js

// 配置marked选项，支持换行符显示（必须在最顶部，在任何使用marked之前）
if (typeof marked !== 'undefined') {
  // 自定义图片渲染器 - 添加加载进度条（兼容新旧签名）
  const renderer = new marked.Renderer();
  renderer.image = function (a, b, c) {
    // 兼容新版(传入 token 对象) 与旧版(传 href,title,text)
    let href, title, text;
    if (a && typeof a === 'object') {
      const token = a;
      href = token.href || (token.attrs && token.attrs.href) || '';
      title = token.title || (token.attrs && token.attrs.title) || '';
      text = token.text || '';
    } else {
      href = a;
      title = b;
      text = c;
    }

    href = typeof href === 'string' ? href : '';
    const altText = text || '图片';
    const titleAttr = title ? `title="${title}"` : '';

    return `
      <div class="image-loading-container" data-src="${href}">
        <div class="image-loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <img class="lazy-loading-image" data-src="${href}" alt="${altText}" ${titleAttr} style="display: none;">
      </div>
    `;
  };

  marked.setOptions({
    renderer: renderer,
    breaks: true, // 支持单个换行符转换为<br>
    gfm: true, // 启用GitHub风格的Markdown
    sanitize: false, // 允许HTML（因为已经在后端处理了安全性）
  });
}

// 统一的 Markdown 预处理与解析
function stripGeneratedImageCaption(md) {
  try {
    if (!md || typeof md !== 'string') return md;
    // 仅当文本包含图片语法时再处理
    if (!md.includes('![')) return md;

    // 移除图片后面跟随的确认文本，支持多种模式（通用匹配，不硬编码具体文本）
    // 匹配模式：已为...图片/图像 （句号可选，全角/半角均可）

    // 1) 紧随在某个图片语法之后的确认文本
    md = md.replace(/(!\[[^\]]*\]\([^\)]+\))\s*(?:\r?\n)+已为[^\n]*?(?:图片|图像)[。．.]?\s*/g, '$1\n');

    // 2) 发生在末尾的确认文本
    md = md.replace(/(?:\r?\n)+已为[^\n]*?(?:图片|图像)[。．.]?\s*$/g, '\n');

    return md;
  } catch (e) {
    console.warn('stripGeneratedImageCaption error:', e);
    return md;
  }
}

// 在流式阶段（onToken/onMessage）临时屏蔽图片渲染，避免反复插入/重绘导致的闪烁
function stripImagesForStreaming(md) {
  try {
    if (!md || typeof md !== 'string') return md;
    // 将 ![alt](url) 替换为三点加载动画占位符
    return md.replace(/!\[[^\]]*\]\([^\)\s]+\)/g,
      '<span class="image-generating-placeholder"><span></span><span></span><span></span></span>');
  } catch (e) {
    console.warn('stripImagesForStreaming error:', e);
    return md;
  }
}

function parseMarkdownCleaned(md, options) {
  const cleaned = stripGeneratedImageCaption(md);
  return marked.parse(cleaned, options);
}

// 预加载图片（仅用于在最终阶段等待首图就绪，避免 UI 从三点到图片的闪烁）
function preloadImage(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    const t = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => { clearTimeout(t); finish(true); };
    img.onerror = () => { clearTimeout(t); finish(false); };
    try { img.crossOrigin = 'anonymous'; } catch (e) {}
    img.src = url;
  });
}

// ==================== 图片加载管理 ====================
// 统一状态缓存：url -> 'loading' | 'loaded' | 'failed'
const __imageStatusMap = new Map();
const IMAGE_STATUS = { loading: 'loading', loaded: 'loaded', failed: 'failed' };

/**
 * 启动图片加载
 * @param {HTMLElement} container - 图片容器元素
 * @param {HTMLImageElement} imgElement - 图片元素
 * @param {string} imageUrl - 图片URL
 */
function startImageLoading(container, imgElement, imageUrl) {
    console.log('[startImageLoading] 开始加载图片', {
        imageUrl: imageUrl,
        hasContainer: !!container,
        hasImgElement: !!imgElement,
        imgComplete: imgElement?.complete,
        imgNaturalWidth: imgElement?.naturalWidth,
        currentImgSrc: imgElement?.src
    });

    // URL 校验与兜底，防止 "[object Object]" 之类无效地址
    if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.startsWith('[object')) {
        console.warn('[startImageLoading] URL无效:', imageUrl);
        container.classList.add('error');
        return;
    }

    // 按状态处理
    const status = __imageStatusMap.get(imageUrl);
    // 已成功：直接校准 src 并显示（避免再次动画）
    if (status === IMAGE_STATUS.loaded) {
        console.log('[startImageLoading] 图片已缓存，直接显示');
        // 确保当前DOM中的<img>也拥有正确的src，否则无法显示
        if (!imgElement.src || imgElement.src !== imageUrl) {
            try { imgElement.decoding = 'async'; } catch (e) {}
            try { imgElement.loading = 'lazy'; } catch (e) {}
            imgElement.src = imageUrl;
        }
        container.dataset.loaded = 'true';
        // 检查是否是历史消息中的图片（通过查找父元素是否有 data-message-id）
        const isFromHistory = container.closest('[data-message-id]') !== null;

        // 如果是历史消息，强制显示图片（即使缓存中已有）
        if (isFromHistory && container.dataset.revealed !== 'true') {
            console.log('[startImageLoading] 历史消息中的已缓存图片，强制显示');
            // 直接设置为可见状态，不使用动画
            imgElement.style.setProperty('display', 'block', 'important');
            imgElement.style.setProperty('opacity', '1', 'important');
            imgElement.style.setProperty('visibility', 'visible', 'important');
            // 标记容器已加载，切换布局为 block
            container.dataset.loaded = 'true';
            container.dataset.revealed = 'true';
        } else if (container.dataset.revealed === 'true') {
            console.log('[startImageLoading] 已展示过，跳过二次显示动画');
        } else {
            setTimeout(() => showImage(container, imgElement), 0);
        }
        return;
    }
    // 已失败：直接失败态
    if (status === IMAGE_STATUS.failed) {
        console.warn('[startImageLoading] 图片之前加载失败');
        container.classList.add('error');
        container.dataset.loaded = 'error';
        return;
    }

    // 设置为 loading（若未设置）
    if (!status) __imageStatusMap.set(imageUrl, IMAGE_STATUS.loading);

    // 防抖：单图完成只执行一次
    let finished = false;
    
    function finalizeSuccess() {
        if (finished) {
            console.log('[startImageLoading] finalizeSuccess 已执行过，跳过');
            return;
        }
        finished = true;
        console.log('[startImageLoading] 图片加载成功，显示图片');
        setTimeout(() => showImage(container, imgElement), 150);
        container.dataset.loaded = 'true';
        __imageStatusMap.set(imageUrl, IMAGE_STATUS.loaded);
    }
    
    function finalizeError() {
        if (finished) {
            console.log('[startImageLoading] finalizeError 已执行过，跳过');
            return;
        }
        finished = true;
        console.error('[startImageLoading] 图片加载失败:', imageUrl);
        container.classList.add('error');
        container.dataset.loaded = 'error';
        __imageStatusMap.set(imageUrl, IMAGE_STATUS.failed);
    }

    // 先绑定事件监听器，确保能捕获所有事件
    const loadHandler = () => {
        console.log('[startImageLoading] 图片 load 事件触发');
        finalizeSuccess();
    };
    
    const errorHandler = (e) => {
        console.error('[startImageLoading] 图片 error 事件触发', {
            error: e,
            imageUrl: imageUrl,
            imgSrc: imgElement.src,
            imgNaturalWidth: imgElement.naturalWidth,
            imgNaturalHeight: imgElement.naturalHeight
        });
        finalizeError();
    };
    
    // 移除旧的监听器（如果有）
    imgElement.removeEventListener('load', loadHandler);
    imgElement.removeEventListener('error', errorHandler);
    
    // 添加新的监听器
    imgElement.addEventListener('load', loadHandler, { once: true });
    imgElement.addEventListener('error', errorHandler, { once: true });

    // 如果图片已经尝试加载但失败（complete为true但naturalWidth为0），需要强制重新加载
    const needsReload = imgElement.complete && imgElement.naturalWidth === 0;
    const srcMismatch = imgElement.src && imgElement.src !== imageUrl;
    
    if (needsReload) {
        console.log('[startImageLoading] 检测到图片已失败，强制重新加载', {
            currentSrc: imgElement.src,
            targetUrl: imageUrl
        });
        // 创建一个新的 Image 对象来预加载
        const newImg = new Image();
        newImg.onload = () => {
            console.log('[startImageLoading] 新图片预加载成功，直接显示');
            // 直接使用新图片的src，这样浏览器会使用缓存
            imgElement.src = newImg.src;
            // 由于已经加载成功，直接显示
            setTimeout(() => {
                finalizeSuccess();
            }, 50);
        };
        newImg.onerror = (e) => {
            console.error('[startImageLoading] 新图片预加载失败', e);
            finalizeError();
        };
        // 设置跨域属性（如果需要）
        try {
            newImg.crossOrigin = 'anonymous';
        } catch (e) {
            // 忽略跨域设置错误
        }
        newImg.src = imageUrl;
        return; // 使用新图片加载，直接返回
    }
    
    if (srcMismatch) {
        console.log('[startImageLoading] src 不匹配，更新 src', {
            currentSrc: imgElement.src,
            targetUrl: imageUrl
        });
    }

    // 超时兜底：若一定时间未触发 load/error，则判失败
    const timeoutMs = 10000; // 10s 超时
    const timeoutId = setTimeout(() => {
        if (!finished) {
            console.warn('[startImageLoading] 超时未完成，标记失败');
            finalizeError();
        }
    }, timeoutMs);

    // 优化解码 & 懒加载
    try { imgElement.decoding = 'async'; } catch (e) {}
    try { imgElement.loading = 'lazy'; } catch (e) {}

    // 触发图片加载（设置/校准 src）
    console.log('[startImageLoading] 设置图片 src:', imageUrl);
    imgElement.src = imageUrl;

    // 如果浏览器支持 decode，尽早完成显示
    if (typeof imgElement.decode === 'function') {
        imgElement.decode()
            .then(() => {
                console.log('[startImageLoading] decode() 成功');
                finalizeSuccess();
            })
            .catch((err) => {
                console.warn('[startImageLoading] decode() 失败:', err);
                // decode失败不代表图片加载失败，继续等待load/error事件
            });
    }
}

/**
 * 显示图片
 * @param {HTMLElement} container - 图片容器
 * @param {HTMLImageElement} imgElement - 图片元素
 */
function showImage(container, imgElement) {
    console.log('[showImage] 显示图片', {
        hasContainer: !!container,
        hasImgElement: !!imgElement,
        imgSrc: imgElement?.src,
        imgNaturalWidth: imgElement?.naturalWidth,
        imgNaturalHeight: imgElement?.naturalHeight,
        currentDisplay: imgElement?.style.display,
        currentOpacity: imgElement?.style.opacity
    });
    
    // 确保图片元素存在且有效
    if (!imgElement || !container) {
        console.error('[showImage] 图片元素或容器不存在');
        return;
    }
    
    // 确保图片有src
    if (!imgElement.src) {
        console.error('[showImage] 图片src为空');
        return;
    }

    // 如果已经展示过（或当前就处于可见状态），不要重复设置动画，避免“再次加载”的视觉效果
    const computed = window.getComputedStyle(imgElement);
    const alreadyVisible = (computed.display !== 'none') && (computed.opacity === '1' || container.dataset.revealed === 'true');
    if (alreadyVisible) {
        console.log('[showImage] 已可见，跳过重复显示');
        container.dataset.revealed = 'true';
        return;
    }
    
    // 显示图片 - 使用 !important 确保样式不被覆盖
    imgElement.style.setProperty('display', 'block', 'important');
    imgElement.style.setProperty('opacity', '0', 'important');
    imgElement.style.setProperty('animation', 'imageReveal 0.4s ease forwards', 'important');
    imgElement.style.setProperty('visibility', 'visible', 'important');

    // 标记容器已加载，这会隐藏加载动画并切换布局为 block
    container.dataset.loaded = 'true';
    
    console.log('[showImage] 图片样式已设置', {
        display: imgElement.style.display,
        opacity: imgElement.style.opacity,
        animation: imgElement.style.animation,
        visibility: imgElement.style.visibility,
        containerDisplay: container.style.display
    });
    
    // 添加一个检查，确保动画结束后图片仍然可见
    setTimeout(() => {
        const finalOpacity = window.getComputedStyle(imgElement).opacity;
        const finalDisplay = window.getComputedStyle(imgElement).display;
        console.log('[showImage] 动画后检查', {
            computedOpacity: finalOpacity,
            computedDisplay: finalDisplay,
            imgSrc: imgElement.src,
            imgNaturalWidth: imgElement.naturalWidth
        });
        
        // 如果图片仍然不可见，强制显示
        if (finalDisplay === 'none' || finalOpacity === '0') {
            console.warn('[showImage] 图片被隐藏，强制显示');
            imgElement.style.setProperty('display', 'block', 'important');
            imgElement.style.setProperty('opacity', '1', 'important');
        }
        container.dataset.revealed = 'true';
    }, 500); // 在动画结束后检查
}

/**
 * 激活所有待加载的图片
 * 在 marked.parse() 渲染后调用
 */
function activateImageLoading() {
    const containers = document.querySelectorAll('.image-loading-container:not([data-activated])');
    
    console.log('[activateImageLoading] 找到图片容器数量:', containers.length);

    containers.forEach((container, index) => {
        // 标记为已激活，避免重复处理
        container.dataset.activated = 'true';

        const imageUrl = container.dataset.src;
        const imgElement = container.querySelector('.lazy-loading-image');

        console.log(`[activateImageLoading] 容器 ${index}:`, {
            imageUrl: imageUrl,
            hasImgElement: !!imgElement,
            containerHTML: container.outerHTML.substring(0, 200)
        });

        if (imageUrl && imgElement) {
            console.log(`[activateImageLoading] 启动图片加载: ${imageUrl}`);
            startImageLoading(container, imgElement, imageUrl);
        } else {
            console.warn(`[activateImageLoading] 容器 ${index} 缺少必要元素:`, {
                imageUrl: imageUrl,
                hasImgElement: !!imgElement
            });
        }
    });
}

// 监听来自 iframe 的登录成功消息
window.addEventListener('message', function(event) {
    // 验证消息来源（安全检查）
    if (event.origin !== window.location.origin) {
        console.warn('[postMessage] 忽略来自非同源的消息:', event.origin);
        return;
    }

    console.log('[postMessage] 收到消息:', event.data);

    // 处理登录成功消息
    if (event.data.type === 'LOGIN_SUCCESS') {
        console.log('[postMessage] 登录成功，用户信息:', event.data);

        // 关闭登录模态框
        hideLoginModal();

        // 更新 UI - 显示用户信息
        updateUserInfo(event.data.userId, event.data.userName, event.data.avatar);

        // 可选：显示成功提示
        console.log('登录成功！欢迎', event.data.userName);
    }
});

// 用户信息全局变量
let userInfo = {
    userId: '',
    name: '',
    department: ''
};

// 认证状态管理
let authState = {
    isLoggedIn: false,
    userName: '',
    userId: '',
    pendingMessage: null  // 待发送的消息
};

// 增强的聊天状态管理
let chatState = {
    conversationId: null,
    isProcessing: false,
    isClearing: false, // 新增：标识是否正在清空对话
    isSwitching: false, // 新增：标识是否正在切换会话
    messageQueue: [],
    currentRequestId: null,
    requestStartTime: null,
    lastResponseTime: null,
    consecutiveErrors: 0,
    connectionStatus: 'idle', // idle, connecting, streaming, error, timeout
    timeoutId: null,
    retryCount: 0,
    maxRetries: 3
};

// 历史消息加载状态管理
let historyLoader = {
    loading: false,
    hasMore: false,
    firstMessageId: null,
    conversationId: null,
    scrollListenerInitialized: false,
    pendingRequest: null  // 跟踪正在进行的请求，防止重复调用
};

// 检查登录状态
async function checkLoginStatus() {
    try {
        const response = await fetch('/auth/session', {
            credentials: 'include'
        });
        const data = await response.json();

        if (data.authenticated) {
            authState.isLoggedIn = true;
            authState.userId = data.userId;
            authState.userName = data.userName || data.userId;
            authState.avatar = data.avatar;

            // 兼容旧的 userInfo 对象
            userInfo.userId = data.userId;
            userInfo.name = data.userName || data.userId;
            userInfo.avatar = data.avatar;

            return true;
        }
        return false;
    } catch (error) {
        console.error('检查登录状态失败:', error);
        return false;
    }
}

// 显示登录（原扫码模态）改为直接跳转到后端登录
function showLoginModal() {
    // 直接跳转到后端登录路由，完成企业微信授权
    // 移除原先的iframe扫码模态框逻辑
    try {
        window.location.href = '/auth/login';
    } catch (e) {
        console.error('跳转到登录失败:', e);
    }
}

// 隐藏登录模态框
function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (!modal) return;
    // 同时处理 class 与内联样式，确保确实隐藏
    modal.classList.add('hidden');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

// 辅助函数：更新头像显示（支持图片或首字母）
function updateAvatarDisplay(container, avatarUrl, userName) {
    if (!container) {
        console.log('[updateAvatarDisplay] 容器为空');
        return;
    }

    console.log('[updateAvatarDisplay] 更新头像显示:', {
        containerId: container.id,
        avatarUrl: avatarUrl,
        userName: userName
    });

    // 清空容器
    container.innerHTML = '';

    if (avatarUrl) {
        // 有头像URL，显示图片
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = userName;
        img.className = 'w-full h-full object-cover rounded-full';

        // 图片加载成功时打印日志
        img.onload = function() {
            console.log('[updateAvatarDisplay] 头像图片加载成功:', avatarUrl);
        };

        // 图片加载失败时，fallback 到首字母
        img.onerror = function() {
            console.log('[updateAvatarDisplay] 头像图片加载失败，使用首字母:', avatarUrl);
            container.innerHTML = '';
            const span = document.createElement('span');
            span.textContent = userName.charAt(0).toUpperCase();
            container.appendChild(span);
        };

        container.appendChild(img);
    } else {
        // 无头像，显示首字母
        console.log('[updateAvatarDisplay] 无头像URL，使用首字母');
        const span = document.createElement('span');
        span.textContent = userName.charAt(0).toUpperCase();
        container.appendChild(span);
    }
}

// 辅助函数：更新用户信息显示
function updateUserInfo(userId, userName, avatar = null) {
    console.log('[updateUserInfo] 更新用户信息:', { userId, userName, avatar });

    // 更新全局状态
    authState.isLoggedIn = true;
    authState.userId = userId;
    authState.userName = userName;
    authState.avatar = avatar;

    // 同时更新旧的 userInfo 对象（用于欢迎消息等）
    userInfo.userId = userId;
    userInfo.name = userName;
    userInfo.avatar = avatar;

    // 更新用户名显示
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
        userNameEl.textContent = userName;
    }

    // 更新用户头像（优先显示真实头像，无头像时显示首字母）
    const userAvatarEl = document.getElementById('userAvatar');
    if (userAvatarEl) {
        updateAvatarDisplay(userAvatarEl, avatar, userName);
    }

    // 显示用户信息容器（包含头像、用户名、下拉菜单）
    const userInfoContainer = document.getElementById('userInfo');
    if (userInfoContainer) {
        userInfoContainer.classList.remove('hidden');
    }

    // 隐藏登录按钮
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.classList.add('hidden');
    }

    // 同步 sidebar 用户信息
    if (typeof syncSidebarUserInfo === 'function') {
        syncSidebarUserInfo();
    }

    console.log('[updateUserInfo] UI 更新完成');
}

// 处理企业微信登录已通过 iframe 自动处理，不再需要此函数

// 登录成功后的处理
async function onLoginSuccess() {
    console.log('登录成功:', authState.userName);

    // 更新 UI
    updateUIForLoginState(true);

    // 加载会话列表到 sidebar
    await loadConversationList();

    // 如果有待发送的消息,继续发送
    if (authState.pendingMessage) {
        const message = authState.pendingMessage;
        authState.pendingMessage = null;

        // 添加到界面
        addMessage(message, 'user');

        // 清空输入框(如果还有内容)
        const input = document.getElementById('messageInput');
        input.value = '';
        if (typeof resetInputHeight === 'function') {
            resetInputHeight();
        }

        // 发送
        await sendMessageInternal(message);
    }
}

// 初始化用户信息 UI
function initUserInfoUI() {
    const loginButton = document.getElementById('loginButton');
    const userInfoBtn = document.getElementById('userInfoBtn');
    const userMenu = document.getElementById('userMenu');
    const logoutBtn = document.getElementById('logoutBtn');

    // 登录按钮点击
    if (loginButton) {
        loginButton.addEventListener('click', showLoginModal);
    }

    // 用户信息按钮点击
    if (userInfoBtn) {
        userInfoBtn.addEventListener('click', () => {
            userMenu.classList.toggle('hidden');
        });
    }

    // 点击外部关闭菜单
    document.addEventListener('click', (e) => {
        const userInfo = document.getElementById('userInfo');
        if (userInfo && !userInfo.contains(e.target)) {
            userMenu.classList.add('hidden');
        }
    });

    // 登出按钮点击
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// 更新 UI 根据登录状态
function updateUIForLoginState(isLoggedIn) {
    const loginButton = document.getElementById('loginButton');
    const userInfo = document.getElementById('userInfo');
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');

    if (isLoggedIn) {
        // 显示用户信息
        if (loginButton) loginButton.classList.add('hidden');
        if (userInfo) userInfo.classList.remove('hidden');

        // 更新用户名
        if (userNameEl) userNameEl.textContent = authState.userName || authState.userId;

        // 更新头像（优先显示真实头像，无头像时显示首字母）
        if (userAvatarEl) {
            updateAvatarDisplay(userAvatarEl, authState.avatar, authState.userName || authState.userId);
        }
    } else {
        // 显示登录按钮
        if (loginButton) loginButton.classList.remove('hidden');
        if (userInfo) userInfo.classList.add('hidden');
    }

    // 同步 sidebar 用户信息
    if (typeof syncSidebarUserInfo === 'function') {
        syncSidebarUserInfo();
    }
}

// 处理登出
async function handleLogout() {
    try {
        const response = await fetch('/auth/logout?redirect=json', {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            // 清除认证状态
            authState.isLoggedIn = false;
            authState.userId = '';
            authState.userName = '';
            authState.pendingMessage = null;

            // 清除 localStorage（保留告知书同意状态）
            const agreementAccepted = localStorage.getItem('service-agreement-accepted');
            const sidebarCollapsed = localStorage.getItem('sidebarCollapsed');
            localStorage.clear();
            // 恢复告知书同意状态和侧边栏状态
            if (agreementAccepted) {
                localStorage.setItem('service-agreement-accepted', agreementAccepted);
            }
            if (sidebarCollapsed) {
                localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
            }

            // 更新 UI
            updateUIForLoginState(false);

            // 同步 sidebar 用户信息
            if (typeof syncSidebarUserInfo === 'function') {
                syncSidebarUserInfo();
            }

            // 清空聊天区域
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.innerHTML = '';

            // 重置会话状态
            chatState.conversationId = null;

            // 显示欢迎界面
            if (typeof initializeWelcomeInterface === 'function') {
                await initializeWelcomeInterface();
            }

            console.log('登出成功');

            // 重定向到主页（优先使用服务端注入配置）
            const redirectUrl = (window.APP_CONFIG && window.APP_CONFIG.HOME_URL) || (window.location.origin + '/');
            console.log('重定向到:', redirectUrl);
            setTimeout(() => {
                window.location.href = redirectUrl;
            }, 1500);  // 延迟1.5秒，让用户看到状态更新
        } else {
            throw new Error('登出失败');
        }
    } catch (error) {
        console.error('登出错误:', error);
        alert('登出失败,请重试');
    }
}

// (已废弃) 旧的加载最近会话函数已移除，新流程使用 loadConversationList() 和 switchToConversation()

// === 会话列表管理 ===

// 保存从后端获取的完整会话列表，供搜索过滤使用
const conversationListState = {
    all: [], // 完整列表
};

// 根据搜索框关键字过滤并渲染会话列表
function applySidebarSearch() {
    const threadList = document.getElementById('thread-list');
    if (!threadList) return;

    const keyword = (document.getElementById('inp-search')?.value || '').trim().toLowerCase();
    if (!keyword) {
        renderConversationList(conversationListState.all);
        return;
    }

    const filtered = conversationListState.all.filter(conv => {
        const title = (conv.title || '新对话').toLowerCase();
        return title.includes(keyword);
    });
    renderConversationList(filtered);
}

/**
 * 加载用户的会话列表
 */
async function loadConversationList() {
    console.log('开始加载会话列表...');

    try {
        const response = await fetch('/api/conversations', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (response.status === 401) {
            console.log('未登录,跳过加载会话列表');
            // 移除skeleton
            const skeleton = document.getElementById('conversation-skeleton');
            if (skeleton) {
                skeleton.remove();
            }
            return false;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('会话列表数据:', data);

        if (data.status === 'ok' && data.conversations) {
            // 保存列表到本地状态并按当前关键字渲染
            conversationListState.all = data.conversations;
            applySidebarSearch();
            console.log(`成功加载 ${data.conversations.length} 个会话`);
            return true;
        } else {
            console.log('没有找到会话列表');
            conversationListState.all = [];
            applySidebarSearch();
            return false;
        }
    } catch (error) {
        console.error('加载会话列表失败:', error);
        // 即使失败也要移除skeleton
        const skeleton = document.getElementById('conversation-skeleton');
        if (skeleton) {
            skeleton.remove();
        }
        return false;
    }
}

/**
 * 渲染会话列表到 sidebar
 * @param {Array} conversations - 会话列表数据
 */
function renderConversationList(conversations) {
    const threadList = document.getElementById('thread-list');
    if (!threadList) {
        console.error('找不到 thread-list 容器');
        return;
    }

    // 移除骨架屏
    const skeleton = document.getElementById('conversation-skeleton');
    if (skeleton) {
        skeleton.remove();
    }

    // 清空现有列表
    threadList.innerHTML = '';

    if (!conversations || conversations.length === 0) {
        // 显示空状态
        const emptyState = document.createElement('div');
        emptyState.className = 'text-center py-8 text-gray-400 text-sm';
        emptyState.innerHTML = `
            <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            <p>暂无对话</p>
        `;
        threadList.appendChild(emptyState);
        return;
    }

    // 渲染每个会话
    conversations.forEach(conv => {
        const sessionItem = createConversationListItem(conv);
        threadList.appendChild(sessionItem);
    });
}

/**
 * 创建单个会话列表项的 DOM 元素
 * @param {Object} conversation - 会话数据
 * @returns {HTMLElement} 会话列表项元素
 */
function createConversationListItem(conversation) {
    const item = document.createElement('div');
    item.className = 'session-item group relative px-2 py-1 mb-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors';
    item.setAttribute('data-conversation-id', conversation.conversationId);

    // 格式化时间（暂时不显示，但保留变量避免模板字符串错误）
    const timeStr = ''; // formatConversationTime(conversation.updatedAt || conversation.createdAt);

    // 截断标题
    const title = conversation.title || '新对话';
    const truncatedTitle = title.length > 20 ? title.substring(0, 20) + '...' : title;

    item.innerHTML = `
        <!-- 会话内容区域 -->
        <div class="session-content flex items-center cursor-pointer">
            <div class="flex-1 min-w-0 flex items-center justify-between">
                <div class="flex-1 min-w-0 session-text-container">
                    <div class="session-title text-sm font-medium text-gray-800 dark:text-gray-200 truncate">${truncatedTitle}</div>
                </div>

                <!-- 操作按钮（hover显示）-->
                <div class="session-actions hidden group-hover:flex items-center gap-1 ml-2 flex-shrink-0">
                    <button class="rename-btn p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" title="重命名" aria-label="重命名">
                        <svg class="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                    </button>
                    <button class="delete-btn p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors" title="删除" aria-label="删除">
                        <svg class="w-4 h-4 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>

        <!-- 重命名输入框（默认隐藏）-->
        <div class="rename-input-container hidden">
            <div class="flex items-center gap-2 w-full">
                <input type="text"
                       class="rename-input flex-1 px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                       value="${title}"
                       maxlength="50"
                       placeholder="输入会话名称">
                <button class="confirm-rename-btn p-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors" title="确认" aria-label="确认">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                </button>
                <button class="cancel-rename-btn p-1 rounded bg-gray-300 hover:bg-gray-400 text-gray-700 transition-colors" title="取消" aria-label="取消">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        </div>
    `;

    // 绑定点击会话内容区域事件（切换会话）
    const sessionContent = item.querySelector('.session-content');
    sessionContent.addEventListener('click', async (e) => {
        // 如果点击的是按钮，不触发切换会话
        if (e.target.closest('.rename-btn') || e.target.closest('.delete-btn')) {
            return;
        }
        console.log('点击会话:', conversation.conversationId);
        await switchToConversation(conversation.conversationId);
    });

    // 绑定重命名按钮事件
    const renameBtn = item.querySelector('.rename-btn');
    renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showRenameInput(item, conversation.conversationId);
    });

    // 绑定删除按钮事件
    const deleteBtn = item.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await showDeleteConfirmation(conversation.conversationId, title);
    });

    return item;
}

/**
 * 格式化会话时间显示
 * @param {number|string} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatConversationTime(timestamp) {
    if (!timestamp) return '';

    // Coze API 返回秒级时间戳(10位)，JavaScript Date 需要毫秒级(13位)
    // 判断：如果时间戳小于10000000000，说明是秒级，需要乘以1000转换为毫秒
    const timestampMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;

    const date = new Date(timestampMs);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    // 超过7天显示具体日期
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
}

/**
 * 显示重命名输入框
 * @param {HTMLElement} item - 会话列表项元素
 * @param {string} conversationId - 会话ID
 */
function showRenameInput(item, conversationId) {
    console.log('显示重命名输入框:', conversationId);

    // 隐藏会话内容区域
    const sessionContent = item.querySelector('.session-content');
    sessionContent.classList.add('hidden');

    // 显示重命名输入框
    const renameContainer = item.querySelector('.rename-input-container');
    renameContainer.classList.remove('hidden');

    // 获取输入框并聚焦
    const input = item.querySelector('.rename-input');
    input.focus();
    input.select();

    // 绑定确认按钮事件
    const confirmBtn = item.querySelector('.confirm-rename-btn');
    const handleConfirm = async () => {
        const newName = input.value.trim();
        await confirmRename(item, conversationId, newName);
    };

    // 移除旧的事件监听器（如果存在）
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    const newConfirmBtn = item.querySelector('.confirm-rename-btn');
    newConfirmBtn.addEventListener('click', handleConfirm);

    // 绑定取消按钮事件
    const cancelBtn = item.querySelector('.cancel-rename-btn');
    const handleCancel = () => {
        cancelRename(item);
    };

    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    const newCancelBtn = item.querySelector('.cancel-rename-btn');
    newCancelBtn.addEventListener('click', handleCancel);

    // 绑定键盘事件
    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    input.addEventListener('keydown', handleKeydown);

    // 保存事件处理器引用，用于清理
    item._renameHandlers = { handleConfirm, handleCancel, handleKeydown };
}

/**
 * 确认重命名
 * @param {HTMLElement} item - 会话列表项元素
 * @param {string} conversationId - 会话ID
 * @param {string} newName - 新名称
 */
async function confirmRename(item, conversationId, newName) {
    if (!newName || newName.trim() === '') {
        alert('会话名称不能为空');
        return;
    }

    if (newName.length > 50) {
        alert('会话名称不能超过50个字符');
        return;
    }

    console.log('确认重命名:', conversationId, '新名称:', newName);

    try {
        // 显示加载状态
        const input = item.querySelector('.rename-input');
        const confirmBtn = item.querySelector('.confirm-rename-btn');
        input.disabled = true;
        confirmBtn.disabled = true;

        const response = await fetch(`/api/conversations/${conversationId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ name: newName })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '重命名失败');
        }

        const data = await response.json();
        console.log('重命名成功:', data);

        // 更新 UI
        const titleEl = item.querySelector('.session-title');
        const truncatedTitle = newName.length > 20 ? newName.substring(0, 20) + '...' : newName;
        titleEl.textContent = truncatedTitle;

        // 更新输入框的值（完整标题）
        input.value = newName;

        // 隐藏输入框，显示会话内容
        cancelRename(item);

        console.log('UI更新完成');

    } catch (error) {
        console.error('重命名失败:', error);
        alert('重命名失败：' + error.message);

        // 恢复按钮状态
        const input = item.querySelector('.rename-input');
        const confirmBtn = item.querySelector('.confirm-rename-btn');
        input.disabled = false;
        confirmBtn.disabled = false;
    }
}

/**
 * 取消重命名
 * @param {HTMLElement} item - 会话列表项元素
 */
function cancelRename(item) {
    console.log('取消重命名');

    // 隐藏重命名输入框
    const renameContainer = item.querySelector('.rename-input-container');
    renameContainer.classList.add('hidden');

    // 显示会话内容区域
    const sessionContent = item.querySelector('.session-content');
    sessionContent.classList.remove('hidden');

    // 恢复输入框状态
    const input = item.querySelector('.rename-input');
    input.disabled = false;
    const confirmBtn = item.querySelector('.confirm-rename-btn');
    confirmBtn.disabled = false;
}

/**
 * 显示删除确认模态框
 * @param {string} conversationId - 会话ID
 * @param {string} title - 会话标题
 */
async function showDeleteConfirmation(conversationId, title) {
    console.log('显示删除确认模态框:', conversationId, title);

    const modal = document.getElementById('deleteConfirmModal');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const closeBtn = document.getElementById('closeDeleteModal');

    if (!modal) {
        console.error('删除确认模态框未找到');
        return;
    }

    // 显示模态框
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // 禁止页面滚动
    document.body.style.overflow = 'hidden';

    // 定义关闭模态框的函数
    const closeModal = () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';

        // 清理事件监听器
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', closeModal);
        closeBtn.removeEventListener('click', closeModal);
        modal.removeEventListener('click', handleBackdropClick);
    };

    // 确认删除的处理函数
    const handleConfirm = async () => {
        closeModal();
        await confirmDelete(conversationId);
    };

    // 点击遮罩层关闭
    const handleBackdropClick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };

    // 绑定事件监听器
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', handleBackdropClick);
}

/**
 * 确认删除会话
 * @param {string} conversationId - 会话ID
 */
async function confirmDelete(conversationId) {
    console.log('确认删除会话:', conversationId);

    try {
        const response = await fetch(`/api/conversations/${conversationId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '删除失败');
        }

        const data = await response.json();
        console.log('删除成功:', data);

        // 从 DOM 中移除会话项
        const item = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (item) {
            item.remove();
        }

        // 如果删除的是当前会话，切换到新会话或清空聊天区
        if (chatState.conversationId === conversationId) {
            console.log('删除的是当前会话，需要切换');

            // 尝试切换到第一个可用的会话
            const firstSession = document.querySelector('.session-item');
            if (firstSession) {
                const firstConversationId = firstSession.getAttribute('data-conversation-id');
                await switchToConversation(firstConversationId);
            } else {
                // 没有其他会话，创建新会话
                console.log('没有其他会话，创建新会话');
                await createNewConversation(true);
            }
        }

        console.log('删除完成');

    } catch (error) {
        console.error('删除会话失败:', error);
        alert('删除失败：' + error.message);
    }
}

/**
 * 创建新会话
 * @param {boolean} showWelcome - 是否显示开场白和预置问题
 * @param {string|null} customTitle - 自定义会话标题，如果为null则传空字符串让Coze决定
 * @returns {Promise<string|null>} 返回新创建的会话ID，失败返回null
 */
async function createNewConversation(showWelcome = true, customTitle = null) {
    const title = customTitle || ''; // 有自定义标题就用，否则传空字符串
    console.log('开始创建新会话...', { showWelcome, title });

    try {
        // 调用后端 API 创建会话
        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                title: title
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('创建会话成功:', data);

        if (data.status === 'ok' && data.conversation) {
            const newConversationId = data.conversation.conversationId;

            // 更新当前会话ID
            chatState.conversationId = newConversationId;
            console.log('已设置新会话ID:', newConversationId);

            // 根据参数决定是否显示开场白
            if (showWelcome) {
                // 清空聊天区域并显示开场白
                clearChatArea();
                console.log('显示开场白和预置问题');
                await initializeWelcomeInterface();
            } else {
                // 不清空聊天区域 - 用户消息已经显示
                console.log('跳过显示开场白（自动创建模式）');
            }

            // 刷新会话列表
            await loadConversationList();

            // 高亮新创建的会话
            highlightConversation(newConversationId);

            return newConversationId;
        } else {
            throw new Error('创建会话失败：返回数据格式错误');
        }
    } catch (error) {
        console.error('创建新会话失败:', error);
        alert('创建新会话失败，请重试');
        return null;
    }
}

/**
 * 清空聊天区域
 */
function clearChatArea() {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
        chatContainer.innerHTML = '';
    }

    // 重置历史加载器状态
    historyLoader.conversationId = null;
    historyLoader.hasMore = false;
    historyLoader.firstMessageId = null;

    console.log('聊天区域已清空');
}

/**
 * 高亮指定的会话
 * @param {string} conversationId - 会话ID
 */
function highlightConversation(conversationId) {
    // 移除所有会话的高亮
    const allItems = document.querySelectorAll('.session-item');
    allItems.forEach(item => {
        item.classList.remove('bg-blue-50', 'dark:bg-blue-900');
    });

    // 添加高亮到指定会话
    const targetItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (targetItem) {
        targetItem.classList.add('bg-blue-50', 'dark:bg-blue-900');
        // 滚动到可见区域
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * 切换到指定会话
 * @param {string} conversationId - 会话ID
 */
async function switchToConversation(conversationId) {
    console.log('切换到会话:', conversationId);

    try {
        // 设置切换标志，防止旧会话的回调创建消息
        chatState.isSwitching = true;
        console.log('[switchToConversation] 设置切换标志 isSwitching = true');

        // 1. 如果当前会话正在处理消息，先清理状态和连接
        if (chatState.isProcessing || chatState.connectionStatus !== 'idle') {
            console.log('[switchToConversation] 当前会话正在处理中，先清理状态', {
                isProcessing: chatState.isProcessing,
                connectionStatus: chatState.connectionStatus,
                currentConversationId: chatState.conversationId
            });

            // 关闭所有活跃的EventSource连接
            const connectionStatus = cozeClient.eventSourceManager.getConnectionStatus();
            console.log('[switchToConversation] 活跃连接数:', connectionStatus.activeConnections);

            if (connectionStatus.activeConnections > 0) {
                // 遍历并关闭所有连接
                connectionStatus.connectionIds.forEach(requestId => {
                    console.log('[switchToConversation] 关闭连接:', requestId);
                    cozeClient.eventSourceManager.cleanupConnection(requestId);
                });
            }

            // 清理超时计时器
            if (chatState.timeoutId) {
                clearTimeout(chatState.timeoutId);
                chatState.timeoutId = null;
                console.log('[switchToConversation] 已清理超时计时器');
            }

            // 重置流式响应状态
            chatState.isProcessing = false;
            chatState.connectionStatus = 'idle';
            chatState.currentRequestId = null;
            chatState.requestStartTime = null;

            console.log('[switchToConversation] 状态已重置');
        }

        // 2. 更新当前会话ID
        chatState.conversationId = conversationId;

        // 3. 清空聊天区域
        clearChatArea();

        // 3.5. 切换到对话布局
        activateConversationLayout();

        // 4. 高亮当前会话
        highlightConversation(conversationId);

        // 5. 更新发送按钮状态（确保新会话的按钮状态正确）
        // 注意：updateSendButtonState 是在 setupMessageInput 中定义的内部函数
        // 我们需要通过触发 input 事件来更新按钮状态
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            // 触发 input 事件来更新按钮状态
            messageInput.dispatchEvent(new Event('input'));
        }

        // 6. 加载该会话的历史消息
        await loadConversationHistory(conversationId);

        // 清除切换标志
        chatState.isSwitching = false;
        console.log('[switchToConversation] 会话切换成功，清除切换标志 isSwitching = false');

        // 移动端点击后自动关闭侧边栏
        if (window.mobileSidebar?.isMobile?.() && window.mobileSidebar?.close) {
            setTimeout(() => {
                window.mobileSidebar?.close();
            }, 50);
        }
    } catch (error) {
        console.error('[switchToConversation] 切换会话失败:', error);
        // 即使出错也要清除切换标志
        chatState.isSwitching = false;
        console.log('[switchToConversation] 切换失败，清除切换标志 isSwitching = false');
        alert('加载会话失败，请重试');
    }
}

/**
 * 加载会话的历史消息
 * @param {string} conversationId - 会话ID
 */
async function loadConversationHistory(conversationId) {
    console.log('加载会话历史消息:', conversationId);

    try {
        const response = await fetch(`/api/conversations/${conversationId}/history?limit=20`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('历史消息数据:', data);

        if (data.status === 'ok' && data.messages) {
            // 设置历史加载器状态
            historyLoader.conversationId = conversationId;
            historyLoader.hasMore = data.hasMore || false;
            historyLoader.firstMessageId = data.firstId || null;

            console.log('历史加载器状态:', {
                conversationId: historyLoader.conversationId,
                hasMore: historyLoader.hasMore,
                firstMessageId: historyLoader.firstMessageId
            });

            // 渲染历史消息
            const chatContainer = document.getElementById('chatContainer');
            data.messages.forEach(msg => {
                if (msg.content && msg.content.trim()) {
                    const messageDiv = document.createElement('div');
                    messageDiv.setAttribute('data-message-id', msg.id);

                    if (msg.role === 'user') {
                        messageDiv.className = 'message user-message';
                        const contentDiv = document.createElement('div');
                        contentDiv.className = 'message-content';
                        contentDiv.textContent = msg.content;
                        messageDiv.appendChild(contentDiv);
                    } else if (msg.role === 'assistant') {
                        messageDiv.className = 'message assistant-message';

                        const messageWrapper = document.createElement('div');
                        messageWrapper.className = 'message-wrapper';

                        const avatarDiv = document.createElement('div');
                        avatarDiv.className = 'avatar assistant-avatar';
                        const img = document.createElement('img');
                        img.src = '/img/max2.jpg';
                        img.alt = '机器人';
                        img.className = 'robot-avatar-img';
                        avatarDiv.appendChild(img);

                        const contentArea = document.createElement('div');
                        contentArea.className = 'content-area';

                        const contentDiv = document.createElement('div');
                        contentDiv.className = 'message-content';

                        // 使用marked渲染Markdown
                        try {
                            contentDiv.innerHTML = parseMarkdownCleaned(msg.content, { breaks: true, gfm: true });

                            // 重置历史消息中的图片容器状态，允许重新激活
                            // 注意：不在这里调用 activateImageLoading()，因为此时元素还未添加到 DOM
                            contentDiv.querySelectorAll('.image-loading-container').forEach(imgContainer => {
                                imgContainer.removeAttribute('data-activated');
                                imgContainer.removeAttribute('data-revealed');
                            });

                            // 处理代码块的复制功能
                            contentDiv.querySelectorAll('pre code').forEach(block => {
                                const wrapper = document.createElement('div');
                                wrapper.className = 'code-block-wrapper';
                                block.parentNode.insertBefore(wrapper, block);
                                wrapper.appendChild(block);

                                const copyBtn = document.createElement('button');
                                copyBtn.className = 'copy-code-btn';
                                copyBtn.textContent = '复制代码';
                                copyBtn.onclick = function() {
                                    navigator.clipboard.writeText(block.textContent).then(() => {
                                        copyBtn.textContent = '已复制！';
                                        setTimeout(() => {
                                            copyBtn.textContent = '复制代码';
                                        }, 2000);
                                    });
                                };
                                wrapper.appendChild(copyBtn);
                            });
                        } catch (e) {
                            console.error('Markdown解析失败:', e);
                            contentDiv.textContent = msg.content;
                        }

                        contentArea.appendChild(contentDiv);
                        messageWrapper.appendChild(avatarDiv);
                        messageWrapper.appendChild(contentArea);
                        messageDiv.appendChild(messageWrapper);
                    }

                    chatContainer.appendChild(messageDiv);
                }
            });

            // 所有消息已添加到DOM，现在激活图片加载
            activateImageLoading();

            // 滚动到底部
            scrollToBottom();

            // 初始化滚动监听
            if (!historyLoader.scrollListenerInitialized) {
                initScrollListener();
                historyLoader.scrollListenerInitialized = true;
            }

            console.log(`成功加载 ${data.messages.length} 条历史消息`);
        }
    } catch (error) {
        console.error('加载历史消息失败:', error);
        throw error;
    }
}

// === 语音转文字相关 ===
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const micButton = document.getElementById('micButton');
const waveform = document.getElementById('waveform');
const messageInput = document.getElementById('messageInput');

// 全局函数：更新按钮显示状态（根据输入内容切换麦克风和发送按钮）
function updateButtonsVisibility() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const micButton = document.getElementById('micButton');
    
    if (!messageInput || !sendButton || !micButton) return;
    
    const message = messageInput.value.trim();
    if (message) {
        // 有文本时显示发送按钮，隐藏麦克风
        micButton.style.display = 'none';
        sendButton.style.display = 'flex';
    } else {
        // 无文本时显示麦克风，隐藏发送按钮
        micButton.style.display = 'flex';
        sendButton.style.display = 'none';
    }
}

// 录音动画区域相关
let recordingStartTime = null;
let recordingEndTime = null;
let recordingTimer = null;
let audioBlobTemp = null;

let isCancelled = false;

function formatTime(sec) {
    sec = Math.floor(sec);
    return sec < 10 ? `0:0${sec}` : `0:${sec}`;
}

function showRecordingPanel() {
    // 隐藏输入区域，显示录音动画区域
    document.getElementById('inputContainer').style.display = 'none';
    const panel = document.getElementById('recordingPanel');
    panel.style.display = 'flex';
    panel.innerHTML = `
        <button class="record-cancel" id="recordCancelBtn" title="取消录音">
            <img src="/img/cross.svg" alt="取消" width="24" height="24">
        </button>
        <div class="record-waveform" id="recordWaveform"></div>
        <span class="record-timer" id="recordTimer">0:00</span>
        <button class="record-confirm" id="recordConfirmBtn" title="确定">
            <img src="/img/check.svg" alt="确定" width="24" height="24">
        </button>
    `;
    startWaveformAnimation();
    startTimer();
    // 绑定按钮事件
    document.getElementById('recordCancelBtn').onclick = cancelRecordingPanel;
    document.getElementById('recordConfirmBtn').onclick = confirmRecordingPanel;
}

function hideRecordingPanel() {
    document.getElementById('inputContainer').style.display = '';
    const panel = document.getElementById('recordingPanel');
    panel.style.display = 'none';
    panel.innerHTML = '';
    stopWaveformAnimation();
    stopTimer();
}

// 录音时长计时
function startTimer() {
    recordingStartTime = Date.now();
    const timerEl = document.getElementById('recordTimer');
    recordingTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - recordingStartTime) / 1000);
        if (timerEl) timerEl.textContent = formatTime(sec);
    }, 200);
}

function stopTimer() {
    clearInterval(recordingTimer);
    recordingTimer = null;
}

// 柱状波形动画（简单实现，可升级）
let waveformInterval = null;

function startWaveformAnimation() {
    const el = document.getElementById('recordWaveform');
    if (!el) return;

    // 创建滚动容器
    const container = document.createElement('div');
    container.className = 'wave-container';
    el.innerHTML = '';
    el.appendChild(container);

    // 创建两组波形条以实现无缝滚动
    const createWaveSet = () => {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 60; i++) {
            const bar = document.createElement('div');
            bar.className = 'wave-bar';
            // 随机高度类
            const heights = ['short', 'medium', 'tall'];
            bar.classList.add(heights[Math.floor(Math.random() * heights.length)]);
            // 随机激活某些波形条
            if (Math.random() > 0.7) {
                bar.classList.add('active');
            }
            fragment.appendChild(bar);
        }
        return fragment;
    };

    // 添加两组波形以实现无缝循环
    container.appendChild(createWaveSet());
    container.appendChild(createWaveSet());

    // 定期更新波形高度，模拟实时音频
    waveformInterval = setInterval(() => {
        const bars = container.querySelectorAll('.wave-bar');
        bars.forEach((bar, index) => {
            // 每隔几个条更新一次
            if (index % 3 === 0) {
                const heights = ['short', 'medium', 'tall'];
                bar.className = 'wave-bar ' + heights[Math.floor(Math.random() * heights.length)];
                if (Math.random() > 0.8) {
                    bar.classList.add('active');
                }
            }
        });
    }, 200);
}

function stopWaveformAnimation() {
    clearInterval(waveformInterval);
    waveformInterval = null;
}

// 录音按钮事件重写
if (micButton) {
    micButton.onclick = function () {
        // 录音功能在AI回复期间仍可用，只是转录文字到输入框
        // 真正的发送控制由发送按钮决定
        showRecordingPanel();
        startRecording();
    };
}

// 插入pending语音气泡，返回气泡DOM节点
function insertPendingVoiceMessage() {
    const chatContainer = document.getElementById('chatContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message voice-message pending';
    messageDiv.innerHTML = `
        <span class="voice-duration">--"</span>
        <button class="voice-play-btn" disabled>
            <i class="fa fa-spinner fa-spin"></i>
        </button>
        <span class="voice-pending-text">正在听你说...</span>
    `;
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

// 更新pending气泡为可播放语音气泡
function updateVoiceMessageBubble(messageDiv, audioUrl, durationSec) {
    messageDiv.classList.remove('pending');
    // 计算宽度
    const width = Math.min(60 + durationSec * 8, 220);
    messageDiv.style.width = width + 'px';
    messageDiv.innerHTML = `
        <div class="voice-bubble-content">
            <span class="voice-duration">${durationSec}"</span>
            <span class="voice-wave">${getStaticWaveSVG()}</span>
        </div>
        <audio src="${audioUrl}" preload="auto"></audio>
    `;
    const audio = messageDiv.querySelector('audio');
    const wave = messageDiv.querySelector('.voice-wave');
    messageDiv.onclick = function () {
        if (messageDiv.classList.contains('playing')) return;
        audio.play();
    };
    audio.onplay = function () {
        messageDiv.classList.add('playing');
        wave.innerHTML = getDynamicWaveSVG();
    };
    audio.onended = audio.onpause = function () {
        messageDiv.classList.remove('playing');
        wave.innerHTML = getStaticWaveSVG();
    };
}

function getStaticWaveSVG() {
    return `<svg width="24" height="24" viewBox="0 0 24 24"><path d="M7 12h2M11 9v6M15 7v10M19 5v14" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`;
}

function getDynamicWaveSVG() {
    return `<svg width="24" height="24" viewBox="0 0 24 24"><g><path d="M7 12h2" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"><animate attributeName="opacity" values="1;0.3;1" dur="0.7s" repeatCount="indefinite"/></path><path d="M11 9v6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"><animate attributeName="opacity" values="1;0.3;1" dur="0.7s" begin="0.2s" repeatCount="indefinite"/></path><path d="M15 7v10" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"><animate attributeName="opacity" values="1;0.3;1" dur="0.7s" begin="0.4s" repeatCount="indefinite"/></path><path d="M19 5v14" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"><animate attributeName="opacity" values="1;0.3;1" dur="0.7s" begin="0.6s" repeatCount="indefinite"/></path></g></svg>`;
}

// 获取音频时长
function getAudioDuration(audioBlob, callback) {
    const audio = document.createElement('audio');
    audio.src = URL.createObjectURL(audioBlob);
    audio.addEventListener('loadedmetadata', function () {
        let durationSec = Math.round(audio.duration);
        // 有效性判断，防止Infinity或NaN
        if (!isFinite(durationSec) || durationSec < 1) {
            if (recordingStartTime && recordingEndTime) {
                durationSec = Math.max(1, Math.round((recordingEndTime - recordingStartTime) / 1000));
            } else {
                durationSec = 1;
            }
        }
        callback(durationSec);
    });
}

// 录音确认后插入pending气泡，音频生成后更新气泡内容
let pendingVoiceDiv = null;

function confirmRecordingPanel() {
    hideRecordingPanel();
    // 不创建语音气泡，直接停止录音并处理
    if (isRecording && mediaRecorder) {
        mediaRecorder.stop();
    } else if (audioBlobTemp) {
        // 兼容直接有音频的情况
        handleVoiceBubbleAfterAudio(audioBlobTemp);
    }
}

function stopRecordingAndShowPanel(audioBlob) {
    audioBlobTemp = audioBlob;
    handleVoiceBubbleAfterAudio(audioBlobTemp);
}

function handleVoiceBubbleAfterAudio(audioBlob) {
    // 直接上传音频并获取转录文字，显示在输入框中，不创建语音气泡
    uploadAudioBlob(audioBlob).then(result => {
        // result可能是文本字符串或者包含错误标记的对象
        if (typeof result === 'object' && result.hasError) {
            // 已经在uploadAudioBlob中显示了错误toast，这里不再重复显示
            return;
        }
        
        const text = result;
        if (text && text.trim()) {
            // 将转录文字填充到输入框
            const messageInput = document.getElementById('messageInput');
            messageInput.value = text;
            // 触发input事件以调整输入框高度
            messageInput.dispatchEvent(new Event('input'));
            // 将焦点设置到输入框
            messageInput.focus();
        } else {
            // 只有在没有错误的情况下，才显示空文本提示
            showToastMessage('未识别到语音内容，请再试一次', 'info');
        }
    });
}

// 取消录音
function cancelRecordingPanel() {
    isCancelled = true;
    if (isRecording && mediaRecorder) {
        mediaRecorder.stop();
    }
    hideRecordingPanel();
    audioBlobTemp = null;
}

// 语音气泡插入和播放
function addVoiceMessage(audioUrl, durationSec) {
    const chatContainer = document.getElementById('chatContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message voice-message';
    messageDiv.innerHTML = `
        <button class="voice-play-btn">
            <i class="fa fa-play"></i>
        </button>
        <audio src="${audioUrl}" preload="auto"></audio>
        <span class="voice-duration">${durationSec}"</span>
    `;
    // 播放按钮事件
    const playBtn = messageDiv.querySelector('.voice-play-btn');
    const audio = messageDiv.querySelector('audio');
    playBtn.onclick = function () {
        audio.play();
    };
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// uploadAudioBlob 返回识别文字
async function uploadAudioBlob(audioBlob) {
    const messageInput = document.getElementById('messageInput');
    try {
        messageInput.placeholder = '语音识别中...';
        messageInput.disabled = true;
        
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('user', cozeClient.getUserId());
        
        console.info('准备获取token');

        // 不再需要前端 token，后端会自动生成
        const headers = {};
        
        const res = await fetch('/api/audio-to-text', {
            method: 'POST',
            headers: headers,
            body: formData
        });
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        return data && data.text ? data.text : '';
    } catch (err) {
        showToastMessage('语音服务暂时不可用，请稍后再试', 'warning');
        // 返回一个带有错误标记的对象，避免触发第二个toast
        return { hasError: true };
    } finally {
        messageInput.placeholder = '请输入';
        messageInput.disabled = false;
        hideRecordingPanel();
    }
}

// 自动调用机器人接口 - 使用增强的状态管理
function sendMessageToBot(text) {
    sendMessageInternal(text);
}

// 简单波形动画（可升级为更复杂动画）
function showWaveform() {
    waveform.style.display = 'block';
    waveform.innerHTML = `<svg width="100%" height="32" viewBox="0 0 200 32">
        <polyline points="0,16 20,8 40,24 60,12 80,28 100,10 120,22 140,8 160,24 180,12 200,16"
            style="fill:none;stroke:#0070F0;stroke-width:4;stroke-linecap:round;">
            <animate attributeName="points" dur="1s" repeatCount="indefinite"
                values="0,16 20,8 40,24 60,12 80,28 100,10 120,22 140,8 160,24 180,12 200,16;
                        0,12 20,24 40,8 60,28 80,10 100,22 120,8 140,24 160,12 180,16 200,8;
                        0,16 20,8 40,24 60,12 80,28 100,10 120,22 140,8 160,24 180,12 200,16" />
        </polyline>
    </svg>`;
}

function hideWaveform() {
    waveform.style.display = 'none';
    waveform.innerHTML = '';
}

async function startRecording() {
    recordingStartTime = Date.now();
    isCancelled = false; // 确保开始新录音时重置取消标志
    if (isRecording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('当前浏览器不支持语音输入');
        return;
    }
    try {
        navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
            mediaRecorder = new window.MediaRecorder(stream, {mimeType: 'audio/webm'});
            audioChunks = [];
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                console.log('mediaRecorder.onstop 触发');
                stream.getTracks().forEach(track => track.stop());
                const audioBlob = new Blob(audioChunks, {type: 'audio/webm'});
                console.log('创建的audioBlob:', audioBlob, 'size:', audioBlob.size);
                isRecording = false;
                recordingEndTime = Date.now();
                // 只有在未取消的情况下才处理音频
                if (!isCancelled) {
                    console.log('调用 stopRecordingAndShowPanel');
                    stopRecordingAndShowPanel(audioBlob);
                } else {
                    console.log('录音被取消，不处理');
                }
                // 重置取消标志
                isCancelled = false;
            };
            mediaRecorder.start();
            isRecording = true;
        });
    } catch (err) {
        alert('无法访问麦克风: ' + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
    }
}

// 页面加载时初始化
// Constants and Configuration
const CONFIG = {
    DEFAULT_WELCOME_MESSAGE: '您好，{name}！我是 Max 大麦，请问有什么可以帮助您？',
    MOCK_QUESTIONS: [
        "你目前支持哪些政策类问答？",
        "公司长期工作奖励？",
        "公司有哪些产品参与国补？"
    ],
    REQUEST_TIMEOUT: 60000 // 60 seconds
};

// Bot info promise for deduplication
let botInfoPromise = null;

// Utility function to escape HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Fetch bot info with deduplication (no caching)
async function fetchBotInfo() {
    // If already fetching, return the same promise to avoid duplicate requests
    if (botInfoPromise) {
        console.log('Bot信息请求已在进行中，等待结果...');
        return botInfoPromise;
    }
    
    // Start new fetch - always get fresh data
    console.log('开始获取Bot信息...');

    botInfoPromise = fetch('/api/bot/info', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        },
        credentials: 'include', // 确保包含 session cookie
        signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`获取Bot信息失败: HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        botInfoPromise = null;
        console.log('Bot信息获取成功:', data);
        return data;
    })
    .catch(error => {
        botInfoPromise = null;
        console.error('获取Bot信息时出错:', error);
        throw error;
    });
    
    return botInfoPromise;
}

// Show toast message for user feedback
function showToastMessage(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#ff4757' : type === 'warning' ? '#ffa502' : '#0070f0'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 添加全局函数用于测试
window.testDisplayFollowUp = function() {
    const testQuestions = [
        '年假可以分几次休吗？',
        '年假是必须要休完吗？',
        '休年假需要提前申请吗？'
    ];
    console.log('[Test] 手动测试显示follow-up questions');
    displaySuggestedQuestions(testQuestions);
};

// 图片查看器功能
function initImageViewer() {
    const viewer = document.getElementById('imageViewer');
    const viewerImage = document.getElementById('viewerImage');
    const closeBtn = viewer.querySelector('.image-viewer-close');
    
    // 关闭查看器
    function closeViewer() {
        viewer.classList.remove('active');
        viewerImage.src = '';
    }
    
    // 点击关闭按钮关闭
    closeBtn.addEventListener('click', closeViewer);
    
    // 点击遮罩层关闭
    viewer.addEventListener('click', function(e) {
        if (e.target === viewer) {
            closeViewer();
        }
    });
    
    // ESC键关闭
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && viewer.classList.contains('active')) {
            closeViewer();
        }
    });
}

// 为聊天内容中的图片添加点击事件
function attachImageClickHandlers() {
    const chatContainer = document.getElementById('chatContainer');
    const viewer = document.getElementById('imageViewer');
    const viewerImage = document.getElementById('viewerImage');
    
    // 使用事件委托处理所有图片点击
    chatContainer.addEventListener('click', function(e) {
        if (e.target.tagName === 'IMG' && !e.target.classList.contains('robot-avatar-img')) {
            // 排除头像图片，只处理聊天内容中的图片
            e.preventDefault();
            viewerImage.src = e.target.src;
            viewer.classList.add('active');
        }
    });
}

// === Service Agreement Management ===
const SERVICE_AGREEMENT = {
    STORAGE_KEY: 'service-agreement-accepted',
    VERSION: '1.0.0'
};

// Check if service agreement is accepted
function isServiceAgreementAccepted() {
    try {
        const stored = localStorage.getItem(SERVICE_AGREEMENT.STORAGE_KEY);
        if (!stored) {
            return false;
        }
        
        const data = JSON.parse(stored);
        return data.accepted && data.version === SERVICE_AGREEMENT.VERSION;
    } catch (error) {
        console.error('Error reading service agreement from localStorage:', error);
        return false;
    }
}

// Save service agreement acceptance
function saveServiceAgreementAcceptance() {
    try {
        const agreementData = {
            accepted: true,
            version: SERVICE_AGREEMENT.VERSION,
            timestamp: Date.now()
        };
        
        localStorage.setItem(SERVICE_AGREEMENT.STORAGE_KEY, JSON.stringify(agreementData));
        return true;
    } catch (error) {
        console.error('Error saving service agreement to localStorage:', error);
        return false;
    }
}

// Show service agreement modal
function showServiceAgreementModal() {
    const modal = document.getElementById('serviceAgreementModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Hide service agreement modal
function hideServiceAgreementModal() {
    const modal = document.getElementById('serviceAgreementModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Show security notice modal
function showSecurityNoticeModal() {
    const modal = document.getElementById('securityNoticeModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Hide security notice modal
function hideSecurityNoticeModal() {
    const modal = document.getElementById('securityNoticeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Initialize service agreement
function initServiceAgreement() {
    const acceptBtn = document.getElementById('serviceAgreementAcceptBtn');
    
    // Add click handler for accept button
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function() {
            const success = saveServiceAgreementAcceptance();
            if (success) {
                hideServiceAgreementModal();
            } else {
                // Handle error - could show error message
                alert('保存设置时出错，请重试');
            }
        });
    }
    
    // Check if agreement needs to be shown
    if (!isServiceAgreementAccepted()) {
        // Show modal after a brief delay to ensure proper rendering
        setTimeout(() => {
            showServiceAgreementModal();
        }, 100);
    }
}

// 检测是否在企业微信环境中（与后端 envDetector.js 保持一致）
function isWeComEnvironment() {
    const ua = navigator.userAgent || '';
    // 企业微信的 User-Agent 特征
    return /wxwork/i.test(ua) || /WeCom/i.test(ua) || /MicroMessenger/i.test(ua);
}


// 确保欢迎界面的居中容器存在，并把输入框移入其中
function ensureWelcomeStack() {
    const mainElement = document.querySelector('main');
    const inputContainer = document.getElementById('inputContainer');
    if (!mainElement || !inputContainer) {
        return null;
    }

    let welcomeStack = document.getElementById('welcomeStack');
    if (!welcomeStack) {
        welcomeStack = document.createElement('div');
        welcomeStack.id = 'welcomeStack';
        welcomeStack.className = 'welcome-stack';

        const disclaimer = document.querySelector('.disclaimer-notice');
        if (disclaimer) {
            mainElement.insertBefore(welcomeStack, disclaimer);
        } else {
            mainElement.appendChild(welcomeStack);
        }
    }

    // Ensure the title, input, and suggested questions are stacked together
    // 1) Move title into the welcome stack (as the first child)
    const titleContainer = document.querySelector('.app-title-container');
    if (titleContainer && titleContainer.parentElement !== welcomeStack) {
        // Title should be at the top of the centered stack
        welcomeStack.insertBefore(titleContainer, welcomeStack.firstChild || null);
    }

    // 2) Then ensure the input container sits below the title
    if (inputContainer.parentElement !== welcomeStack) {
        welcomeStack.appendChild(inputContainer);
    }

    return welcomeStack;
}

// 恢复默认的输入框布局（退出欢迎态时调用）
function restoreInputLayout() {
    const mainElement = document.querySelector('main');
    const inputContainer = document.getElementById('inputContainer');
    if (!mainElement || !inputContainer) {
        return;
    }

    const disclaimer = document.querySelector('.disclaimer-notice');
    if (inputContainer.parentElement !== mainElement) {
        if (disclaimer) {
            mainElement.insertBefore(inputContainer, disclaimer);
        } else {
            mainElement.appendChild(inputContainer);
        }
    }

    // Move title container back to main (before removing the stack), so it
    // remains available when switching back to welcome state later.
    const titleContainer = document.querySelector('.app-title-container');
    if (titleContainer && titleContainer.parentElement && titleContainer.parentElement.id === 'welcomeStack') {
        if (disclaimer) {
            mainElement.insertBefore(titleContainer, disclaimer);
        } else {
            // Place it before the input for natural document flow
            mainElement.insertBefore(titleContainer, inputContainer);
        }
    }

    const welcomeStack = document.getElementById('welcomeStack');
    if (welcomeStack) {
        welcomeStack.remove();
    }

    // 恢复布局后更新底部间距
    updateConversationBottomPadding();
}

function activateWelcomeLayout() {
    const mainElement = document.querySelector('main');
    if (!mainElement) return;

    mainElement.classList.add('welcome-state');
    mainElement.classList.remove('conversation-state');
    ensureWelcomeStack();
}

function activateConversationLayout() {
    const mainElement = document.querySelector('main');
    if (!mainElement) return;

    mainElement.classList.remove('welcome-state');
    mainElement.classList.add('conversation-state');
    restoreInputLayout();
    // 动态为对话布局设置底部留白，保证消息不会滚到输入框下面
    updateConversationBottomPadding();
}

// 初始化欢迎界面（居中显示推荐问题）
async function initializeWelcomeInterface() {
    console.log('[initializeWelcomeInterface] 开始初始化欢迎界面');

    // 先进入欢迎布局，确保输入区居中
    activateWelcomeLayout();

    // 先渲染推荐问题骨架，占位避免布局跳动
    try {
        displaySuggestedQuestions(null);
    } catch (e) {
        console.warn('[initializeWelcomeInterface] 显示推荐问题骨架失败(忽略):', e);
    }

    // 设置默认值
    const safeName = escapeHtml(userInfo.name || '访客');
    let welcomeText = CONFIG.DEFAULT_WELCOME_MESSAGE.replace('{name}', safeName);
    let questions = CONFIG.MOCK_QUESTIONS;

    try {
        console.log('开始获取Bot信息...');
        const botInfo = await fetchBotInfo();

        // 成功时使用真实的Bot信息
        if (botInfo.data?.onboarding?.prologue) {
            const prologue = escapeHtml(botInfo.data.onboarding.prologue);
            welcomeText = `您好，${safeName}！${prologue}`;
        }

        if (botInfo.data?.onboarding?.suggestedQuestions?.length > 0) {
            questions = botInfo.data.onboarding.suggestedQuestions;
        }

        console.log('Bot信息获取成功，使用真实配置');
    } catch (error) {
        // 失败时静默降级，使用默认配置
        console.log('Bot信息获取失败，使用默认配置:', error);
        // 不显示错误提示，直接使用上面已设置的默认值
    }

    // 不显示欢迎消息，只显示推荐问题
    displaySuggestedQuestions(questions);
}

// 清除当前对话
async function clearConversation() {
    // 如果正在处理消息，不允许清空
    if (chatState.isProcessing) {
        console.log('[clearConversation] Bot正在回答，暂时不能清空对话');
        return;
    }

    try {
        console.log('[clearConversation] 开始清除对话');

        // 1. 先关闭所有活跃的SSE连接，防止异步回调干扰
        for (const [requestId, eventSource] of cozeClient.eventSourceManager.activeConnections) {
            console.log('[clearConversation] 关闭SSE连接:', requestId);
            cozeClient.eventSourceManager.cleanupConnection(requestId);
        }

        // 2. 设置清空标志，防止任何异步操作添加内容
        chatState.isClearing = true;

        // 3. 获取当前会话ID
        const currentConvId = chatState.conversationId;
        console.log('===========> [clearConversation] 当前会话ID:', currentConvId);

        // 4. 立即清空本地状态
        chatState.conversationId = null;
        chatState.isProcessing = false;
        chatState.messageQueue = [];
        chatState.currentRequestId = null;
        chatState.connectionStatus = 'idle';

        // 5. 清空聊天容器中的所有消息，但保留免责声明
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            // 保存免责声明
            const disclaimer = chatContainer.querySelector('.disclaimer-notice');
            const disclaimerHTML = disclaimer ? disclaimer.outerHTML : '';

            // 清空容器
            chatContainer.innerHTML = '';

            // 恢复免责声明
            if (disclaimerHTML) {
                chatContainer.innerHTML = disclaimerHTML;
            }

            console.log('[clearConversation] 清空聊天容器（保留免责声明）');
        }

        // 6. 清空完成，先重置标志，再初始化欢迎界面
        chatState.isClearing = false;

        // 7. 重新初始化欢迎界面
        await initializeWelcomeInterface();
        console.log('[clearConversation] 重新初始化欢迎界面完成');

        // 6. 如果有会话ID，异步调用删除API（不阻塞UI更新）
        if (currentConvId) {
            // 异步删除，不等待结果
            fetch(`/api/conversations/${currentConvId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            }).then(response => {
                if (response.ok) {
                    console.log('[clearConversation] 后端会话删除成功:', currentConvId);
                } else {
                    console.log('[clearConversation] 后端会话删除失败:', response.status);
                }
            }).catch(error => {
                console.error('[clearConversation] 删除会话请求失败:', error);
            });
        }

        // 7. 重置其他可能的状态

    } catch (error) {
        console.error('[clearConversation] 清除对话失败:', error);
        // 确保错误时也重置清空标志
        chatState.isClearing = false;

        // 如果出错，至少尝试清空UI
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }
        // 不要在这里重复调用 initializeWelcomeInterface
        // 因为错误可能发生在初始化过程中，重复调用会导致重复显示
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    // 检测企微环境并添加类名（最先执行）
    if (isWeComEnvironment()) {
        document.body.classList.add('wecom-env');
        console.log('[环境检测] 企业微信环境');
    } else {
        console.log('[环境检测] 普通浏览器环境');
    }
    
    // 立即进入欢迎布局，避免首屏闪动
    activateWelcomeLayout();
    // Initialize service agreement first
    // 注释掉：同意书已移到 callback.html，不再在 chat.html 中显示
    // initServiceAgreement();

    // 企微端：点击安全声明显示完整安全声明模态框
    if (isWeComEnvironment()) {
        const disclaimerNotice = document.querySelector('.disclaimer-notice');
        if (disclaimerNotice) {
            disclaimerNotice.addEventListener('click', function() {
                console.log('[企微端] 点击安全声明，显示安全声明模态框');
                showSecurityNoticeModal();
            });
        }

        // 添加安全声明模态框关闭按钮事件
        const securityCloseBtn = document.getElementById('securityNoticeCloseBtn');
        if (securityCloseBtn) {
            securityCloseBtn.addEventListener('click', function() {
                console.log('[企微端] 关闭安全声明模态框');
                hideSecurityNoticeModal();
            });
        }

        // 点击模态框外部区域关闭
        const securityModal = document.getElementById('securityNoticeModal');
        if (securityModal) {
            securityModal.addEventListener('click', function(e) {
                if (e.target === securityModal) {
                    console.log('[企微端] 点击外部区域，关闭安全声明模态框');
                    hideSecurityNoticeModal();
                }
            });
        }

        // "我知道了"按钮关闭模态框
        const confirmBtn = document.getElementById('securityNoticeConfirmBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                console.log('[企微端] 点击我知道了按钮，关闭安全声明模态框');
                hideSecurityNoticeModal();
            });
        }
    }

    // 初始化cozeClient（包含网络监控和自动刷新）
    cozeClient.initialize();

    // 初始化图片查看器
    initImageViewer();
    attachImageClickHandlers();

    // 绑定清除对话按钮事件
    const clearBtn = document.getElementById('clearConversationBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            // 直接清除，不需要确认
            clearConversation();
        });
    }
    
    // 将函数暴露到全局作用域
    window.updateSendButtonState = updateSendButtonState;
    window.updateClearButtonState = updateClearButtonState;

    // 初始化用户信息 UI
    initUserInfoUI();

    // 初始化 Sidebar 事件（包括折叠按钮、用户信息等）
    initSidebarEvents();
    // 应用折叠状态样式（避免刷新后状态不同步）
    applySidebarCollapsed();

    // 检查登录状态
    const isLoggedIn = await checkLoginStatus();

    // 更新 UI 根据登录状态
    updateUIForLoginState(isLoggedIn);

    if (isLoggedIn) {
        // 已登录: 显示欢迎界面 + 加载会话列表
        console.log('[已登录] 用户:', authState.userName);

        // 显示欢迎界面（开场白 + 预置问题）
        await initializeWelcomeInterface();

        // 加载会话列表到 sidebar
        await loadConversationList();
    } else {
        // 未登录: 显示欢迎界面
        console.log('[未登录] 显示欢迎界面');
        await initializeWelcomeInterface();
    }

    // 设置自定义下拉框
    initializeModeToggle();

    // 根据输入容器高度，设置对话布局底部留白，避免消息滚入输入框下方
    function computeInputBottomPad() {
        const inputContainer = document.getElementById('inputContainer');
        if (!inputContainer) return 200;
        const rect = inputContainer.getBoundingClientRect();
        // 额外预留 24px 视觉间距
        return Math.ceil(rect.height + 24);
    }

    window.updateConversationBottomPadding = function updateConversationBottomPadding() {
        try {
            const main = document.querySelector('main');
            if (!main) return;
            const pad = computeInputBottomPad();
            main.style.setProperty('--input-bottom-pad', pad + 'px');
        } catch (e) {
            // 忽略计算异常，保持默认值
        }
    };

    // 初始计算
    updateConversationBottomPadding();
    // 视口变化时更新
    window.addEventListener('resize', updateConversationBottomPadding);
    // 输入框高度变化时更新
    const messageInputEl = document.getElementById('messageInput');
    if (messageInputEl) {
        messageInputEl.addEventListener('input', updateConversationBottomPadding);
        messageInputEl.addEventListener('change', updateConversationBottomPadding);
    }


    // 设置事件监听
    document.getElementById('sendButton').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // 阻止默认的换行行为
            const messageInput = document.getElementById('messageInput');
            const message = messageInput.value.trim();

            // 只有当输入框有内容时才发送
            if (message) {
                sendMessage();
            }
        }
    });

    // 绑定"开启新对话"按钮事件
    const btnNew = document.getElementById('btn-new');
    if (btnNew) {
        btnNew.addEventListener('click', async () => {
            console.log('点击"开启新对话"按钮');

            // 清空当前会话ID（进入"无会话"状态）
            chatState.conversationId = null;

            // 清空聊天区域
            clearChatArea();

            // 显示欢迎界面
            await initializeWelcomeInterface();

            // 取消侧边栏所有高亮
            highlightConversation(null);

            console.log('[新建对话] 已准备好，等待用户发送第一条消息时创建会话');
        });
    }

    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const micButton = document.getElementById('micButton');
    const maxRows = 5;
    
    // 更新发送按钮状态（基于输入内容和处理状态）
    function updateSendButtonState() {
        const message = messageInput.value.trim();
        // 检查是否正在处理消息或正在流式传输
        if (chatState.isProcessing || chatState.connectionStatus === 'streaming' || chatState.connectionStatus === 'connecting') {
            // AI正在回复时，始终禁用发送按钮
            sendButton.classList.add('disabled');
        } else if (message) {
            // 只有在不处理消息且有输入内容时才启用
            sendButton.classList.remove('disabled');
        } else {
            // 输入框为空时禁用
            sendButton.classList.add('disabled');
        }
        // 同时更新按钮可见性
        updateButtonsVisibility();
        // 同时更新清空按钮状态
        updateClearButtonState();
    }

    // 更新清空按钮状态
    function updateClearButtonState() {
        const clearBtn = document.getElementById('clearConversationBtn');
        if (!clearBtn) return;

        // 如果正在处理消息，禁用清空按钮
        if (chatState.isProcessing || chatState.connectionStatus === 'streaming' || chatState.connectionStatus === 'connecting') {
            clearBtn.classList.add('disabled');
            clearBtn.disabled = true;
            clearBtn.style.opacity = '0.5';
            clearBtn.style.cursor = 'not-allowed';
            clearBtn.title = 'Bot正在回答，请稍后再清空';
        } else {
            clearBtn.classList.remove('disabled');
            clearBtn.disabled = false;
            clearBtn.style.opacity = '1';
            clearBtn.style.cursor = 'pointer';
            clearBtn.title = '清空对话';
        }
    }
    
    // 页面加载时检查初始状态
    updateSendButtonState();

    messageInput.addEventListener('input', function () {
        // 更新发送按钮状态
        updateSendButtonState();
        
        this.style.height = 'auto'; // 先重置高度
        // 计算高度，最多5行
        const lineHeight = parseInt(window.getComputedStyle(this).lineHeight, 10);
        const maxHeight = lineHeight * maxRows;
        this.style.height = Math.min(this.scrollHeight, maxHeight) + 'px';
    });

    // 添加页面卸载时的清理处理
    window.addEventListener('beforeunload', function() {
        cozeClient.cleanup();
    });

    // ========================================
    // 移动端菜单初始化
    // ========================================
    initMobileMenu();
});

// ========================================
// 移动端菜单功能
// ========================================
function initMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (!mobileMenuToggle || !sidebar || !backdrop) {
        console.warn('移动端菜单元素未找到');
        return;
    }

    // 检查是否在移动端
    function isMobileView() {
        return window.innerWidth < 1024;
    }

    // 打开侧边栏
    function openMobileSidebar() {
        if (!isMobileView()) return; // 只在移动端生效
        // 移动端打开时，强制移除 collapsed 状态，显示完整侧边栏
        sidebar.classList.remove('collapsed');
        // 强制切换 Tailwind 位移动画类，避免 -translate-x-full 覆盖
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        sidebar.classList.add('mobile-open');
        backdrop.classList.add('active');
        document.body.classList.add('sidebar-open');
        // 展开时隐藏浮动菜单按钮，避免与侧边栏内折叠按钮重复
        mobileMenuToggle.classList.add('hidden');
    }

    // 关闭侧边栏
    function closeMobileSidebar() {
        sidebar.classList.remove('mobile-open');
        // 还原位移类
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-open');
        // 关闭时显示浮动菜单按钮
        mobileMenuToggle.classList.remove('hidden');
    }

    // 切换侧边栏
    function toggleMobileSidebar() {
        if (sidebar.classList.contains('mobile-open')) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    }

    // 暴露全局控制，便于其他模块调用
    window.mobileSidebar = {
        open: openMobileSidebar,
        close: closeMobileSidebar,
        toggle: toggleMobileSidebar,
        isMobile: isMobileView,
    };

    // 点击汉堡菜单按钮
    mobileMenuToggle.addEventListener('click', toggleMobileSidebar);

    // 点击遮罩层关闭
    backdrop.addEventListener('click', closeMobileSidebar);

    // 侧边栏内部折叠按钮在移动端改为“关闭抽屉”
    const headerCollapseBtn = document.getElementById('btn-collapse');
    if (headerCollapseBtn) {
        headerCollapseBtn.addEventListener('click', function (e) {
            if (isMobileView()) {
                e.preventDefault();
                closeMobileSidebar();
            }
        });
    }

    // 折叠状态头像上的展开按钮（安全兜底）
    const collapsedExpandBtn = document.getElementById('collapsed-expand-btn');
    if (collapsedExpandBtn) {
        collapsedExpandBtn.addEventListener('click', function (e) {
            if (isMobileView()) {
                e.preventDefault();
                openMobileSidebar();
            }
        });
    }

    // 响应式断点监听 - 区分移动端和窄屏桌面端
    const mobileMediaQuery = window.matchMedia('(max-width: 768px)');
    const desktopMediaQuery = window.matchMedia('(min-width: 769px)');

    function handleMobileBreakpointChange(e) {
        if (e.matches) {
            // 真正的移动端（≤768px）：移除 collapsed 状态，确保侧边栏完整显示
            sidebar.classList.remove('collapsed');
            // 默认关闭侧边栏（移动端侧边栏默认隐藏）
            closeMobileSidebar();
        }
    }

    function handleDesktopBreakpointChange(e) {
        if (e.matches) {
            // 桌面端（≥769px）：关闭移动端菜单
            closeMobileSidebar();
            // 恢复桌面端的折叠状态（如果之前是折叠的）
            if (sidebarState.collapsed) {
                sidebar.classList.add('collapsed');
            }
        }
    }

    // 监听断点变化(使用现代API)
    mobileMediaQuery.addEventListener('change', handleMobileBreakpointChange);
    desktopMediaQuery.addEventListener('change', handleDesktopBreakpointChange);

    // 初始检查
    handleMobileBreakpointChange(mobileMediaQuery);
    handleDesktopBreakpointChange(desktopMediaQuery);

    // 点击侧边栏内的对话项时关闭菜单(仅移动端)
    const threadList = document.getElementById('thread-list');
    if (threadList) {
        threadList.addEventListener('click', function(e) {
            // 对话项按钮由 renderThreadList() 渲染，形如 <button data-id="...">
            // 兼容未来可能的 class/结构变化，使用 data-id 或通用 button 选择器
            const conversationItem =
                e.target.closest('button[data-id]') ||
                e.target.closest('[data-id]') ||
                e.target.closest('.conversation-item');
            if (conversationItem && isMobileView()) {
                // 延迟关闭,让用户看到选中效果
                setTimeout(() => {
                    closeMobileSidebar();
                }, 150);
            }
        });
    }

    // 兜底：在整个 #sidebar 上监听，凡是点击到带 data-id 的会话项都关闭
    sidebar.addEventListener('click', function(e) {
        const item = e.target.closest('button[data-id], [data-id], .conversation-item');
        if (item && isMobileView()) {
            setTimeout(() => closeMobileSidebar(), 120);
        }
    }, true);

    // 点击"开启新对话"按钮时也关闭菜单(仅移动端)
    const btnNew = document.getElementById('btn-new');
    if (btnNew) {
        btnNew.addEventListener('click', function() {
            if (mediaQuery.matches) {
                setTimeout(() => {
                    closeMobileSidebar();
                }, 150);
            }
        });
    }

    // 暴露到全局(方便调试和其他地方调用)
    window.openMobileSidebar = openMobileSidebar;
    window.closeMobileSidebar = closeMobileSidebar;
    window.toggleMobileSidebar = toggleMobileSidebar;
}

// 响应超时检测器
function startResponseTimeout(assistantMessageElement, timeoutMs = 300000) { // 5分钟超时
    // 清除之前的超时定时器
    if (chatState.timeoutId) {
        clearTimeout(chatState.timeoutId);
    }
    
    chatState.timeoutId = setTimeout(() => {
        console.warn('已达到最大等待时间（5分钟）');
        chatState.connectionStatus = 'timeout';
        
        // 不显示错误，而是提示可以重试
        assistantMessageElement.innerHTML = parseMarkdownCleaned(`
AI 思考时间较长，如果需要可以重新提问。

<button onclick="retryLastMessage()" style="background: #0070F0; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 8px;">重新提问</button>
        `, { breaks: true, gfm: true });
        
        // 不显示错误状态，使用普通状态
        updateAssistantStatus(assistantMessageElement, '等待完成', '');
        resetChatState();
    }, timeoutMs);
}

// 清除响应超时
function clearResponseTimeout() {
    if (chatState.timeoutId) {
        clearTimeout(chatState.timeoutId);
        chatState.timeoutId = null;
    }
}

// 错误恢复处理器
function handleChatError(error, assistantMessageElement) {
    console.error('聊天错误:', error);
    chatState.consecutiveErrors++;
    chatState.connectionStatus = 'error';

    let errorMessage = '';

    // 根据错误类型提供简洁的错误提示
    if (error.message.includes('网络')) {
        errorMessage = '⚠ 网络连接异常';
    } else if (error.message.includes('超时')) {
        errorMessage = '⚠ 响应超时';
    } else if (error.message.includes('认证')) {
        errorMessage = '⚠ 认证失败，请刷新页面';
    } else if (error.message.includes('[Coze]')) {
        // 提取Coze错误信息并简化显示
        errorMessage = '⚠ 服务暂时不可用';
    } else {
        errorMessage = '⚠ 发生了错误';
    }

    assistantMessageElement.innerHTML = parseMarkdownCleaned(errorMessage, { breaks: true, gfm: true });
    updateAssistantStatus(assistantMessageElement, '', 'error');

    // 如果连续错误过多，自动重试或建议刷新
    if (chatState.consecutiveErrors >= 3) {
        setTimeout(() => {
            // 静默处理，不再弹出确认框
            console.log('连续错误次数过多，建议刷新页面');
        }, 2000);
    }
}

// 重置聊天状态
function resetChatState() {
    chatState.isProcessing = false;
    chatState.connectionStatus = 'idle';
    chatState.currentRequestId = null;
    chatState.requestStartTime = null;

    // 更新清空按钮状态（启用）
    if (typeof updateClearButtonState === 'function') {
        updateClearButtonState();
    }
    clearResponseTimeout();
    
    // 更新发送按钮状态（会检查输入框内容和处理状态）
    if (window.updateSendButtonState) {
        window.updateSendButtonState();
    } else {
        // 如果函数还未定义，使用备用逻辑
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        if (message) {
            document.getElementById('sendButton').classList.remove('disabled');
        } else {
            document.getElementById('sendButton').classList.add('disabled');
        }
    }
}

// 重试最后一条消息 (已废弃，保留函数避免旧代码调用报错)
function retryLastMessage() {
    console.log('重试功能已移除');
}

    // 内部发送消息函数
    async function sendMessageInternal(message) {
        if (!message) return;
        
        // 注意：isProcessing 的检查已经在 sendMessage() 中完成
        // 如果 isProcessing 已经是 true，说明是 sendMessage() 设置的，应该继续执行
        // 如果 isProcessing 是 false，说明可能是其他地方调用的（如 onLoginSuccess），也应该继续执行

        // 检查是否有会话ID，如果没有则自动创建
        if (!chatState.conversationId) {
            console.log('[Chat] 没有会话ID，自动创建新会话（不显示开场白）');

            // 使用消息内容（前30字符）作为会话标题
            const titleFromMessage = message.substring(0, 30);
            const newConvId = await createNewConversation(false, titleFromMessage); // false = 不显示开场白

            if (!newConvId) {
                console.error('[Chat] 自动创建会话失败，终止发送消息');
                return;
            }
            console.log('[Chat] 自动创建会话成功，会话ID:', newConvId, '标题:', titleFromMessage);
        }

        // 移除欢迎消息（如果存在）
        const welcomeMessage = document.getElementById('welcomeMessage');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        // 保存当前会话ID，用于回调中验证
        const initialConversationId = chatState.conversationId;
        console.log('[Chat] 保存初始会话ID:', initialConversationId);

        // 重置状态
        chatState.isProcessing = true;
        chatState.connectionStatus = 'connecting';
        chatState.currentRequestId = Date.now().toString();
        chatState.requestStartTime = Date.now();

        // 更新清空按钮状态（禁用）
        updateClearButtonState();
        document.getElementById('sendButton').classList.add('disabled');
        // 不再禁用麦克风按钮，用户可以在AI回复期间录音准备下一个问题

        // 不立即创建助手消息，等待收到内容后再创建
        let assistantMessageElement = null;

        // 暂时不启动超时检测，等消息创建后再启动
        // startResponseTimeout(assistantMessageElement);

        let currentMarkdown = '';
        let hasReceivedData = false;
        let connectionStartTime = Date.now();
        
        console.log('[Chat] 开始发送消息:', {
            message: message.substring(0, 100),
            timestamp: new Date().toISOString()
        });
    
    try {
        // 获取搜索模式（从自定义下拉组件）
        const currentSearchMode = getCurrentSearchMode();
        
        // 构建消息参数
        const messageParams = {
            query: message,
            user: cozeClient.getUserId(),
            inputs: {user_account: cozeClient.getUserId()},
            conversation_id: chatState.conversationId,
            searchMode: currentSearchMode  // 每次都发送当前搜索模式
        };

        console.log('[Chat] 发送搜索模式:', currentSearchMode);
        
        // 打印最终的消息参数
        console.log('[Chat] 最终消息参数:', {
            searchMode: messageParams.searchMode,
            query: messageParams.query.substring(0, 50),
            conversationId: messageParams.conversation_id
        });
        
        // 使用修改后的cozeClient发送消息
        await cozeClient.sendChatMessage(messageParams, {
            onStart: () => {
                // 验证会话是否仍然活跃
                if (chatState.conversationId !== initialConversationId || chatState.isSwitching) {
                    console.log('[Chat] onStart: 会话已切换，忽略回调', {
                        current: chatState.conversationId,
                        initial: initialConversationId,
                        isSwitching: chatState.isSwitching
                    });
                    return;
                }

                chatState.connectionStatus = 'streaming';
                console.log('[Chat] 流式连接已建立');

                // 10秒后检查是否需要显示加载状态
                setTimeout(() => {
                    // 再次验证会话
                    if (chatState.conversationId !== initialConversationId || chatState.isSwitching) {
                        console.log('[Chat] onStart setTimeout: 会话已切换，忽略回调');
                        return;
                    }

                    if (chatState.isProcessing && !hasReceivedData) {
                        // 如果还没有创建消息元素，现在创建一个带加载状态的
                        if (!assistantMessageElement) {
                            assistantMessageElement = addMessage('•••', 'assistant');
                            startResponseTimeout(assistantMessageElement);
                        } else {
                            updateAssistantStatus(assistantMessageElement, '•••');
                        }
                        console.log('[Chat] 10秒后仍未收到数据');
                    }
                }, 10000);
            },
            onHeartbeat: () => {
                // 验证会话是否仍然活跃
                if (chatState.conversationId !== initialConversationId || chatState.isSwitching) {
                    console.log('[Chat] onHeartbeat: 会话已切换，忽略回调', {
                        current: chatState.conversationId,
                        initial: initialConversationId,
                        isSwitching: chatState.isSwitching
                    });
                    return;
                }

                const now = new Date().toISOString();
                console.log('[Chat] 💓 收到心跳，重置超时计时器', now);
                // 重置超时计时器为5分钟
                if (chatState.isProcessing) {
                    clearResponseTimeout();
                    // 只有在消息元素存在时才启动超时
                    if (assistantMessageElement) {
                        startResponseTimeout(assistantMessageElement, 300000); // 5分钟
                        console.log('[Chat] 超时计时器已重置，下次超时时间:', new Date(Date.now() + 300000).toISOString());

                        // 根据等待时间显示简洁的提示
                        const waitTime = Date.now() - chatState.requestStartTime;
                        if (waitTime > 120000) { // 超过2分钟
                            updateAssistantStatus(assistantMessageElement, '•••');
                        } else if (waitTime > 60000) { // 超过1分钟
                            updateAssistantStatus(assistantMessageElement, '••');
                        } else if (waitTime > 30000) { // 超过30秒
                            updateAssistantStatus(assistantMessageElement, '•');
                        }
                    }
                }
            },
            onToken: (token) => {
                // 验证会话是否仍然活跃
                if (chatState.conversationId !== initialConversationId || chatState.isSwitching) {
                    console.log('[Chat] onToken: 会话已切换，忽略回调', {
                        current: chatState.conversationId,
                        initial: initialConversationId,
                        isSwitching: chatState.isSwitching
                    });
                    return;
                }

                hasReceivedData = true;
                chatState.lastResponseTime = Date.now();

                // 第一次收到内容：仅展示三点状态气泡，直到最终图片可显示
                if (!assistantMessageElement) {
                    assistantMessageElement = addAssistantStatus('<span class="thinking-dots"><span></span><span></span><span></span></span>', 'thinking');
                    // 启动超时检测
                    startResponseTimeout(assistantMessageElement);
                }

                console.log('[Chat] 🔥 onToken回调被调用!', {
                    token: token,
                    tokenLength: token ? token.length : 0,
                    tokenPreview: token ? token.substring(0, 100) + '...' : 'null',
                    currentMarkdownLength: currentMarkdown.length,
                    timestamp: new Date().toISOString()
                });

                // 直接使用原始token，不再过滤搜索提示文字
                // 这样用户能看到"正在为你搜索"等状态，避免空白气泡

                // 累加token并渲染markdown
                const oldMarkdown = currentMarkdown;
                currentMarkdown += token;

                console.log('[Chat] 📝 Markdown累积:', {
                    oldLength: oldMarkdown.length,
                    newLength: currentMarkdown.length,
                    addedLength: token ? token.length : 0,
                    preview: currentMarkdown.substring(0, 200) + '...'
                });

                const content = assistantMessageElement.querySelector('.message-content');
                if (content) {
                    // 将"正在思考中..."替换为动画点
                    let displayMarkdown = currentMarkdown;
                    if (displayMarkdown.includes('正在思考中')) {
                        displayMarkdown = displayMarkdown.replace(
                            /正在思考中[\.。]*/g,
                            '<span class="thinking-dots"><span></span><span></span><span></span></span>'
                        );
                    }
                    // 流式阶段屏蔽图片，避免反复插入导致闪烁
                    const streamingMasked = stripImagesForStreaming(displayMarkdown);
                    content.innerHTML = parseMarkdownCleaned(streamingMasked, { breaks: true, gfm: true });

                    // 流式阶段不激活图片加载；只在最终 onFinish 激活
                }
                scrollToBottom();
                
                // 清除超时，因为已经收到数据
                clearResponseTimeout();
            },
            onMessage: (fullMessage) => {
                // 验证会话是否仍然活跃
                if (chatState.conversationId !== initialConversationId || chatState.isSwitching) {
                    console.log('[Chat] onMessage: 会话已切换，忽略回调', {
                        current: chatState.conversationId,
                        initial: initialConversationId,
                        isSwitching: chatState.isSwitching
                    });
                    return;
                }

                hasReceivedData = true;
                chatState.lastResponseTime = Date.now();

                console.log('[Chat] 📨 onMessage回调被调用!', {
                    fullMessage: fullMessage,
                    messageLength: fullMessage ? fullMessage.length : 0,
                    messagePreview: fullMessage ? fullMessage.substring(0, 200) + '...' : 'null',
                    timestamp: new Date().toISOString()
                });

                // 直接使用原始消息，不再过滤搜索提示文字
                // 这样用户能看到完整的处理状态

                // 如果还没有创建消息元素，先创建三点状态
                if (!assistantMessageElement) {
                    assistantMessageElement = addAssistantStatus('<span class="thinking-dots"><span></span><span></span><span></span></span>', 'thinking');
                    startResponseTimeout(assistantMessageElement);
                }

                // 完整消息更新 - 使用fullMessage替换所有内容，避免重复
                const content = assistantMessageElement.querySelector('.message-content');
                if (content) {
                    // 重置currentMarkdown为fullMessage，避免累加造成重复
                    currentMarkdown = fullMessage;
                    // 将"正在思考中..."替换为动画点
                    let displayMessage = fullMessage;
                    if (displayMessage.includes('正在思考中')) {
                        displayMessage = displayMessage.replace(
                            /正在思考中[\.。]*/g,
                            '<span class="thinking-dots"><span></span><span></span><span></span></span>'
                        );
                    }
                    // 流式阶段屏蔽图片，避免反复插入导致闪烁
                    const streamingMasked = stripImagesForStreaming(displayMessage);
                    content.innerHTML = parseMarkdownCleaned(streamingMasked, { breaks: true, gfm: true });

                    // 流式阶段不激活图片加载；只在最终 onFinish 激活
                }
                scrollToBottom();
            },
            onError: (error) => {
                // 验证会话是否仍然活跃
                if (chatState.conversationId !== initialConversationId || chatState.isSwitching) {
                    console.log('[Chat] onError: 会话已切换，忽略回调', {
                        current: chatState.conversationId,
                        initial: initialConversationId,
                        isSwitching: chatState.isSwitching
                    });
                    return;
                }

                clearResponseTimeout();
                // 只有在消息元素存在时才处理错误显示
                if (assistantMessageElement) {
                    handleChatError(error, assistantMessageElement, chatState.retryCount < chatState.maxRetries);
                } else {
                    // 如果还没有创建消息元素，创建一个用于显示错误
                    assistantMessageElement = addMessage('', 'assistant');
                    handleChatError(error, assistantMessageElement, chatState.retryCount < chatState.maxRetries);
                }
                resetChatState();
            },
            onFinish: (result) => {
                // 验证会话是否仍然活跃
                if (chatState.conversationId !== initialConversationId || chatState.isSwitching) {
                    console.log('[Chat] onFinish: 会话已切换，忽略回调', {
                        current: chatState.conversationId,
                        initial: initialConversationId,
                        isSwitching: chatState.isSwitching
                    });
                    return;
                }

                clearResponseTimeout();

                // 如果正在清空对话，跳过所有处理
                if (chatState.isClearing) {
                    console.log('[Chat] 正在清空对话，跳过onFinish处理');
                    return;
                }

                // 保存会话ID
                if (result.conversation_id) {
                    chatState.conversationId = result.conversation_id;
                }

                // 清理最终内容中的搜索提示文字和动画点元素
                // 优先使用 result.answer（后端返回的完整答案），确保包含所有内容（如图片链接）
                const finalMarkdown = result.answer || currentMarkdown;
                
                if (assistantMessageElement && finalMarkdown) {
                    console.log('[Chat] onFinish: 处理最终内容', {
                        hasResultAnswer: !!result.answer,
                        resultAnswerLength: result.answer?.length || 0,
                        currentMarkdownLength: currentMarkdown?.length || 0,
                        finalMarkdownLength: finalMarkdown.length,
                        finalMarkdownPreview: finalMarkdown.substring(0, 200)
                    });

                    // 移除所有搜索提示文字和thinking-dots HTML元素，保持最终答案简洁
                    let cleanedMarkdown = finalMarkdown
                        .replace(/正在思考中[\.。]*/g, '')
                        .replace(/<span class="thinking-dots">(<span><\/span>){3}<\/span>/g, '')
                        .replace(/<span class="image-generating-placeholder">(<span><\/span>){3}<\/span>/g, '');

                    // 清理多余的空白行
                    cleanedMarkdown = cleanedMarkdown.trim();

                    // 在显示最终内容前，预加载首张图片，三点状态持续展示到首图就绪
                    const firstImageMatch = finalMarkdown.match(/!\[[^\]]*\]\(([^\)\s]+)\)/);
                    const firstImageUrl = firstImageMatch ? firstImageMatch[1] : '';

                    preloadImage(firstImageUrl, 10000).finally(() => {
                        // 预加载完成或超时后，再替换为最终内容
                        const content = assistantMessageElement.querySelector('.message-content');
                        if (content) {
                            content.innerHTML = parseMarkdownCleaned(cleanedMarkdown, { breaks: true, gfm: true });
                        }
                        // 将状态气泡转为普通消息样式
                        assistantMessageElement.className = 'message assistant-message';

                        // 更新 currentMarkdown 以保持一致性，并激活图片加载
                        currentMarkdown = cleanedMarkdown;
                        setTimeout(() => { activateImageLoading(); }, 0);
                    });
                }

                // 更新消息ID到反馈按钮（如果有的话）
                if (result.message_id && assistantMessageElement) {
                    const feedbackContainer = assistantMessageElement.querySelector('.feedback-buttons');
                    if (feedbackContainer && feedbackContainer.getAttribute('data-pending-feedback')) {
                        // 替换为真正的反馈按钮
                        const newFeedbackButtons = createFeedbackButtons(result.message_id);
                        feedbackContainer.replaceWith(newFeedbackButtons);
                    }
                    // 同时给消息元素添加消息ID
                    assistantMessageElement.setAttribute('data-message-id', result.message_id);
                }

                // 显示推荐问题
                console.log('[Chat] 检查 followUpQuestions:', {
                    hasFollowUp: !!result.followUpQuestions,
                    length: result.followUpQuestions ? result.followUpQuestions.length : 0,
                    questions: result.followUpQuestions,
                    messageId: result.message_id
                });

                if (result.followUpQuestions && result.followUpQuestions.length > 0) {
                    console.log('[Chat] 收到推荐问题，准备显示:', result.followUpQuestions);
                    // 直接显示推荐问题，传入当前助手消息元素
                    displaySuggestedQuestions(result.followUpQuestions, assistantMessageElement);
                } else {
                    console.log('[Chat] 没有收到推荐问题');
                }

                // 成功完成，重置错误计数和重试计数
                chatState.consecutiveErrors = 0;
                chatState.retryCount = 0;
                chatState.lastResponseTime = Date.now();

                // 刷新会话列表，以便更新会话标题（特别是新会话的首条消息会生成新标题）
                // 使用 setTimeout 延迟刷新，避免阻塞当前流程
                setTimeout(() => {
                    loadConversationList().catch(error => {
                        console.error('[Chat] 刷新会话列表失败:', error);
                    });
                }, 500);

                resetChatState();
            }
        });
    } catch (error) {
        clearResponseTimeout();
        handleChatError(error, assistantMessageElement, chatState.retryCount < chatState.maxRetries);
        resetChatState();
    }
}

// 创建反馈按钮
function createFeedbackButtons(messageId) {
    const container = document.createElement('div');
    container.className = 'feedback-buttons';

    // 如果没有消息ID，暂时不创建按钮（稍后会更新）
    if (!messageId) {
        container.setAttribute('data-pending-feedback', 'true');
        return container;
    }

    container.setAttribute('data-message-id', messageId);

    // 点赞按钮
    const likeBtn = document.createElement('button');
    likeBtn.type = 'button'; // 防止表单提交
    likeBtn.className = 'feedback-btn like-btn';
    likeBtn.setAttribute('data-feedback', 'like');
    likeBtn.setAttribute('data-message-id', messageId);
    likeBtn.innerHTML = '<img src="/img/like.svg" alt="点赞" style="pointer-events: none;">';

    // 点踩按钮
    const dislikeBtn = document.createElement('button');
    dislikeBtn.type = 'button'; // 防止表单提交
    dislikeBtn.className = 'feedback-btn dislike-btn';
    dislikeBtn.setAttribute('data-feedback', 'unlike');
    dislikeBtn.setAttribute('data-message-id', messageId);
    dislikeBtn.innerHTML = '<img src="/img/dislike.svg" alt="点踩" style="pointer-events: none;">';

    // 添加点击事件
    likeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Chat] 点击了点赞按钮, messageId:', messageId);
        handleFeedback(messageId, 'like', likeBtn, dislikeBtn);
    });

    dislikeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Chat] 点击了点踩按钮, messageId:', messageId);
        handleFeedback(messageId, 'unlike', dislikeBtn, likeBtn);
    });

    container.appendChild(likeBtn);
    container.appendChild(dislikeBtn);

    return container;
}

// 处理反馈
async function handleFeedback(messageId, feedbackType, clickedBtn, otherBtn) {
    // 防止重复点击
    if (clickedBtn.classList.contains('active')) {
        console.log('[Chat] 已经提交过相同的反馈');
        return;
    }

    console.log('[Chat] 准备发送反馈:', {
        messageId: messageId,
        feedbackType: feedbackType,
        conversationId: chatState.conversationId,
        hasMessageId: !!messageId,
        hasConversationId: !!chatState.conversationId
    });

    // 检查必需参数
    if (!messageId) {
        console.error('[Chat] 缺少消息ID，无法提交反馈');
        alert('消息ID未获取到，请刷新后重试');
        return;
    }

    if (!chatState.conversationId) {
        console.error('[Chat] 缺少会话ID，无法提交反馈');
        alert('会话ID未获取到，请刷新后重试');
        return;
    }

    // 更新按钮状态和图标
    clickedBtn.classList.add('active');
    otherBtn.classList.remove('active');

    // 更换为实心图标
    const clickedImg = clickedBtn.querySelector('img');
    if (feedbackType === 'like') {
        clickedImg.src = '/img/like-filled.svg';
    } else {
        clickedImg.src = '/img/dislike-filled.svg';
    }

    // 隐藏另一个按钮
    otherBtn.classList.add('feedback-hidden');

    // 发送反馈到后端
    try {
        const requestBody = {
            conversation_id: chatState.conversationId,
            message_id: messageId,
            feedback_type: feedbackType
        };

        console.log('[Chat] 发送反馈请求:', requestBody);

        // 不再需要前端 token，后端会自动生成
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            credentials: 'include' // 确保包含 session cookie
        });

        const responseData = await response.json();
        console.log('[Chat] 反馈响应:', responseData);

        if (!response.ok) {
            throw new Error(`反馈提交失败: ${response.status}, ${responseData.msg || '未知错误'}`);
        }

        console.log('[Chat] 反馈提交成功:', {
            messageId,
            feedbackType,
            conversationId: chatState.conversationId,
            response: responseData
        });
    } catch (error) {
        console.error('[Chat] 反馈提交失败:', error);
        alert(`反馈提交失败: ${error.message}`);
        // 恢复按钮状态
        clickedBtn.classList.remove('active');
        otherBtn.classList.remove('feedback-hidden');

        // 恢复原始图标
        const clickedImg = clickedBtn.querySelector('img');
        if (feedbackType === 'like') {
            clickedImg.src = '/img/like.svg';
        } else {
            clickedImg.src = '/img/dislike.svg';
        }
    }
}

// 发送消息 - 重构为调用内部函数
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const message = input.value.trim();

    // 检查按钮是否被禁用或消息为空
    if (!message || chatState.isProcessing || sendButton.classList.contains('disabled')) return;

    // ⭐ 立即设置处理标志，防止快速双击回车导致的重复发送
    chatState.isProcessing = true;
    
    // ⭐ 立即清空输入框，防止快速双击时输入框还有内容
    input.value = '';
    resetInputHeight();
    sendButton.classList.add('disabled');

    // 检查登录状态
    const isLoggedIn = await checkLoginStatus();
    if (!isLoggedIn) {
        // 登录失败，重置处理标志
        chatState.isProcessing = false;
        // 恢复输入框内容（用户可能需要重新输入）
        input.value = message;
        resetInputHeight();
        sendButton.classList.remove('disabled');
        
        // 保存待发送消息
        authState.pendingMessage = message;
        // 显示登录模态框 (Task 1.2 实现)
        if (typeof showLoginModal === 'function') {
            showLoginModal();
        } else {
            console.error('登录模态框未实现');
        }
        return;
    }

    // 添加用户消息
    addMessage(message, 'user');

    // 切换到对话布局
    activateConversationLayout();

    const welcomeMessage = document.getElementById('welcomeMessage');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    // 隐藏推荐问题
    hideSuggestedQuestions();
    
    // 切换回麦克风按钮（检查函数是否存在）
    if (typeof updateButtonsVisibility === 'function') {
        updateButtonsVisibility();
    } else {
        // 直接操作按钮显示
        const micButton = document.getElementById('micButton');
        const sendBtn = document.getElementById('sendButton');
        if (micButton) micButton.style.display = 'flex';
        if (sendBtn) sendBtn.style.display = 'none';
    }

    // 发送消息
    await sendMessageInternal(message);
}

// 添加消息
function addMessage(text, sender, messageId = null) {
    // 如果正在清空对话，不添加任何消息
    if (chatState.isClearing) {
        console.log('[addMessage] 正在清空对话，跳过添加消息');
        return null;
    }

    // 如果正在切换会话，不添加任何消息
    if (chatState.isSwitching) {
        console.log('[addMessage] 正在切换会话，跳过添加消息');
        return null;
    }

    const chatContainer = document.getElementById('chatContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    // 存储消息ID用于反馈
    if (messageId) {
        messageDiv.setAttribute('data-message-id', messageId);
    }

    let content;
    if (sender === 'user') {
        // 只显示文本内容，不显示头像
        content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = text;
        messageDiv.appendChild(content);
    } else {
        // 创建消息容器结构
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'message-wrapper';

        // 助手消息使用图片头像
        const avatar = document.createElement('div');
        avatar.className = `avatar ${sender}-avatar`;
        const img = document.createElement('img');
        img.src = '/img/max2.jpg';
        img.alt = '机器人';
        img.className = 'robot-avatar-img';
        avatar.appendChild(img);

        // 创建内容区域容器
        const contentArea = document.createElement('div');
        contentArea.className = 'content-area';

        // 消息内容
        content = document.createElement('div');
        content.className = 'message-content';
        // 支持markdown
        content.innerHTML = parseMarkdownCleaned(text, { breaks: true, gfm: true });
        contentArea.appendChild(content);

        // 为助手消息添加反馈按钮（放在内容下方）
        const feedbackButtons = createFeedbackButtons(messageId);
        contentArea.appendChild(feedbackButtons);

        // 组装结构
        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(contentArea);
        messageDiv.appendChild(messageWrapper);
    }
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

// 添加助手状态消息
function addAssistantStatus(text, statusType) {
    const chatContainer = document.getElementById('chatContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message assistant-message status-message ${statusType}`;

    // 创建消息容器结构
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';

    const avatar = document.createElement('div');
    avatar.className = 'avatar assistant-avatar';

    // 使用图片头像
    const img = document.createElement('img');
    img.src = '/img/max2.jpg';
    img.alt = '机器人';
    img.className = 'robot-avatar-img';
    avatar.appendChild(img);

    // 创建内容区域容器
    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';

    const content = document.createElement('div');
    content.className = 'message-content';
    // 如果文本包含HTML标签（如加载动画），直接设置innerHTML
    if (text.includes('<') && text.includes('>')) {
        content.innerHTML = text;
    } else {
        // 否则支持markdown
        content.innerHTML = parseMarkdownCleaned(text, { breaks: true, gfm: true });
    }
    contentArea.appendChild(content);

    // 为状态消息也预留反馈按钮位置（稍后会更新）
    const feedbackButtons = createFeedbackButtons(null);
    contentArea.appendChild(feedbackButtons);

    // 组装结构
    messageWrapper.appendChild(avatar);
    messageWrapper.appendChild(contentArea);
    messageDiv.appendChild(messageWrapper);

    chatContainer.appendChild(messageDiv);

    scrollToBottom();

    return messageDiv;
}

// 更新助手状态消息
function updateAssistantStatus(element, text, statusType = '') {
    // element 现在是 messageDiv，需要找到其中的 content
    const content = element.querySelector('.message-content');
    if (content) {
        // 如果文本包含HTML标签（如加载动画），直接设置innerHTML
        if (text.includes('<') && text.includes('>')) {
            content.innerHTML = text;
        } else {
            // 否则支持markdown
            content.innerHTML = parseMarkdownCleaned(text, { breaks: true, gfm: true });
        }
    }
    if (statusType) {
        element.className = `message assistant-message status-message ${statusType}`;
    }
}

// 滚动到底部
function scrollToBottom() {
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 发送后重置高度
function resetInputHeight() {
    const messageInput = document.getElementById('messageInput');
    messageInput.style.height = 'auto';
}

// 显示预置问题
function displaySuggestedQuestions(questions, afterElement = null) {
    // 如果正在清空对话，不显示推荐问题
    if (chatState.isClearing) {
        console.log('[Chat] 正在清空对话，跳过显示推荐问题');
        return;
    }

    console.log('[Chat] displaySuggestedQuestions 被调用，questions:', questions, 'afterElement:', afterElement);
    
    // 复用已存在的容器，避免删除/新增导致抖动
    const mainElement = document.querySelector('main');
    const isWelcomeState = mainElement?.classList.contains('welcome-state');
    const welcomeStack = isWelcomeState ? ensureWelcomeStack() : null;
    let container = null;
    const existingContainers = document.querySelectorAll('.suggested-questions');
    if (existingContainers.length > 0) {
        container = existingContainers[0];
        // 多余的直接移除
        for (let i = 1; i < existingContainers.length; i++) {
            existingContainers[i].remove();
        }
    }
    // 记录当前高度，更新期间锁定，避免输入框被挤动
    let prevHeight = 0;
    if (container) {
        const rect = container.getBoundingClientRect();
        prevHeight = rect.height;
        if (prevHeight > 0) container.style.minHeight = prevHeight + 'px';
    }
    
    // 如果传入null，显示骨架屏
    if (questions === null) {
        console.log('[Chat] 显示骨架屏');
        if (!container) {
            container = document.createElement('div');
            container.id = 'suggestedQuestions';
        }
        container.className = 'suggested-questions suggested-questions-placeholder';
        
        // 添加骨架屏内容
        const skeletonHTML = `
            <div class="skeleton-buttons">
                <div class="skeleton-button"></div>
                <div class="skeleton-button"></div>
                <div class="skeleton-button"></div>
            </div>
        `;
        container.innerHTML = skeletonHTML;
        
        // 插入骨架屏到聊天容器
        const chatContainer = document.getElementById('chatContainer');
        const welcomeMessage = document.getElementById('welcomeMessage');

        if (!container.parentNode) {
            if (welcomeStack) {
                welcomeStack.appendChild(container);
            } else if (welcomeMessage && welcomeMessage.parentNode) {
                welcomeMessage.insertAdjacentElement('afterend', container);
            } else if (chatContainer) {
                chatContainer.appendChild(container);
            }
        }
        return;
    }
    
    // 如果没有问题（空数组），直接返回
    if (!questions || questions.length === 0) {
        console.log('[Chat] 没有推荐问题，退出');
        return;
    }
    
    // 创建或复用推荐问题容器（无标题、无背景，仅按钮）
    if (!container) {
        container = document.createElement('div');
        container.id = 'suggestedQuestions';
        console.log('[Chat] 创建新的推荐问题容器');
    } else {
        console.log('[Chat] 复用已有的推荐问题容器');
    }
    // 去除骨架态样式，并清空旧内容，避免与真实按钮重叠
    container.className = 'suggested-questions';
    container.innerHTML = '';
    
    // 添加问题按钮容器
    const questionsWrapper = document.createElement('div');
    questionsWrapper.className = 'suggested-questions-wrapper';
    
    // 使用DocumentFragment优化DOM操作
    const fragment = document.createDocumentFragment();
    
    // 使用事件委托处理点击事件
    questionsWrapper.addEventListener('click', async function(e) {
        if (e.target && e.target.classList.contains('suggested-question-btn')) {
            const question = e.target.getAttribute('data-question');
            if (question && !chatState.isProcessing) {
                // 检查登录状态
                const isLoggedIn = await checkLoginStatus();
                if (!isLoggedIn) {
                    // 保存待发送消息
                    authState.pendingMessage = question;
                    // 显示登录模态框
                    if (typeof showLoginModal === 'function') {
                        showLoginModal();
                    } else {
                        console.error('登录模态框未实现');
                    }
                    return; // 中断执行,等待登录后再发送
                }

                // 已登录：立即切换为对话布局，输入框立刻固定到底部
                if (typeof activateConversationLayout === 'function') {
                    activateConversationLayout();
                } else {
                    const mainElement = document.querySelector('main');
                    if (mainElement) mainElement.classList.remove('welcome-state');
                }

                // 移除欢迎消息（如果存在）
                const welcomeMessage = document.getElementById('welcomeMessage');
                if (welcomeMessage) welcomeMessage.remove();

                // 隐藏推荐问题
                hideSuggestedQuestions();

                // 统一输入框状态：清空并重置高度、禁用发送、切回麦克风
                const inputEl = document.getElementById('messageInput');
                if (inputEl) {
                    inputEl.value = '';
                    if (typeof resetInputHeight === 'function') {
                        resetInputHeight();
                    } else {
                        inputEl.style.height = 'auto';
                    }
                }
                const sendBtn = document.getElementById('sendButton');
                if (sendBtn) sendBtn.classList.add('disabled');
                if (typeof updateButtonsVisibility === 'function') {
                    updateButtonsVisibility();
                } else {
                    const micButton = document.getElementById('micButton');
                    if (micButton) micButton.style.display = 'flex';
                    if (sendBtn) sendBtn.style.display = 'none';
                }

                // 添加用户消息并发送
                addMessage(question, 'user');
                sendMessageInternal(question);
            }
        }
    });
    
    questions.forEach(question => {
        const questionBtn = document.createElement('button');
        questionBtn.className = 'suggested-question-btn';
        // 使用textContent防止XSS，确保问题文本被正确转义
        questionBtn.textContent = question;
        questionBtn.setAttribute('data-question', question);
        // 添加ARIA标签提升可访问性
        questionBtn.setAttribute('aria-label', `发送预设问题: ${question}`);
        questionBtn.setAttribute('role', 'button');
        questionBtn.setAttribute('tabindex', '0');
        fragment.appendChild(questionBtn);
    });
    
    questionsWrapper.appendChild(fragment);
    container.appendChild(questionsWrapper);
    
    // 确保容器可见
    container.style.display = '';
    container.style.visibility = 'visible';
    container.style.opacity = '1';
    
    let inserted = !!container.parentNode;

    if (!inserted && welcomeStack) {
        welcomeStack.appendChild(container);
        inserted = true;
        console.log('[Chat] 推荐问题已插入到欢迎居中容器中');
    }

    if (!inserted && afterElement && afterElement.parentNode) {
        afterElement.insertAdjacentElement('afterend', container);
        inserted = true;
        console.log('[Chat] 推荐问题已插入到指定元素后面');
    }

    if (!inserted) {
        const inputContainer = document.getElementById('inputContainer');
        if (inputContainer && inputContainer.parentNode) {
            inputContainer.insertAdjacentElement('afterend', container);
            inserted = true;
            console.log('[Chat] 推荐问题已插入到输入框下方');
        }
    }

    if (!inserted) {
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            chatContainer.appendChild(container);
            inserted = true;
            console.log('[Chat] 推荐问题已插入到聊天容器末尾');
        }
    }
    
    // 滚动到底部以显示推荐问题
    scrollToBottom();
    // 下一帧释放最小高度，避免长期占位
    requestAnimationFrame(() => {
        if (container) container.style.minHeight = '';
    });
    console.log('[Chat] 推荐问题显示完成');
    
    // 调试：检查容器的位置和大小
    const rect = container.getBoundingClientRect();
    console.log('[Chat] 推荐问题容器位置:', {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0
    });
    
    console.log('[Chat] 推荐问题显示完成:', questions.length, '个问题');
    
    // 验证元素是否真的被添加到 DOM
    const addedElement = document.getElementById('suggestedQuestions');
    console.log('[Chat] 验证：suggestedQuestions 元素存在于 DOM 中:', !!addedElement);
    if (addedElement) {
        console.log('[Chat] 推荐问题容器样式:', {
            display: addedElement.style.display,
            visibility: addedElement.style.visibility,
            className: addedElement.className,
            childrenCount: addedElement.children.length
        });
    }
}

// 隐藏预置问题
function hideSuggestedQuestions() {
    // 移除所有推荐问题容器
    const containers = document.querySelectorAll('.suggested-questions');
    containers.forEach(container => {
        console.log('[Chat] 移除推荐问题容器');
        container.remove();
    });
}

// 显示历史消息加载骨架屏（已废弃，统一使用欢迎骨架屏）
// function showHistorySkeletonScreen() {
//     console.log('[Chat] 显示历史消息骨架屏');
//     const chatContainer = document.getElementById('chatContainer');
//
//     // 创建骨架屏容器
//     const skeletonContainer = document.createElement('div');
//     skeletonContainer.className = 'history-skeleton-container';
//     skeletonContainer.id = 'historySkeletonContainer';

//
//     // 生成5个消息骨架，交替显示用户和助手消息
//     const skeletonHTML = `
//         <!-- 用户消息骨架 -->
//         <div class="skeleton-message skeleton-user-message">
//             <div class="skeleton-content skeleton-pulse"></div>
//         </div>
//
//         <!-- 助手消息骨架 -->
//         <div class="skeleton-message skeleton-assistant-message">
//             <div class="skeleton-avatar">
//                 <img src="/img/max2.jpg" alt="Max" class="skeleton-avatar-img">
//             </div>
//             <div class="skeleton-content-wrapper">
//                 <div class="skeleton-content skeleton-pulse"></div>
//                 <div class="skeleton-content skeleton-short skeleton-pulse"></div>
//             </div>
//         </div>
//
//         <!-- 用户消息骨架 -->
//         <div class="skeleton-message skeleton-user-message">
//             <div class="skeleton-content skeleton-short skeleton-pulse"></div>
//         </div>
//
//         <!-- 助手消息骨架 -->
//         <div class="skeleton-message skeleton-assistant-message">
//             <div class="skeleton-avatar">
//                 <img src="/img/max2.jpg" alt="Max" class="skeleton-avatar-img">
//             </div>
//             <div class="skeleton-content-wrapper">
//                 <div class="skeleton-content skeleton-pulse"></div>
//                 <div class="skeleton-content skeleton-medium skeleton-pulse"></div>
//                 <div class="skeleton-content skeleton-short skeleton-pulse"></div>
//             </div>
//         </div>
//
//         <!-- 用户消息骨架 -->
//         <div class="skeleton-message skeleton-user-message">
//             <div class="skeleton-content skeleton-medium skeleton-pulse"></div>
//         </div>
//     `;

//
//     skeletonContainer.innerHTML = skeletonHTML;
//     chatContainer.appendChild(skeletonContainer);
//
//     // 添加最小显示时间标记
//     skeletonContainer.setAttribute('data-show-time', Date.now());
// }

// 隐藏历史消息加载骨架屏（已废弃，统一使用欢迎骨架屏）
// function hideHistorySkeletonScreen() {
//     console.log('[Chat] 隐藏历史消息骨架屏');
//     const skeletonContainer = document.getElementById('historySkeletonContainer');

//
//     if (skeletonContainer) {
//         // 获取显示时间
//         const showTime = parseInt(skeletonContainer.getAttribute('data-show-time') || '0');
//         const currentTime = Date.now();
//         const elapsedTime = currentTime - showTime;
//         const minDisplayTime = 300; // 最小显示300ms，避免闪烁

//
//         // 如果显示时间不足，延迟移除
//         if (elapsedTime < minDisplayTime) {
//             setTimeout(() => {
//                 const container = document.getElementById('historySkeletonContainer');
//                 if (container) {
//                     container.remove();
//                 }
//             }, minDisplayTime - elapsedTime);
//         } else {
//             skeletonContainer.remove();
//         }
//     }
// }

// === 移动端防止键盘缩放 ===
(function preventKeyboardZoom() {
    // 检测是否是移动设备
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (!isMobile) return;
    
    console.log('[PreventZoom] 初始化防止键盘缩放');
    
    // 处理输入框焦点事件，确保字体大小不小于 16px
    const messageInput = document.getElementById('messageInput');
    
    if (messageInput) {
        // 防止输入框获得焦点时的自动缩放
        messageInput.addEventListener('touchstart', function() {
            // 确保输入框字体大小不小于 16px
            this.style.fontSize = '16px';
        });
        
        messageInput.addEventListener('focus', function() {
            // 确保输入框字体大小不小于 16px
            this.style.fontSize = '16px';
        });
    }
    
    console.log('[PreventZoom] 防止键盘缩放初始化完成');
})();

// 初始化模式切换按钮（下拉菜单版本）
function initializeModeToggle() {
    const dropdown = document.getElementById('modeDropdown');
    const trigger = document.getElementById('modeDropdownTrigger');
    const menu = document.getElementById('modeDropdownMenu');
    const modeIcon = document.getElementById('modeIcon');
    const modeText = document.getElementById('modeText');

    // 存储当前模式
    let currentMode = 'enterprise';

    // 模式配置
    const modeConfig = {
        enterprise: {
            icon: '/img/business.svg',
            text: '企业知识'
        },
        internet: {
            icon: '/img/internet.svg',
            text: '联网搜索'
        }
    };

    // 切换下拉菜单显示/隐藏
    if (trigger) {
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });
    }

    // 点击菜单项
    if (menu) {
        const menuItems = menu.querySelectorAll('.mode-dropdown-item');
        menuItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                const mode = this.dataset.mode;

                // 更新当前模式
                currentMode = mode;

                // 更新触发按钮的图标和文本
                if (modeConfig[mode]) {
                    modeIcon.src = modeConfig[mode].icon;
                    modeText.textContent = modeConfig[mode].text;
                }

                // 更新菜单项的激活状态
                menuItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');

                // 关闭下拉菜单
                dropdown.classList.remove('open');

                console.log('切换到模式:', mode, modeConfig[mode].text);
            });
        });
    }

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', function(e) {
        if (dropdown && !dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });

    // 保存getCurrentSearchMode的引用，供其他函数使用
    window.getCurrentMode = function() {
        return currentMode;
    };
}

// 获取当前搜索模式
function getCurrentSearchMode() {
    // 使用新的模式获取方式
    if (window.getCurrentMode) {
        return window.getCurrentMode();
    }
    // 默认返回企业知识模式
    return 'enterprise';
}

// ============= 历史消息滚动加载功能 =============

// 初始化滚动监听
function initScrollListener() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;

    let scrollTimeout;
    console.log('初始化滚动监听器');

    chatContainer.addEventListener('scroll', function() {
        // 防抖处理
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            handleScroll();
        }, 100);
    });
}

// 处理滚动事件
function handleScroll() {
    const chatContainer = document.getElementById('chatContainer');

    // 检查是否滚动到顶部附近（距离顶部小于100px）
    if (chatContainer.scrollTop < 100) {
        // 如果有更多历史且未在加载中
        if (historyLoader.hasMore && !historyLoader.loading && historyLoader.conversationId) {
            console.log('🔼 [滚动触发] 加载更多历史:', {
                scrollTop: chatContainer.scrollTop,
                currentFirstId: historyLoader.firstMessageId,
                hasMore: historyLoader.hasMore,
                loading: historyLoader.loading,
                conversationId: historyLoader.conversationId
            });
            loadMoreHistory();
        }
    }
}

// 加载更多历史消息
async function loadMoreHistory() {
    // 防止重复请求：检查是否正在加载、是否还有更多数据、是否有正在进行的请求
    if (historyLoader.loading || !historyLoader.hasMore || historyLoader.pendingRequest) {
        console.log('跳过加载：', {
            loading: historyLoader.loading,
            hasMore: historyLoader.hasMore,
            hasPendingRequest: !!historyLoader.pendingRequest
        });
        return;
    }

    historyLoader.loading = true;
    const chatContainer = document.getElementById('chatContainer');

    // 1. 显示加载指示器
    showHistoryLoadingIndicator();

    // 2. 记录当前滚动位置
    const oldScrollHeight = chatContainer.scrollHeight;
    const oldScrollTop = chatContainer.scrollTop;

    try {
        // 3. 请求更多历史
        const url = `/api/conversations/${historyLoader.conversationId}/history?` +
            `afterId=${historyLoader.firstMessageId}&limit=10`;

        console.log('📍 [加载历史] 请求参数:', {
            conversationId: historyLoader.conversationId,
            afterId: historyLoader.firstMessageId,
            limit: 10,
            url: url
        });

        // 存储正在进行的请求
        historyLoader.pendingRequest = fetch(url, {
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' // 确保包含 session cookie
        });

        const response = await historyLoader.pendingRequest;
        historyLoader.pendingRequest = null;

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('📥 [加载历史] 响应数据:', {
            count: data.messages?.length || 0,
            hasMore: data.hasMore,
            responseFirstId: data.firstId,
            actualFirstMessage: data.messages?.[0] ? {
                id: data.messages[0].id,
                content: data.messages[0].content?.substring(0, 50)
            } : null,
            actualLastMessage: data.messages?.length > 0 ? {
                id: data.messages[data.messages.length - 1].id,
                content: data.messages[data.messages.length - 1].content?.substring(0, 50)
            } : null
        });

        if (data.messages && data.messages.length > 0) {
            // 4. 在顶部插入新消息（返回实际插入的消息数）
            const insertedCount = insertHistoryMessages(data.messages);

            if (insertedCount > 0) {
                // 5. 只有在实际插入了消息时才更新状态
                const oldFirstId = historyLoader.firstMessageId;
                historyLoader.hasMore = data.hasMore;
                historyLoader.firstMessageId = data.firstId || data.messages[0].id;

                console.log('🔄 [加载历史] 更新firstId:', {
                    oldFirstId: oldFirstId,
                    newFirstId: historyLoader.firstMessageId,
                    hasMore: historyLoader.hasMore,
                    insertedCount: insertedCount,
                    source: data.firstId ? 'backend-firstId' : 'fallback-to-first-message'
                });

                // 6. 保持滚动位置（防止跳动）
                const newScrollHeight = chatContainer.scrollHeight;
                const scrollDiff = newScrollHeight - oldScrollHeight;
                chatContainer.scrollTop = oldScrollTop + scrollDiff;

                console.log('滚动位置调整:', {
                    oldHeight: oldScrollHeight,
                    newHeight: newScrollHeight,
                    diff: scrollDiff,
                    newScrollTop: chatContainer.scrollTop
                });
            } else {
                console.log('⚠️ [加载历史] 所有消息都是重复的，不更新firstId', {
                    attemptedCount: data.messages.length,
                    currentFirstId: historyLoader.firstMessageId,
                    hasMore: data.hasMore
                });
                // 如果所有消息都是重复的，可能已经到达历史顶端
                if (!data.hasMore) {
                    historyLoader.hasMore = false;
                }
            }
        } else {
            historyLoader.hasMore = false;
            console.log('没有更多历史消息');
        }
    } catch (error) {
        historyLoader.pendingRequest = null;
        console.error('加载历史失败:', error);
        showErrorToast('加载历史消息失败');
    } finally {
        historyLoader.loading = false;
        historyLoader.pendingRequest = null;  // 确保清理
        hideHistoryLoadingIndicator();
    }
}

// 在顶部插入历史消息
function insertHistoryMessages(messages) {
    const chatContainer = document.getElementById('chatContainer');
    const fragment = document.createDocumentFragment();

    // 获取现有消息的ID集合，避免重复插入
    const existingMessageIds = new Set();
    chatContainer.querySelectorAll('[data-message-id]').forEach(msg => {
        existingMessageIds.add(msg.getAttribute('data-message-id'));
    });

    // 过滤掉已存在的消息
    messages = messages.filter(msg => !existingMessageIds.has(msg.id));

    if (messages.length === 0) {
        console.log('没有新的历史消息需要插入（都是重复的）');
        return 0;  // 返回插入的消息数量
    }

    messages.forEach(msg => {
        if (!msg.content || !msg.content.trim()) return;

        // 创建消息元素（复用现有的消息渲染逻辑）
        const messageDiv = document.createElement('div');
        messageDiv.setAttribute('data-message-id', msg.id);  // 添加消息ID标识

        if (msg.role === 'user') {
            messageDiv.className = 'message user-message';
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = msg.content;
            messageDiv.appendChild(contentDiv);
        } else if (msg.role === 'assistant') {
            messageDiv.className = 'message assistant-message';

            const messageWrapper = document.createElement('div');
            messageWrapper.className = 'message-wrapper';

            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'avatar assistant-avatar';
            const img = document.createElement('img');
            img.src = '/img/max2.jpg';
            img.alt = '机器人';
            img.className = 'robot-avatar-img';
            avatarDiv.appendChild(img);

            const contentArea = document.createElement('div');
            contentArea.className = 'content-area';

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';

            // 渲染Markdown内容
            if (msg.contentType === 'text' || msg.contentType === 'object_string' || !msg.contentType) {
                try {
                    contentDiv.innerHTML = parseMarkdownCleaned(msg.content, { breaks: true, gfm: true });

                    // 重置历史消息中的图片容器状态，允许重新激活
                    // 注意：不在这里调用 activateImageLoading()，因为此时元素还未添加到 DOM
                    contentDiv.querySelectorAll('.image-loading-container').forEach(imgContainer => {
                        imgContainer.removeAttribute('data-activated');
                        imgContainer.removeAttribute('data-revealed');
                    });

                    // 处理代码块
                    contentDiv.querySelectorAll('pre code').forEach(block => {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'code-block-wrapper';
                        block.parentNode.insertBefore(wrapper, block);
                        wrapper.appendChild(block);

                        const copyBtn = document.createElement('button');
                        copyBtn.className = 'copy-code-btn';
                        copyBtn.textContent = '复制代码';
                        copyBtn.onclick = function() {
                            navigator.clipboard.writeText(block.textContent).then(() => {
                                copyBtn.textContent = '已复制！';
                                setTimeout(() => {
                                    copyBtn.textContent = '复制代码';
                                }, 2000);
                            });
                        };
                        wrapper.appendChild(copyBtn);
                    });
                } catch (e) {
                    console.error('Markdown解析失败:', e);
                    contentDiv.textContent = msg.content;
                }
            } else {
                contentDiv.textContent = msg.content;
            }

            contentArea.appendChild(contentDiv);
            messageWrapper.appendChild(avatarDiv);
            messageWrapper.appendChild(contentArea);
            messageDiv.appendChild(messageWrapper);
        }

        // 添加淡入动画
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(-10px)';
        fragment.appendChild(messageDiv);
    });

    // 在第一个消息前插入（如果有欢迎消息，则在欢迎消息后插入）
    const welcomeMessage = document.getElementById('welcomeMessage');
    const firstMessage = chatContainer.querySelector('.message:not(#welcomeMessage)');

    if (firstMessage) {
        chatContainer.insertBefore(fragment, firstMessage);
    } else if (welcomeMessage) {
        // 如果只有欢迎消息，在其后插入
        welcomeMessage.after(fragment);
    } else {
        chatContainer.appendChild(fragment);
    }

    // 触发淡入动画
    requestAnimationFrame(() => {
        const newMessages = chatContainer.querySelectorAll('.message[style*="opacity: 0"]');
        newMessages.forEach((msg, index) => {
            setTimeout(() => {
                msg.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                msg.style.opacity = '1';
                msg.style.transform = 'translateY(0)';
            }, index * 50); // 每条消息延迟50ms
        });
    });

    // 所有消息已添加到DOM，现在激活图片加载
    activateImageLoading();

    return messages.length;  // 返回实际插入的消息数量
}

// 显示加载指示器
function showHistoryLoadingIndicator() {
    const chatContainer = document.getElementById('chatContainer');

    // 检查是否已存在加载器
    if (document.getElementById('historyLoader')) return;

    // 创建加载提示
    const loader = document.createElement('div');
    loader.id = 'historyLoader';
    loader.className = 'history-loader';
    loader.innerHTML = `
        <div class="loader-content">
            <div class="spinner"></div>
            <span>加载更多历史...</span>
        </div>
    `;

    // 在第一个消息前插入（如果有欢迎消息，则在欢迎消息后插入）
    const welcomeMessage = document.getElementById('welcomeMessage');
    const firstMessage = chatContainer.querySelector('.message:not(#welcomeMessage)');

    if (firstMessage) {
        chatContainer.insertBefore(loader, firstMessage);
    } else if (welcomeMessage) {
        welcomeMessage.after(loader);
    } else {
        chatContainer.appendChild(loader);
    }
}

// 隐藏加载指示器
function hideHistoryLoadingIndicator() {
    const loader = document.getElementById('historyLoader');
    if (loader) {
        // 淡出效果
        loader.style.transition = 'opacity 0.3s ease';
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.remove();
        }, 300);
    }
}

// 显示错误提示
function showErrorToast(message) {
    // 创建toast提示
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff4444;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 10000;
        animation: slideDown 0.3s ease;
    `;

    document.body.appendChild(toast);

    // 3秒后自动消失
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// ============================================================================
// Sidebar 状态管理和交互逻辑
// ============================================================================

const sidebarState = {
    collapsed: JSON.parse(localStorage.getItem('sidebarCollapsed') || 'false'),
};

const sidebarElements = {
    sidebar: document.getElementById('sidebar'),
    list: document.getElementById('thread-list'),
    btnNew: document.getElementById('btn-new'),
    btnSearch: document.getElementById('btn-search'),
    searchWrap: document.getElementById('search-wrap'),
    inpSearch: document.getElementById('inp-search'),
    btnCollapse: document.getElementById('btn-collapse'),

    // Sidebar 用户信息元素
    sidebarLoginButton: document.getElementById('sidebarLoginButton'),
    sidebarUserInfo: document.getElementById('sidebarUserInfo'),
    sidebarUserInfoBtn: document.getElementById('sidebarUserInfoBtn'),
    sidebarUserName: document.getElementById('sidebarUserName'),
    sidebarUserAvatar: document.getElementById('sidebarUserAvatar'),
    sidebarUserMenu: document.getElementById('sidebarUserMenu'),
    sidebarLogoutBtn: document.getElementById('sidebarLogoutBtn'),

    // 折叠状态下的元素
    collapsedExpandBtn: document.getElementById('collapsed-expand-btn'),
    collapsedNewBtn: document.getElementById('collapsed-new-btn'),
    collapsedSearchBtn: document.getElementById('collapsed-search-btn'),
    collapsedUserBtn: document.getElementById('collapsed-user-btn'),
    collapsedUserAvatarText: document.getElementById('collapsedUserAvatarText'),

    // 浮动搜索框
    floatingSearchOverlay: document.getElementById('floatingSearchOverlay'),
    floatingSearchBox: document.getElementById('floatingSearchBox'),
    floatingSearchInput: document.getElementById('floatingSearchInput'),
    closeFloatingSearch: document.getElementById('closeFloatingSearch'),
    floatingSearchResults: document.getElementById('floatingSearchResults'),
    floatingSearchEmpty: document.getElementById('floatingSearchEmpty'),

    // 浮动用户菜单
    floatingUserMenuOverlay: document.getElementById('floatingUserMenuOverlay'),
    floatingUserMenu: document.getElementById('floatingUserMenu'),
    floatingUserMenuAvatar: document.getElementById('floatingUserMenuAvatar'),
    floatingUserMenuName: document.getElementById('floatingUserMenuName'),
    floatingUserMenuEmail: document.getElementById('floatingUserMenuEmail'),
    floatingUserMenuLogout: document.getElementById('floatingUserMenuLogout'),
};

// 渲染会话列表
function renderThreadList() {
    if (!sidebarElements.list) return;

    // 处理折叠状态
    if (sidebarElements.sidebar) {
        if (sidebarState.collapsed) {
            // 收起:56px,只显示 toggle icon
            sidebarElements.sidebar.classList.add('collapsed');
            sidebarElements.sidebar.classList.remove('w-[260px]');
            sidebarElements.sidebar.classList.add('w-[56px]');
        } else {
            // 展开:260px,显示所有内容
            sidebarElements.sidebar.classList.remove('collapsed');
            sidebarElements.sidebar.classList.remove('w-[56px]');
            sidebarElements.sidebar.classList.add('w-[260px]');
        }
        localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarState.collapsed));
    }

    // 收起状态下不渲染列表
    if (sidebarState.collapsed) {
        return;
    }

    // 过滤和排序
    const keyword = (sidebarElements.inpSearch?.value || '').trim().toLowerCase();
    const data = sidebarState.threads
        .filter(t => !keyword || t.title.toLowerCase().includes(keyword))
        .sort((a, b) => b.updatedAt - a.updatedAt);

    // 渲染列表
    sidebarElements.list.innerHTML = data
        .map(
            t => `<button data-id="${t.id}" class="w-full text-left px-3 py-3 rounded-md my-1 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors ${
                sidebarState.activeId === t.id ? 'bg-slate-100 dark:bg-gray-600' : ''
            }">
                <div class="text-[13px] text-slate-800 dark:text-gray-200 truncate">${escapeHtml(t.title)}</div>
            </button>`
        )
        .join('');
}

// 仅负责根据 collapsed 状态更新侧边栏样式（不改动列表内容）
function applySidebarCollapsed() {
    if (!sidebarElements.sidebar) return;
    if (sidebarState.collapsed) {
        sidebarElements.sidebar.classList.add('collapsed');
        sidebarElements.sidebar.classList.remove('w-[260px]');
        sidebarElements.sidebar.classList.add('w-[56px]');
        // 同步折叠状态下的用户头像
        updateCollapsedUserAvatar();
    } else {
        sidebarElements.sidebar.classList.remove('collapsed');
        sidebarElements.sidebar.classList.remove('w-[56px]');
        sidebarElements.sidebar.classList.add('w-[260px]');
    }
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarState.collapsed));
}

// 更新折叠状态下的用户头像
function updateCollapsedUserAvatar() {
    if (sidebarElements.collapsedUserAvatarText) {
        updateAvatarDisplay(
            sidebarElements.collapsedUserAvatarText,
            authState.avatar,
            authState.userName || authState.userId
        );
    }
}

// 打开浮动搜索框
function openFloatingSearch() {
    if (!sidebarElements.floatingSearchBox) return;

    // 计算搜索框位置（从搜索按钮右侧弹出）
    const searchBtn = sidebarElements.collapsedSearchBtn;
    if (searchBtn) {
        const rect = searchBtn.getBoundingClientRect();
        sidebarElements.floatingSearchBox.style.left = `${rect.right + 8}px`;
        sidebarElements.floatingSearchBox.style.top = `${rect.top}px`;
    }

    // 显示遮罩层和搜索框
    sidebarElements.floatingSearchOverlay.style.display = 'block';
    sidebarElements.floatingSearchBox.style.display = 'block';

    // 聚焦输入框
    setTimeout(() => {
        sidebarElements.floatingSearchInput?.focus();
    }, 100);

    // 显示最近的会话列表（使用真实的会话数据）
    const recentConversations = [...conversationListState.all].slice(0, 20); // 显示最近 20 条
    renderFloatingSearchResults(recentConversations, false);
}

// 关闭浮动搜索框
function closeFloatingSearch() {
    if (sidebarElements.floatingSearchOverlay) {
        sidebarElements.floatingSearchOverlay.style.display = 'none';
    }
    if (sidebarElements.floatingSearchBox) {
        sidebarElements.floatingSearchBox.style.display = 'none';
    }
    if (sidebarElements.floatingSearchInput) {
        sidebarElements.floatingSearchInput.value = '';
    }
}

// 渲染浮动搜索结果
// isSearching: true 表示正在搜索，false 表示显示默认列表
function renderFloatingSearchResults(results, isSearching = true) {
    if (!sidebarElements.floatingSearchResults) return;

    if (results.length === 0) {
        const emptyMessage = isSearching ? '暂无搜索结果' : '暂无会话记录';
        sidebarElements.floatingSearchResults.innerHTML = `
            <div id="floatingSearchEmpty" class="py-12 text-center text-gray-400 text-sm">
                ${emptyMessage}
            </div>
        `;
        return;
    }

    sidebarElements.floatingSearchResults.innerHTML = results
        .map(
            item => {
                const title = item.title || '新对话';
                const timeStr = ''; // 暂时不显示时间
                return `
                <div class="search-result-item" data-id="${item.conversationId}">
                    <div class="search-result-title">${escapeHtml(title)}</div>
                </div>
            `;
            }
        )
        .join('');

    // 添加点击事件
    sidebarElements.floatingSearchResults.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', async () => {
            const conversationId = el.dataset.id;
            await switchToConversation(conversationId);
            closeFloatingSearch();
        });
    });
}

// 打开浮动用户菜单（支持传入锚点元素，默认使用折叠头像按钮）
function openFloatingUserMenu(anchorEl) {
    if (!sidebarElements.floatingUserMenu) return;

    const targetEl = anchorEl || sidebarElements.collapsedUserBtn;

    // 计算菜单位置（从锚点元素右侧弹出，底部对齐）
    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        sidebarElements.floatingUserMenu.style.left = `${rect.right + 8}px`;
        sidebarElements.floatingUserMenu.style.bottom = `${window.innerHeight - rect.bottom}px`;
    }

    // 同步用户信息
    if (sidebarElements.floatingUserMenuName) {
        sidebarElements.floatingUserMenuName.textContent = authState.userName || authState.userId;
    }
    if (sidebarElements.floatingUserMenuAvatar) {
        updateAvatarDisplay(
            sidebarElements.floatingUserMenuAvatar,
            authState.avatar,
            authState.userName || authState.userId
        );
    }
    if (sidebarElements.floatingUserMenuEmail) {
        sidebarElements.floatingUserMenuEmail.textContent = '';
    }

    // 显示遮罩层和菜单
    sidebarElements.floatingUserMenuOverlay.style.display = 'block';
    sidebarElements.floatingUserMenu.style.display = 'block';
}

// 关闭浮动用户菜单
function closeFloatingUserMenu() {
    if (sidebarElements.floatingUserMenuOverlay) {
        sidebarElements.floatingUserMenuOverlay.style.display = 'none';
    }
    if (sidebarElements.floatingUserMenu) {
        sidebarElements.floatingUserMenu.style.display = 'none';
    }
}

// 格式化时间（相对时间）
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return new Date(timestamp).toLocaleDateString();
}

// 初始化会话数据(临时模拟数据)
function bootstrapThreads() {
    sidebarState.threads = [
        { id: 't1', title: '这是一个对话 1', updatedAt: Date.now() - 100000 },
        { id: 't2', title: '这是一个对话 2', updatedAt: Date.now() - 90000 },
        { id: 't3', title: '这是一个对话 3', updatedAt: Date.now() - 80000 },
        { id: 't4', title: '这是一个对话 4', updatedAt: Date.now() - 70000 },
    ];
    sidebarState.activeId = 't2';
}

// 创建新会话
function createThread() {
    const id = 't' + Math.random().toString(36).slice(2, 8);
    const item = { id, title: '新的对话', updatedAt: Date.now() };
    sidebarState.threads.unshift(item);
    sidebarState.activeId = id;
    renderThreadList();

    // TODO: 与主聊天区联动 - 清空当前对话
    console.log('创建新会话:', id);
}

// 选择会话
function selectThread(id) {
    sidebarState.activeId = id;
    const t = sidebarState.threads.find(x => x.id === id);
    if (t) {
        t.updatedAt = Date.now();
    }
    renderThreadList();

    // TODO: 加载该会话历史
    console.log('切换到会话:', id);
}

// 同步 sidebar 用户信息显示
function syncSidebarUserInfo() {
    if (!sidebarElements.sidebarLoginButton || !sidebarElements.sidebarUserInfo) return;

    // 重新获取用户菜单相关元素（确保元素存在）
    sidebarElements.sidebarUserInfoBtn = document.getElementById('sidebarUserInfoBtn');
    sidebarElements.sidebarUserMenu = document.getElementById('sidebarUserMenu');
    sidebarElements.sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

    // 获取折叠状态元素
    const collapsedUserAvatar = document.getElementById('collapsedUserAvatar');
    const collapsedLoginButton = document.getElementById('collapsedLoginButton');

    if (authState.isLoggedIn) {
        // 显示已登录状态
        sidebarElements.sidebarLoginButton.style.display = 'none';
        sidebarElements.sidebarUserInfo.style.display = 'block';

        // 更新用户名和头像
        if (sidebarElements.sidebarUserName) {
            sidebarElements.sidebarUserName.textContent = authState.userName || authState.userId;
        }
        if (sidebarElements.sidebarUserAvatar) {
            updateAvatarDisplay(sidebarElements.sidebarUserAvatar, authState.avatar, authState.userName || authState.userId);
        }

        // 同步折叠状态下的用户头像
        updateCollapsedUserAvatar();

        // 折叠状态：显示用户头像，隐藏登录按钮
        if (collapsedUserAvatar) collapsedUserAvatar.classList.remove('hidden');
        if (collapsedLoginButton) collapsedLoginButton.classList.add('hidden');

        // 确保用户信息按钮的事件监听器已绑定
        if (sidebarElements.sidebarUserInfoBtn) {
            sidebarElements.sidebarUserInfoBtn.removeEventListener('click', handleSidebarUserInfoBtnClick);
            sidebarElements.sidebarUserInfoBtn.addEventListener('click', handleSidebarUserInfoBtnClick);
        }
    } else {
        // 显示未登录状态
        sidebarElements.sidebarLoginButton.style.display = 'flex';
        sidebarElements.sidebarUserInfo.style.display = 'none';

        // 折叠状态：隐藏用户头像，显示登录按钮
        if (collapsedUserAvatar) collapsedUserAvatar.classList.add('hidden');
        if (collapsedLoginButton) collapsedLoginButton.classList.remove('hidden');
    }
}

// 用户信息按钮点击处理函数（独立函数，便于移除和重新绑定）
function handleSidebarUserInfoBtnClick(e) {
    e.stopPropagation();  // 防止冒泡触发外部点击
    
    // 企微端禁用登出弹窗
    if (isWeComEnvironment()) {
        return;
    }

    if (sidebarElements.sidebarUserMenu) {
        const isHidden = sidebarElements.sidebarUserMenu.style.display === 'none';

        if (isHidden) {
            // 同步用户信息到菜单头部
            const menuUserName = document.getElementById('sidebarMenuUserName');
            const menuAvatar = document.getElementById('sidebarMenuAvatar');

            if (menuUserName) {
                menuUserName.textContent = authState.userName || authState.userId;
            }
            if (menuAvatar) {
                updateAvatarDisplay(
                    menuAvatar,
                    authState.avatar,
                    authState.userName || authState.userId
                );
            }
        }

        sidebarElements.sidebarUserMenu.style.display = isHidden ? 'block' : 'none';

        // 切换按钮激活状态（箭头旋转）
        if (sidebarElements.sidebarUserInfoBtn) {
            if (isHidden) {
                sidebarElements.sidebarUserInfoBtn.classList.add('active');
            } else {
                sidebarElements.sidebarUserInfoBtn.classList.remove('active');
            }
        }
    }
}

// 初始化 Sidebar 事件监听
function initSidebarEvents() {
    // 重新获取用户菜单相关元素（确保DOM已加载）
    sidebarElements.sidebarUserInfoBtn = document.getElementById('sidebarUserInfoBtn');
    sidebarElements.sidebarUserMenu = document.getElementById('sidebarUserMenu');
    sidebarElements.sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    sidebarElements.sidebarLoginButton = document.getElementById('sidebarLoginButton');
    sidebarElements.sidebarUserInfo = document.getElementById('sidebarUserInfo');

    // 重新获取搜索相关元素（确保DOM已加载）
    sidebarElements.btnSearch = document.getElementById('btn-search');
    sidebarElements.searchWrap = document.getElementById('search-wrap');
    sidebarElements.inpSearch = document.getElementById('inp-search');

    // 新建对话按钮
    sidebarElements.btnNew?.addEventListener('click', async () => {
        console.log('[Sidebar] 点击"开启新对话"按钮');

        // 企微端：关闭侧边栏
        if (isWeComEnvironment() && window.closeMobileSidebar) {
            console.log('[企微端] 关闭侧边栏');
            setTimeout(() => {
                window.closeMobileSidebar();
            }, 150);
        }

        // 清空当前会话ID（进入"无会话"状态）
        chatState.conversationId = null;

        // 清空聊天区域
        clearChatArea();

        // 显示欢迎界面
        await initializeWelcomeInterface();

        // 取消侧边栏所有高亮
        highlightConversation(null);

        console.log('[Sidebar] 已准备好，等待用户发送第一条消息时创建会话');
    });

    // 搜索按钮 - 切换到搜索模式
    sidebarElements.btnSearch?.addEventListener('click', () => {
        const conversationHeader = document.getElementById('conversation-header');
        const searchWrap = document.getElementById('search-wrap');
        
        if (conversationHeader && searchWrap) {
            conversationHeader.classList.add('hidden');
            searchWrap.classList.remove('hidden');
            searchWrap.classList.add('flex');
            sidebarElements.inpSearch?.focus();
        }
    });

    // 关闭搜索按钮 - 切换回标题模式
    const btnCloseSearch = document.getElementById('btn-close-search');
    btnCloseSearch?.addEventListener('click', () => {
        const conversationHeader = document.getElementById('conversation-header');
        const searchWrap = document.getElementById('search-wrap');
        const inpSearch = document.getElementById('inp-search');
        
        if (conversationHeader && searchWrap) {
            searchWrap.classList.add('hidden');
            searchWrap.classList.remove('flex');
            conversationHeader.classList.remove('hidden');
            
            // 清空搜索框
            if (inpSearch) {
                inpSearch.value = '';
            }
            
            // 重新渲染完整列表
            renderConversationList(conversationListState.all);
        }
    });

    // 搜索输入（使用新的会话数据过滤）
    sidebarElements.inpSearch?.addEventListener('input', applySidebarSearch);

    // 折叠按钮
    sidebarElements.btnCollapse?.addEventListener('click', () => {
        sidebarState.collapsed = !sidebarState.collapsed;
        applySidebarCollapsed();
    });

    // 折叠状态 - 展开按钮
    sidebarElements.collapsedExpandBtn?.addEventListener('click', () => {
        sidebarState.collapsed = false;
        applySidebarCollapsed();
    });

    // 折叠状态 - 新建对话按钮
    sidebarElements.collapsedNewBtn?.addEventListener('click', async () => {
        console.log('[Sidebar折叠] 点击"开启新对话"按钮');

        // 企微端：关闭侧边栏
        if (isWeComEnvironment() && window.closeMobileSidebar) {
            console.log('[企微端] 关闭侧边栏');
            setTimeout(() => {
                window.closeMobileSidebar();
            }, 150);
        }

        // 清空当前会话ID（进入"无会话"状态）
        chatState.conversationId = null;

        // 清空聊天区域
        clearChatArea();

        // 显示欢迎界面
        await initializeWelcomeInterface();

        // 取消侧边栏所有高亮
        highlightConversation(null);

        console.log('[Sidebar折叠] 已准备好，等待用户发送第一条消息时创建会话');
    });

    // 折叠状态 - 搜索按钮
    sidebarElements.collapsedSearchBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        openFloatingSearch();
    });

    // 折叠状态 - 用户头像按钮
    sidebarElements.collapsedUserBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        openFloatingUserMenu();
    });

    // 折叠状态 - 登录按钮
    const collapsedLoginBtn = document.getElementById('collapsed-login-btn');
    if (collapsedLoginBtn) {
        collapsedLoginBtn.addEventListener('click', () => {
            showLoginModal();
        });
    }

    // 列表点击
    sidebarElements.list?.addEventListener('click', e => {
        const btn = e.target.closest('button[data-id]');
        if (btn) {
            selectThread(btn.dataset.id);
        }
    });

    // Sidebar 登录按钮
    sidebarElements.sidebarLoginButton?.addEventListener('click', () => {
        showLoginModal();
    });

    // Sidebar 用户信息按钮 - 使用浮动菜单（避免被sidebar的overflow裁剪）
    if (sidebarElements.sidebarUserInfoBtn) {
        // 移除旧的切换逻辑并绑定打开浮动菜单
        sidebarElements.sidebarUserInfoBtn.removeEventListener('click', handleSidebarUserInfoBtnClick);
        sidebarElements.sidebarUserInfoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 企微端禁用弹窗
            if (isWeComEnvironment()) {
                return;
            }
            
            openFloatingUserMenu(sidebarElements.sidebarUserInfoBtn);
        });
    }

    // Sidebar 登出按钮
    sidebarElements.sidebarLogoutBtn?.addEventListener('click', () => {
        handleLogout();
        if (sidebarElements.sidebarUserMenu) {
            sidebarElements.sidebarUserMenu.style.display = 'none';
            sidebarElements.sidebarUserInfoBtn?.classList.remove('active');  // 移除激活状态
        }
    });

    // 点击外部关闭用户菜单
    document.addEventListener('click', (e) => {
        if (sidebarElements.sidebarUserMenu &&
            sidebarElements.sidebarUserInfoBtn &&
            !sidebarElements.sidebarUserInfoBtn.contains(e.target) &&
            !sidebarElements.sidebarUserMenu.contains(e.target)) {
            sidebarElements.sidebarUserMenu.style.display = 'none';
            sidebarElements.sidebarUserInfoBtn?.classList.remove('active');  // 移除激活状态
        }
    });

    // 浮动搜索框 - 关闭按钮
    sidebarElements.closeFloatingSearch?.addEventListener('click', closeFloatingSearch);

    // 浮动搜索框 - 点击遮罩关闭
    sidebarElements.floatingSearchOverlay?.addEventListener('click', closeFloatingSearch);

    // 浮动搜索框 - ESC 键关闭
    sidebarElements.floatingSearchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFloatingSearch();
        }
    });

    // 浮动搜索框 - 实时搜索
    let searchTimeout;
    sidebarElements.floatingSearchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const keyword = e.target.value.trim().toLowerCase();
            if (!keyword) {
                // 清空关键词时，显示最近的会话列表
                const recentConversations = [...conversationListState.all].slice(0, 20);
                renderFloatingSearchResults(recentConversations, false);
                return;
            }
            // 过滤搜索结果（搜索标题）
            const results = conversationListState.all
                .filter(conv => {
                    const title = conv.title || '新对话';
                    return title.toLowerCase().includes(keyword);
                });
            renderFloatingSearchResults(results, true);
        }, 300); // 300ms 防抖
    });

    // 浮动用户菜单 - 点击遮罩关闭
    sidebarElements.floatingUserMenuOverlay?.addEventListener('click', closeFloatingUserMenu);

    // 浮动用户菜单 - 登出按钮
    sidebarElements.floatingUserMenuLogout?.addEventListener('click', () => {
        handleLogout();
        closeFloatingUserMenu();
    });

    // ESC 键关闭所有浮动组件
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFloatingSearch();
            closeFloatingUserMenu();
        }
    });
}

// 旧的Sidebar初始化代码 - 已废弃，使用新的会话管理系统
// 注释原因：bootstrapThreads()会初始化模拟数据，与新的Coze API会话管理冲突
/*
function initSidebar() {
    bootstrapThreads();
    renderThreadList();
    initSidebarEvents();
    syncSidebarUserInfo();
}

// 在页面加载完成后初始化 Sidebar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
} else {
    initSidebar();
}
*/
