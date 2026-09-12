/**
 * Zod Schema 汇总导出
 * 按模块组织请求参数校验规则
 */

const auth = require('./auth');
const accidents = require('./accidents');
const insurance = require('./insurance');

module.exports = {
  auth,
  accidents,
  insurance
};
