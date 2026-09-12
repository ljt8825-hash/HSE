/**
 * 用户可视化工作台布局 API
 * GET  /api/user/visual-layout     → 获取当前用户保存的布局配置
 * POST /api/user/visual-layout     → 保存用户自定义布局（JSON）
 *
 * 安全策略:
 * - 只能操作当前登录用户的数据
 * - 用户 ID 从 JWT token 中解析(req.user.id),不可由客户端指定
 * - 布局数据校验:验证 widgets 数组结构
 * - 防注入:使用参数化查询
 */
const express = require('express');
const router = express.Router();

const { success, error } = require('../middleware/response');
const { pool } = require('../config/db');

/**
 * 布局配置校验
 * @param {Object} config
 * @returns {string|null} 错误信息,null 表示校验通过
 */
function validateLayoutConfig(config) {
    if (!config || typeof config !== 'object') {
        return '配置必须为对象';
    }

    // columns 校验
    if (config.columns !== undefined) {
        const columns = Number(config.columns);
        if (!Number.isInteger(columns) || columns < 1 || columns > 48) {
            return 'columns 必须为 1-48 之间的整数';
        }
    }

    // cellHeight 校验
    if (config.cellHeight !== undefined) {
        const cellHeight = Number(config.cellHeight);
        if (
            !Number.isFinite(cellHeight) ||
            cellHeight < 20 ||
            cellHeight > 500
        ) {
            return 'cellHeight 必须为 20-500 之间的数值';
        }
    }

    // widgets 校验
    if (!Array.isArray(config.widgets)) {
        return 'widgets 必须为数组';
    }

    if (config.widgets.length > 200) {
        return 'widgets 数量不能超过 200 个';
    }

    const validTypes = new Set([
        'AlertStatsCard',
        'HazardTable',
        'ChartCard',
        'WorkflowTaskList',
        'FileUploadCard',
    ]);

    for (let i = 0; i < config.widgets.length; i++) {
        const w = config.widgets[i];
        if (!w || typeof w !== 'object') {
            return `widgets[${i}] 必须为对象`;
        }
        if (typeof w.id !== 'string' || w.id.length > 128) {
            return `widgets[${i}].id 必须为字符串且长度不超过 128`;
        }
        if (typeof w.type !== 'string') {
            return `widgets[${i}].type 必须为字符串`;
        }
        // type 不在预置列表中时仅警告,不阻止保存(支持扩展)
        if (!validTypes.has(w.type)) {
            console.warn(
                `[visual-layout] 未知的组件类型: ${w.type},userId=${w.userId}`,
            );
        }
        if (
            !Number.isInteger(w.x) ||
            !Number.isInteger(w.y) ||
            !Number.isInteger(w.w) ||
            !Number.isInteger(w.h)
        ) {
            return `widgets[${i}] 的 x/y/w/h 必须为整数`;
        }
        if (w.w < 1 || w.w > 48 || w.h < 1 || w.h > 48) {
            return `widgets[${i}] 的 w/h 必须在 1-48 之间`;
        }
        if (w.title !== undefined && typeof w.title !== 'string') {
            return `widgets[${i}].title 必须为字符串`;
        }
        if (
            w.props !== undefined &&
            w.props !== null &&
            typeof w.props !== 'object'
        ) {
            return `widgets[${i}].props 必须为对象或 null`;
        }
    }

    return null;
}

/**
 * GET /api/user/visual-layout
 * 获取当前用户保存的布局配置
 */
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return error(res, '未识别用户身份', 401);
        }

        const result = await pool.query(
            'SELECT visual_layout FROM users WHERE id = $1',
            [userId],
        );

        if (result.rows.length === 0) {
            return error(res, '用户不存在', 404);
        }

        const layout = result.rows[0].visual_layout;

        // 未设置过布局时返回默认空结构
        if (!layout) {
            return success(
                res,
                {
                    columns: 12,
                    cellHeight: 80,
                    widgets: [],
                },
                '使用默认布局',
            );
        }

        return success(res, layout, '获取成功');
    } catch (e) {
        console.error('[visual-layout] GET 失败:', e);
        return next(e);
    }
});

/**
 * POST /api/user/visual-layout
 * 保存用户自定义布局
 * body: { columns?: number, cellHeight?: number | string, widgets: [...] }
 */
router.post('/', async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return error(res, '未识别用户身份', 401);
        }

        const config = req.body;

        // 校验
        const validationError = validateLayoutConfig(config);
        if (validationError) {
            return error(res, validationError, 400);
        }

        // 写入数据库(参数化查询防注入)
        const result = await pool.query(
            'UPDATE users SET visual_layout = $1::jsonb WHERE id = $2 RETURNING id',
            [JSON.stringify(config), userId],
        );

        if (result.rowCount === 0) {
            return error(res, '用户不存在或更新失败', 404);
        }

        return success(res, { success: true }, '布局已保存');
    } catch (e) {
        console.error('[visual-layout] POST 失败:', e);
        return next(e);
    }
});

/**
 * DELETE /api/user/visual-layout
 * 删除用户自定义布局(恢复默认)
 */
router.delete('/', async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return error(res, '未识别用户身份', 401);
        }

        await pool.query(
            'UPDATE users SET visual_layout = NULL WHERE id = $1',
            [userId],
        );

        return success(res, { success: true }, '布局已重置');
    } catch (e) {
        console.error('[visual-layout] DELETE 失败:', e);
        return next(e);
    }
});

module.exports = router;
