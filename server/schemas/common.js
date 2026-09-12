/**
 * 通用校验 Schema — 分页、ID、搜索等基础校验
 */
const { z } = require('zod');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().min(1),
});

const keywordSchema = z.object({
  keyword: z.string().max(200).optional().or(z.literal('')),
});

const statusQuerySchema = z.object({
  status: z.string().max(50).optional().or(z.literal('')),
});

module.exports = {
  paginationSchema,
  idParamSchema,
  keywordSchema,
  statusQuerySchema,
};
