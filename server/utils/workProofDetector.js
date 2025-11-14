/**
 * 工作证明请求检测器
 * 用于识别用户输入是否为工作证明相关请求
 */

const logger = require('./logger');

/**
 * 工作证明相关关键词列表
 */
const WORK_PROOF_KEYWORDS = [
    '工作证明',
    '在职证明',
    '开具证明',
    '证明用途',
    '开具工作证明',
    '申请证明',
    '需要证明',
    'employment certificate',
    'work certificate',
    'proof of employment'
];

/**
 * 检测用户输入是否为工作证明请求
 * @param {string} query - 用户输入的查询文本
 * @returns {boolean} 是否为工作证明请求
 */
function isWorkProofRequest(query) {
    if (!query || typeof query !== 'string') {
        return false;
    }

    // 转换为小写并去除空格，提高匹配准确性
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, '');

    // 检查是否包含任何关键词
    const matched = WORK_PROOF_KEYWORDS.some(keyword => {
        const normalizedKeyword = keyword.toLowerCase().replace(/\s+/g, '');
        return normalizedQuery.includes(normalizedKeyword);
    });

    if (matched) {
        logger.info('[WorkProofDetector] 检测到工作证明请求', {
            query: query.substring(0, 100), // 仅记录前100字符
            matched: true
        });
    }

    return matched;
}

/**
 * 获取所有关键词（用于测试和调试）
 * @returns {string[]} 关键词列表
 */
function getKeywords() {
    return [...WORK_PROOF_KEYWORDS];
}

module.exports = {
    isWorkProofRequest,
    getKeywords
};

