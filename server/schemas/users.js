/**
 * 用户管理校验 Schema
 */
const { z } = require('zod');
const { paginationSchema } = require('./common');

const userQuerySchema = paginationSchema.extend({
  keyword: z.string().max(200).optional().or(z.literal('')),
  role: z.string().max(50).optional().or(z.literal('')),
  department: z.string().max(100).optional().or(z.literal('')),
  isActive: z.enum(['true', 'false']).optional(),
});

const userCreateSchema = z.object({
  username: z.string().min(2, '用户名至少2位').max(32, '用户名最多32位'),
  realName: z.string().min(1, '真实姓名不能为空').max(50, '姓名最多50位'),
  password: z.string().min(8, '密码至少8位').max(128),
  role: z.enum(['admin', 'manager', 'viewer']).default('viewer'),
  department: z.string().max(100).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email().max(100).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

const userUpdateSchema = z.object({
  realName: z.string().min(1).max(50).optional(),
  role: z.enum(['admin', 'manager', 'viewer']).optional(),
  department: z.string().max(100).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email().max(100).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

const passwordResetSchema = z.object({
  password: z.string().min(8, '密码至少8位').max(128)
    .regex(/[a-z]/, '必须包含小写字母')
    .regex(/[A-Z]/, '必须包含大写字母')
    .regex(/[0-9]/, '必须包含数字'),
});

const batchDeleteSchema = z.object({
  ids: z.array(z.number().int().min(1)).min(1, '至少选择一条记录').max(200, '单次最多删除200条'),
});

module.exports = {
  userQuerySchema,
  userCreateSchema,
  userUpdateSchema,
  passwordResetSchema,
  batchDeleteSchema,
};
