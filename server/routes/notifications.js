const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { authMiddleware: verifyToken } = require('../middleware/auth');
const { paginateMemory, camelKeys } = require('../utils/commonResponse');

// ========== 模块/类型定义 ==========
const NOTIFICATION_MODULES = [
  'regulations',
  'emergency',
  'training',
  'hazards',
  'insurance',
  'inspection',
  'accidents',
  'system',
  'workflow',
];

const PRIORITY_MAP = {
  normal: 'normal',
  warning: 'warning',
  urgent: 'urgent',
};

// ========== 内存降级存储 ==========
let memoryNotifications = [];
let memoryIdCounter = 1;
let memoryInitialized = false;

function initMemoryData() {
  if (memoryInitialized) return;
  memoryInitialized = true;
  memoryNotifications = [];
  memoryIdCounter = 1;

  const now = new Date();
  const sampleData = [
    {
      id: memoryIdCounter++,
      user_id: 1,
      title: '规章制度临期提醒',
      content: '《安全生产管理制度》将于 7 天后到期，请及时组织修订。',
      type: 'alert',
      biz_type: 'regulations',
      biz_id: 1,
      priority: 'warning',
      is_read: false,
      read_at: null,
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: memoryIdCounter++,
      user_id: 1,
      title: '隐患整改过期警告',
      content: '隐患 #H003 已超过整改期限 2 天，请立即处理。',
      type: 'alert',
      biz_type: 'hazards',
      biz_id: 3,
      priority: 'urgent',
      is_read: false,
      read_at: null,
      created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: memoryIdCounter++,
      user_id: 1,
      title: '培训证书即将到期',
      content: '张三的特种作业操作证将于 15 天后到期。',
      type: 'alert',
      biz_type: 'training',
      biz_id: 5,
      priority: 'warning',
      is_read: true,
      read_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: memoryIdCounter++,
      user_id: 1,
      title: '应急预案修订完成',
      content: '《火灾事故应急预案》已完成 v2.0 修订，请知悉。',
      type: 'system',
      biz_type: 'emergency',
      biz_id: 2,
      priority: 'normal',
      is_read: true,
      read_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: memoryIdCounter++,
      user_id: 1,
      title: '新的待办审批',
      content: '您有一条新的隐患整改审批待办任务。',
      type: 'workflow',
      biz_type: 'workflow',
      biz_id: 10,
      priority: 'normal',
      is_read: false,
      read_at: null,
      created_at: new Date(now - 30 * 60 * 1000).toISOString(),
    },
  ];
  memoryNotifications = sampleData;
}

// ========== 辅助函数 ==========
function formatNotification(row) {
  return camelKeys(row);
}

function getPriorityFromTypeAndBiz(type, bizType) {
  if (type === 'alert') {
    if (bizType === 'hazards') return 'urgent';
    return 'warning';
  }
  return 'normal';
}

// ========== GET / — 列表（支持模块、状态、优先级、时间筛选） ==========
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, isRead, type, module: bizType, priority, keyword } = req.query;
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryNotifications.filter((n) => n.user_id === userId);
      if (isRead !== undefined && isRead !== '') {
        const readVal = isRead === 'true' || isRead === true;
        data = data.filter((n) => n.is_read === readVal);
      }
      if (type) data = data.filter((n) => n.type === type);
      if (bizType) data = data.filter((n) => n.biz_type === bizType);
      if (priority) data = data.filter((n) => n.priority === priority);
      if (keyword) {
        const kw = String(keyword).toLowerCase();
        data = data.filter(
          (n) =>
            n.title.toLowerCase().includes(kw) ||
            n.content.toLowerCase().includes(kw),
        );
      }
      data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const unreadCount = data.filter((n) => !n.is_read).length;
      const { list, total } = paginateMemory(data, page, pageSize);
      return res.json(
        success(
          {
            list: list.map(formatNotification),
            total,
            unreadCount,
          },
          '查询成功(内存模式)',
        ),
      );
    }

    const conditions = ['user_id = $1'];
    const params = [userId];
    let paramIdx = 2;

    if (isRead !== undefined && isRead !== '') {
      conditions.push(`is_read = $${paramIdx++}`);
      params.push(isRead === 'true' || isRead === true);
    }
    if (type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(type);
    }
    if (bizType) {
      conditions.push(`biz_type = $${paramIdx++}`);
      params.push(bizType);
    }
    if (priority) {
      conditions.push(`priority = $${paramIdx++}`);
      params.push(priority);
    }
    if (keyword) {
      conditions.push(`(title ILIKE $${paramIdx} OR content ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [countResult, dataResult, unreadResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM notifications ${whereClause}`, params),
      pool.query(
        `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize)],
      ),
      pool.query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
        [userId],
      ),
    ]);

    res.json(
      success({
        list: dataResult.rows.map(formatNotification),
        total: countResult.rows[0]?.total || 0,
        unreadCount: unreadResult.rows[0]?.count || 0,
      }, '查询成功'),
    );
  } catch (err) {
    console.error('[Notifications] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========== GET /unread-count — 未读数量 ==========
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      initMemoryData();
      const count = memoryNotifications.filter((n) => n.user_id === userId && !n.is_read).length;
      return res.json(success({ count }, '查询成功(内存模式)'));
    }

    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId],
    );

    res.json(success({ count: result.rows[0]?.count || 0 }, '查询成功'));
  } catch (err) {
    console.error('[Notifications/unread] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========== GET /stats — 通知统计（按模块/优先级） ==========
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      initMemoryData();
      const userNotes = memoryNotifications.filter((n) => n.user_id === userId);
      const byModule = {};
      const byPriority = { normal: 0, warning: 0, urgent: 0 };
      userNotes.forEach((n) => {
        const mod = n.biz_type || 'system';
        byModule[mod] = (byModule[mod] || 0) + 1;
        if (n.priority && byPriority[n.priority] !== undefined) {
          byPriority[n.priority]++;
        }
      });
      return res.json(
        success(
          {
            total: userNotes.length,
            unread: userNotes.filter((n) => !n.is_read).length,
            byModule,
            byPriority,
          },
          '统计成功(内存模式)',
        ),
      );
    }

    const [totalR, byModR, byPriR] = await Promise.all([
      pool.query(
        'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_read = false)::int AS unread FROM notifications WHERE user_id = $1',
        [userId],
      ),
      pool.query(
        'SELECT biz_type, COUNT(*)::int AS count FROM notifications WHERE user_id = $1 GROUP BY biz_type',
        [userId],
      ),
      pool.query(
        "SELECT COALESCE(priority, 'normal') AS priority, COUNT(*)::int AS count FROM notifications WHERE user_id = $1 GROUP BY priority",
        [userId],
      ),
    ]);

    const byModule = {};
    byModR.rows.forEach((r) => {
      if (r.biz_type) byModule[r.biz_type] = parseInt(r.count);
    });

    const byPriority = { normal: 0, warning: 0, urgent: 0 };
    byPriR.rows.forEach((r) => {
      if (byPriority[r.priority] !== undefined) byPriority[r.priority] = parseInt(r.count);
    });

    res.json(
      success({
        total: totalR.rows[0]?.total || 0,
        unread: totalR.rows[0]?.unread || 0,
        byModule,
        byPriority,
      }, '统计成功'),
    );
  } catch (err) {
    console.error('[Notifications/stats] 失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========== GET /export — 导出通知记录（CSV，在 /:id 之前） ==========
router.get('/export', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.id || 1;
    const { isRead, type, module: bizType } = req.query;

    let data = [];

    if (!isConnected()) {
      initMemoryData();
      data = memoryNotifications.filter((n) => n.user_id === userId);
      if (isRead !== undefined && isRead !== '') {
        const readVal = isRead === 'true' || isRead === true;
        data = data.filter((n) => n.is_read === readVal);
      }
      if (type) data = data.filter((n) => n.type === type);
      if (bizType) data = data.filter((n) => n.biz_type === bizType);
      data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      const conditions = ['user_id = $1'];
      const params = [userId];
      let paramIdx = 2;

      if (isRead !== undefined && isRead !== '') {
        conditions.push(`is_read = $${paramIdx++}`);
        params.push(isRead === 'true' || isRead === true);
      }
      if (type) {
        conditions.push(`type = $${paramIdx++}`);
        params.push(type);
      }
      if (bizType) {
        conditions.push(`biz_type = $${paramIdx++}`);
        params.push(bizType);
      }

      const result = await pool.query(
        `SELECT * FROM notifications WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
        params,
      );
      data = result.rows;
    }

    const headers = ['ID', '标题', '内容', '类型', '模块', '优先级', '状态', '创建时间', '阅读时间'];
    const typeMap = { system: '系统通知', alert: '告警通知', workflow: '工作流', task: '任务通知' };
    const moduleMap = {
      regulations: '规章制度',
      emergency: '应急预案',
      training: '培训管理',
      hazards: '隐患排查',
      insurance: '保险管理',
      inspection: '巡检管理',
      accidents: '事故管理',
      system: '系统通知',
      workflow: '工作流',
    };
    const priorityMap = { normal: '普通', warning: '临期', urgent: '紧急' };

    const rows = data.map((r) => [
      r.id || '',
      (r.title || '').replace(/"/g, '""'),
      (r.content || '').replace(/"/g, '""'),
      typeMap[r.type] || r.type || '',
      moduleMap[r.biz_type] || r.biz_type || '',
      priorityMap[r.priority] || r.priority || '普通',
      r.is_read ? '已读' : '未读',
      r.created_at ? new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ') : '',
      r.read_at ? new Date(r.read_at).toISOString().slice(0, 19).replace('T', ' ') : '',
    ].map((v) => `"${v}"`).join(','));

    const csv = '\uFEFF' + headers.map((h) => `"${h}"`).join(',') + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="notifications_${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ========== GET /:id — 单条详情（在 /export 之后） ==========
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      initMemoryData();
      const item = memoryNotifications.find((n) => n.id === id && n.user_id === userId);
      if (!item) return res.status(404).json(error(404, '通知不存在'));
      return res.json(success(formatNotification(item), '查询成功(内存模式)'));
    }

    const result = await pool.query(
      'SELECT * FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '通知不存在'));
    }

    res.json(success(formatNotification(result.rows[0]), '查询成功'));
  } catch (err) {
    console.error('[Notifications/detail] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========== PUT /:id/read — 标记已读 ==========
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      initMemoryData();
      const item = memoryNotifications.find((n) => n.id === id && n.user_id === userId);
      if (!item) return res.status(404).json(error(404, '通知不存在'));
      item.is_read = true;
      item.read_at = new Date().toISOString();
      return res.json(success(formatNotification(item), '标记已读成功(内存模式)'));
    }

    const result = await pool.query(
      'UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '通知不存在'));
    }

    res.json(success(formatNotification(result.rows[0]), '标记已读成功'));
  } catch (err) {
    console.error('[Notifications/read] 操作失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========== PUT /read-all — 全部已读 ==========
router.put('/read-all', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      initMemoryData();
      let count = 0;
      memoryNotifications.forEach((n) => {
        if (n.user_id === userId && !n.is_read) {
          n.is_read = true;
          n.read_at = new Date().toISOString();
          count++;
        }
      });
      return res.json(success({ count }, '全部已读成功(内存模式)'));
    }

    const result = await pool.query(
      'UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND is_read = false',
      [userId],
    );

    res.json(success({ count: result.rowCount || 0 }, '全部已读成功'));
  } catch (err) {
    console.error('[Notifications/readAll] 操作失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========== DELETE /:id — 删除单条 ==========
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      initMemoryData();
      const idx = memoryNotifications.findIndex((n) => n.id === id && n.user_id === userId);
      if (idx === -1) return res.status(404).json(error(404, '通知不存在'));
      memoryNotifications.splice(idx, 1);
      return res.json(success({ id }, '删除成功(内存模式)'));
    }

    await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json(success({ id }, '删除成功'));
  } catch (err) {
    console.error('[Notifications/delete] 操作失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

// ========== DELETE /clear — 清空所有 ==========
router.delete('/clear', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      initMemoryData();
      memoryNotifications = memoryNotifications.filter((n) => n.user_id !== userId);
      return res.json(success(null, '清空成功(内存模式)'));
    }

    await pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    res.json(success(null, '清空成功'));
  } catch (err) {
    console.error('[Notifications/clear] 操作失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

module.exports = router;
