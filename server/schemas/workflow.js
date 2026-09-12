/**
 * 工作流校验 Schema
 */
const { z } = require('zod');
const { paginationSchema } = require('./common');

const workflowDefQuerySchema = paginationSchema.extend({
  keyword: z.string().max(200).optional().or(z.literal('')),
});

const workflowDefCreateSchema = z.object({
  code: z.string().min(2, '流程编码至少2位').max(50, '流程编码最多50位'),
  name: z.string().min(1, '流程名称不能为空').max(100, '流程名称最多100位'),
  description: z.string().max(500).optional().or(z.literal('')),
  definition: z.any().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

const workflowDefUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().or(z.literal('')),
  definition: z.any().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

const workflowInstanceQuerySchema = paginationSchema.extend({
  status: z.string().max(20).optional().or(z.literal('')),
  workflowCode: z.string().max(50).optional().or(z.literal('')),
  keyword: z.string().max(200).optional().or(z.literal('')),
});

const workflowInstanceCreateSchema = z.object({
  workflowId: z.number().int().min(1, '流程定义ID不能为空'),
  workflowCode: z.string().min(2).max(50),
  businessKey: z.string().max(100).optional().or(z.literal('')),
  formData: z.any().optional(),
});

const workflowTaskActionSchema = z.object({
  action: z.enum(['approve', 'reject'], { message: '操作类型必须是 approve 或 reject' }),
  comment: z.string().max(1000).optional().or(z.literal('')),
});

const workflowTaskQuerySchema = paginationSchema.extend({
  status: z.string().max(20).optional().or(z.literal('')),
  assigneeId: z.coerce.number().int().min(1).optional(),
});

module.exports = {
  workflowDefQuerySchema,
  workflowDefCreateSchema,
  workflowDefUpdateSchema,
  workflowInstanceQuerySchema,
  workflowInstanceCreateSchema,
  workflowTaskActionSchema,
  workflowTaskQuerySchema,
};
