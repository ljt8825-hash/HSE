/**
 * 系统管理校验 Schema — 角色、菜单
 */
const { z } = require('zod');
const { paginationSchema } = require('./common');

const roleQuerySchema = paginationSchema.extend({
  keyword: z.string().max(200).optional().or(z.literal('')),
  code: z.string().max(50).optional().or(z.literal('')),
  isActive: z.enum(['true', 'false']).optional(),
});

const roleCreateSchema = z.object({
  code: z.string().min(2, '角色编码至少2位').max(50, '角色编码最多50位'),
  name: z.string().min(1, '角色名称不能为空').max(100, '角色名称最多100位'),
  description: z.string().max(500).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  menuIds: z.array(z.number().int().min(1)).optional().default([]),
});

const roleUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

const rolePermissionSchema = z.object({
  menuIds: z.array(z.number().int().min(1)).min(0, '菜单ID列表不能为空'),
});

const menuCreateSchema = z.object({
  parentId: z.number().int().min(0).default(0),
  name: z.string().min(1, '菜单名称不能为空').max(100, '菜单名称最多100位'),
  path: z.string().max(200).optional().or(z.literal('')),
  component: z.string().max(200).optional().or(z.literal('')),
  icon: z.string().max(50).optional().or(z.literal('')),
  permission: z.string().max(100).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  isHidden: z.boolean().default(false),
});

const menuUpdateSchema = z.object({
  parentId: z.number().int().min(0).optional(),
  name: z.string().min(1).max(100).optional(),
  path: z.string().max(200).optional().or(z.literal('')),
  component: z.string().max(200).optional().or(z.literal('')),
  icon: z.string().max(50).optional().or(z.literal('')),
  permission: z.string().max(100).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});

module.exports = {
  roleQuerySchema,
  roleCreateSchema,
  roleUpdateSchema,
  rolePermissionSchema,
  menuCreateSchema,
  menuUpdateSchema,
};
