const { z } = require('zod');

// 登录请求校验
const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(50, '用户名不能超过50字符'),
  password: z.string().min(1, '密码不能为空').max(128, '密码不能超过128字符')
});

// 修改密码校验
const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '旧密码不能为空').max(128),
  newPassword: z.string()
    .min(8, '新密码长度不能少于8位')
    .max(128, '密码不能超过128字符')
    .regex(/[a-z]/, '必须包含小写字母')
    .regex(/[A-Z]/, '必须包含大写字母')
    .regex(/[0-9]/, '必须包含数字')
});

// 更新个人信息校验
const profileSchema = z.object({
  realName: z.string().max(50, '姓名不能超过50字符').optional(),
  department: z.string().max(100, '部门不能超过100字符').optional(),
  phone: z.string().max(20, '电话不能超过20字符').optional(),
  email: z.string().email('邮箱格式不正确').max(100).optional().or(z.literal('')),
  avatar: z.string().max(500, '头像URL不能超过500字符').optional().or(z.literal(''))
}).refine(data => Object.keys(data).length > 0, {
  message: '没有要更新的字段'
});

// 注册请求校验
const registerSchema = z.object({
  username: z.string().min(2, '用户名长度至少2位').max(32, '用户名不能超过32字符'),
  password: z.string()
    .min(8, '密码长度不能少于8位')
    .max(128, '密码不能超过128字符')
    .regex(/[a-z]/, '必须包含小写字母')
    .regex(/[A-Z]/, '必须包含大写字母')
    .regex(/[0-9]/, '必须包含数字'),
  realName: z.string().min(1, '真实姓名不能为空').max(50, '姓名不能超过50字符'),
  email: z.string().email('邮箱格式不正确').max(100).optional().or(z.literal('')),
  phone: z.string().max(20, '电话不能超过20字符').optional().or(z.literal('')),
  department: z.string().max(100, '部门不能超过100字符').optional().or(z.literal(''))
});

module.exports = {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  profileSchema
};
