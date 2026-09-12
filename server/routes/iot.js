/**
 * IoT 设备路由
 * 提供物联网设备管理、实时数据、历史数据、告警等接口
 * 支持 WebSocket 实时数据推送（/ws/iot）
 *
 * 路由前缀: /api/hse/iot
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { cacheMiddleware } = require('../middleware/cache');
const { validateBody } = require('../middleware/validate');
const { z } = require('zod');

// ============================================================
// Zod 校验 Schema
// ============================================================

/** 注册设备请求参数 */
const createDeviceSchema = z.object({
  /** 设备名称 */
  name: z.string().min(1).max(100),
  /** 设备类型（如：气体检测、GPS追踪、视频监控、温湿度传感器等） */
  type: z.string().min(1).max(50),
  /** 设备唯一标识（MAC 地址或序列号） */
  deviceId: z.string().min(1).max(100),
  /** 安装位置/区域 */
  location: z.string().optional(),
  /** 设备描述 */
  description: z.string().optional().default('')
});

/** 更新设备请求参数 */
const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.string().min(1).max(50).optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['在线', '离线', '维护中']).optional()
});

// ============================================================
// 路由定义
// ============================================================

/**
 * GET /iot/devices - 设备列表
 * 查询参数:
 *   - type: 设备类型筛选
 *   - status: 状态筛选（在线, 离线, 维护中）
 *   - area: 区域筛选
 *   - page: 页码
 *   - pageSize: 每页条数
 */
router.get('/devices', cacheMiddleware(15000), async (req, res) => {
  try {
    const { type, status, area, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    // 构建查询条件
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(type);
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (area) {
      conditions.push(`location LIKE $${paramIndex++}`);
      params.push(`%${area}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM iot_devices ${whereClause}`,
      params
    );

    // 查询列表
    const limit = Math.min(parseInt(pageSize) || 20, 100);
    params.push(limit, offset);

    const listResult = await pool.query(
      `SELECT * FROM iot_devices ${whereClause}
       ORDER BY last_heartbeat DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    res.json(success({
      list: listResult.rows,
      pagination: {
        page: parseInt(page),
        pageSize: limit,
        total: parseInt(countResult.rows[0]?.total) || 0
      }
    }, '获取设备列表成功'));
  } catch (err) {
    console.error('[IoT] 获取设备列表失败:', err.message);
    res.json(error(-1, '获取设备列表失败', { detail: err.message }));
  }
});

/**
 * GET /iot/devices/:id/realtime - 设备实时数据
 * 返回指定设备的最新实时数据
 */
router.get('/devices/:id/realtime', cacheMiddleware(5000), async (req, res) => {
  try {
    const { id } = req.params;

    // 查询设备信息
    const deviceResult = await pool.query(
      'SELECT * FROM iot_devices WHERE id = $1',
      [id]
    );

    if (deviceResult.rows.length === 0) {
      return res.json(error(-1, '设备不存在'));
    }

    // 查询最新一条实时数据
    const dataResult = await pool.query(
      `SELECT * FROM iot_device_data
       WHERE device_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [id]
    );

    const realtime = {
      device: deviceResult.rows[0],
      data: dataResult.rows[0] || null,
      timestamp: new Date().toISOString()
    };

    res.json(success(realtime, '获取设备实时数据成功'));
  } catch (err) {
    console.error('[IoT] 获取设备实时数据失败:', err.message);
    res.json(error(-1, '获取设备实时数据失败', { detail: err.message }));
  }
});

/**
 * GET /iot/devices/:id/history - 设备历史数据
 * 查询参数:
 *   - startDate: 开始时间
 *   - endDate: 结束时间
 *   - interval: 聚合间隔（raw, 1m, 5m, 1h, 1d）
 */
router.get('/devices/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      startDate,
      endDate = new Date().toISOString(),
      interval = '1h',
      page = 1,
      pageSize = 100
    } = req.query;

    const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    // 查询设备是否存在
    const deviceCheck = await pool.query(
      'SELECT id FROM iot_devices WHERE id = $1',
      [id]
    );

    if (deviceCheck.rows.length === 0) {
      return res.json(error(-1, '设备不存在'));
    }

    // 查询历史数据
    const limit = Math.min(parseInt(pageSize) || 100, 1000);
    const dataResult = await pool.query(
      `SELECT * FROM iot_device_data
       WHERE device_id = $1
         AND recorded_at >= $2
         AND recorded_at <= $3
       ORDER BY recorded_at DESC
       LIMIT $4 OFFSET $5`,
      [id, start, endDate, limit, offset]
    );

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM iot_device_data
       WHERE device_id = $1 AND recorded_at >= $2 AND recorded_at <= $3`,
      [id, start, endDate]
    );

    res.json(success({
      deviceId: id,
      interval,
      startDate: start,
      endDate,
      list: dataResult.rows,
      pagination: {
        page: parseInt(page),
        pageSize: limit,
        total: parseInt(countResult.rows[0]?.total) || 0
      }
    }, '获取设备历史数据成功'));
  } catch (err) {
    console.error('[IoT] 获取设备历史数据失败:', err.message);
    res.json(error(-1, '获取设备历史数据失败', { detail: err.message }));
  }
});

/**
 * POST /iot/devices - 注册设备
 */
router.post('/devices', validateBody(createDeviceSchema), async (req, res) => {
  try {
    const { name, type, deviceId, location, description } = req.body;

    const result = await pool.query(
      `INSERT INTO iot_devices (name, type, device_id, location, description, status, created_at, last_heartbeat)
       VALUES ($1, $2, $3, $4, $5, '离线', NOW(), NULL)
       RETURNING *`,
      [name, type, deviceId, location, description]
    );

    res.json(success(result.rows[0], '设备注册成功'));
  } catch (err) {
    console.error('[IoT] 设备注册失败:', err.message);
    res.json(error(-1, '设备注册失败', { detail: err.message }));
  }
});

/**
 * PUT /iot/devices/:id - 更新设备
 */
router.put('/devices/:id', validateBody(updateDeviceSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 构建动态 SET 子句
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (setClauses.length === 0) {
      return res.json(error(-1, '未提供任何更新字段'));
    }

    params.push(id);

    const result = await pool.query(
      `UPDATE iot_devices SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.json(error(-1, '设备不存在'));
    }

    res.json(success(result.rows[0], '设备更新成功'));
  } catch (err) {
    console.error('[IoT] 设备更新失败:', err.message);
    res.json(error(-1, '设备更新失败', { detail: err.message }));
  }
});

/**
 * GET /iot/alerts - 设备告警列表
 * 查询参数:
 *   - deviceId: 设备ID筛选
 *   - level: 告警级别（info, warning, critical）
 *   - status: 告警状态（未处理, 已处理, 已忽略）
 *   - page: 页码
 *   - pageSize: 每页条数
 */
router.get('/alerts', cacheMiddleware(10000), async (req, res) => {
  try {
    const { deviceId, level, status, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    // 构建查询条件
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (deviceId) {
      conditions.push(`device_id = $${paramIndex++}`);
      params.push(deviceId);
    }
    if (level) {
      conditions.push(`level = $${paramIndex++}`);
      params.push(level);
    }
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM iot_device_alerts ${whereClause}`,
      params
    );

    // 查询告警列表
    const limit = Math.min(parseInt(pageSize) || 20, 100);
    params.push(limit, offset);

    const listResult = await pool.query(
      `SELECT a.*, d.name AS device_name, d.type AS device_type
       FROM iot_device_alerts a
       LEFT JOIN iot_devices d ON a.device_id = d.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    res.json(success({
      list: listResult.rows,
      pagination: {
        page: parseInt(page),
        pageSize: limit,
        total: parseInt(countResult.rows[0]?.total) || 0
      }
    }, '获取设备告警列表成功'));
  } catch (err) {
    console.error('[IoT] 获取设备告警失败:', err.message);
    res.json(error(-1, '获取设备告警失败', { detail: err.message }));
  }
});

/**
 * WebSocket /ws/iot - 设备实时数据推送
 * 此路由在 wsServer.js 中统一处理，此处仅作为文档说明
 *
 * 连接方式: ws://host:port/ws/iot
 * 消息格式:
 *   订阅: { action: 'subscribe', deviceIds: ['id1', 'id2'] }
 *   取消订阅: { action: 'unsubscribe', deviceIds: ['id1'] }
 *   接收数据: { type: 'device_data', deviceId: 'id1', data: {...}, timestamp: '...' }
 *   接收告警: { type: 'device_alert', deviceId: 'id1', alert: {...}, timestamp: '...' }
 */
router.get('/ws-info', (req, res) => {
  res.json(success({
    endpoint: '/ws/iot',
    protocol: 'WebSocket',
    subscribe: { action: 'subscribe', deviceIds: ['string'] },
    unsubscribe: { action: 'unsubscribe', deviceIds: ['string'] },
    dataMessage: { type: 'device_data', deviceId: 'string', data: {}, timestamp: 'ISO' },
    alertMessage: { type: 'device_alert', deviceId: 'string', alert: {}, timestamp: 'ISO' }
  }, 'WebSocket 设备实时推送接口说明'));
});

module.exports = router;
