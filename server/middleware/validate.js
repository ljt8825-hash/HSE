/**
 * 请求参数校验中间件
 * 基于 Zod Schema 的统一校验层
 */
const { z } = require('zod');

/**
 * 创建校验中间件
 * @param {z.ZodSchema} schema - Zod Schema
 * @param {string} source - 校验来源: 'body' | 'query' | 'params'
 * @returns {Function} Express middleware
 */
function validate(schema, source = 'body') {
  return async (req, res, next) => {
    try {
      const data = req[source];
      const parsed = await schema.parseAsync(data);
      // 将校验后的数据替换原始数据（类型转换、默认值等生效）
      req[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }));
        return res.status(400).json({
          success: false,
          code: 400,
          message: '请求参数校验失败',
          errors: issues
        });
      }
      return res.status(400).json({
        success: false,
        code: 400,
        message: '请求参数校验异常',
        error: err.message
      });
    }
  };
}

/**
 * 快速创建 body 校验中间件
 */
function validateBody(schema) {
  return validate(schema, 'body');
}

/**
 * 快速创建 query 校验中间件
 */
function validateQuery(schema) {
  return validate(schema, 'query');
}

/**
 * 快速创建 params 校验中间件
 */
function validateParams(schema) {
  return validate(schema, 'params');
}

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams
};
