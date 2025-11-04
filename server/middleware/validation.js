/**
 * Input Validation Middleware
 * 提供输入验证和清理功能
 */

const { body, query, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * 处理验证错误
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        logger.warn('Input validation failed', {
            type: 'validation_error',
            errors: errors.array(),
            path: req.path,
            method: req.method
        });
        
        return res.status(400).json({
            error: '输入验证失败',
            code: 'VALIDATION_ERROR',
            details: errors.array().map(err => ({
                field: err.path,
                message: err.msg,
                value: err.value
            }))
        });
    }
    
    next();
};

/**
 * 聊天请求验证规则
 */
const validateChatRequest = [
    query('query')
        .optional()
        .trim()
        .isLength({ min: 1, max: 4000 })
        .withMessage('查询内容长度必须在1-4000字符之间')
        .customSanitizer(value => {
            // 防止XSS攻击，但保留必要的标点符号
            return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                       .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
        }),
    
    query('user')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('用户ID长度不能超过100字符')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('用户ID只能包含字母、数字、下划线和连字符'),
    
    query('conversationId')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('会话ID长度不能超过100字符'),
    
    query('stream')
        .optional()
        .isIn(['true', 'false', '1', '0'])
        .withMessage('stream参数必须是boolean值'),
    
    handleValidationErrors
];

/**
 * 文本聊天POST请求验证
 */
const validateChatPostRequest = [
    body('message')
        .trim()
        .notEmpty()
        .withMessage('消息内容不能为空')
        .isLength({ min: 1, max: 4000 })
        .withMessage('消息长度必须在1-4000字符之间')
        .customSanitizer(value => {
            // 防止XSS攻击
            return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                       .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
        }),
    
    body('conversationId')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('会话ID长度不能超过100字符'),
    
    body('stream')
        .optional()
        .isBoolean()
        .withMessage('stream参数必须是boolean值'),
    
    handleValidationErrors
];

/**
 * 会话ID参数验证
 */
const validateConversationId = [
    param('id')
        .trim()
        .notEmpty()
        .withMessage('会话ID不能为空')
        .isLength({ max: 100 })
        .withMessage('会话ID长度不能超过100字符')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('会话ID格式无效'),
    
    handleValidationErrors
];

/**
 * 创建会话请求验证
 */
const validateCreateConversation = [
    body('title')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('会话标题长度不能超过200字符'),
    
    body('metadata')
        .optional()
        .isObject()
        .withMessage('metadata必须是一个对象'),
    
    handleValidationErrors
];

/**
 * 音频转文字请求验证
 */
const validateAudioToText = [
    body('audioData')
        .optional()
        .isString()
        .withMessage('音频数据必须是base64字符串'),
    
    body('format')
        .optional()
        .isIn(['ogg', 'mp3', 'wav', 'amr'])
        .withMessage('不支持的音频格式'),
    
    handleValidationErrors
];

/**
 * 管理员更新token请求验证
 */
const validateUpdateToken = [
    body('newToken')
        .trim()
        .notEmpty()
        .withMessage('新token不能为空')
        .isLength({ min: 10 })
        .withMessage('Token长度太短'),
    
    handleValidationErrors
];

/**
 * 分页参数验证
 */
const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('页码必须是大于0的整数'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('每页数量必须在1-100之间'),
    
    handleValidationErrors
];

/**
 * 创建自定义验证器
 * @param {Array} rules - 验证规则数组
 * @returns {Array} 包含验证规则和错误处理的中间件数组
 */
function createValidator(rules) {
    return [...rules, handleValidationErrors];
}

module.exports = {
    validateChatRequest,
    validateChatPostRequest,
    validateConversationId,
    validateCreateConversation,
    validateAudioToText,
    validateUpdateToken,
    validatePagination,
    createValidator,
    handleValidationErrors
};