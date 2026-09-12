/**
 * WebSocket 服务端 — 实时告警推送
 *
 * 职责：
 * - 挂载到 HTTP 服务器，路径 /ws
 * - Token 认证（URL query 参数 ?token=xxx）
 * - 心跳保活（协议级 ping/pong，30 秒间隔）
 * - 提供 broadcastAlert 方法，供其他模块推送实时告警
 * - 认证失败时提供清晰的错误信息
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

// JWT 密钥 — 必须通过环境变量配置
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] wsServer: JWT_SECRET 环境变量未设置');
  process.exit(1);
}

/** 已认证的客户端集合 */
const clients = new Map(); // ws -> { userId, username }

let wss = null;

/**
 * 初始化 WebSocket 服务器，挂载到已有 HTTP server
 * @param {import('http').Server} server
 */
function initWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientAddr = req.socket.remoteAddress;

    // 从 URL query 提取 token
    const parsedUrl = url.parse(req.url, true);
    const token = parsedUrl.query.token;

    if (!token) {
      console.warn('[WebSocket] 认证失败：未提供令牌', { address: clientAddr });
      ws.send(JSON.stringify({
        type: 'AUTH_FAIL',
        timestamp: Date.now(),
        payload: { message: '未提供认证令牌' },
      }));
      ws.close(4001, '未授权');
      return;
    }

    // 验证 JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.warn('[WebSocket] JWT 验证失败', {
        address: clientAddr,
        error: err.name,
      });
      ws.send(JSON.stringify({
        type: 'AUTH_FAIL',
        timestamp: Date.now(),
        payload: { message: '令牌无效或已过期', error: err.message },
      }));
      ws.close(4001, '认证失败');
      return;
    }

    // 检查 token 类型
    if (decoded.type !== 'access') {
      console.warn('[WebSocket] 认证失败：无效的令牌类型', {
        address: clientAddr,
        userId: decoded.id,
        tokenType: decoded.type,
      });
      ws.send(JSON.stringify({
        type: 'AUTH_FAIL',
        timestamp: Date.now(),
        payload: { message: '无效的令牌类型，需要 access token' },
      }));
      ws.close(4001, '无效令牌类型');
      return;
    }

    // 认证成功
    const clientInfo = {
      userId: decoded.id,
      username: decoded.username,
    };
    clients.set(ws, clientInfo);

    ws.send(JSON.stringify({
      type: 'AUTH_SUCCESS',
      timestamp: Date.now(),
      payload: { message: 'WebSocket 连接成功', user: clientInfo.username },
    }));

    console.info(`[WebSocket] 用户 ${clientInfo.username} 已连接，在线: ${clients.size}`);

    // 心跳处理
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // 消息处理
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({
            type: 'PONG',
            timestamp: Date.now(),
            payload: {},
          }));
        }
      } catch (e) {
        // 忽略非 JSON 消息
      }
    });

    // 断开连接
    ws.on('close', () => {
      clients.delete(ws);
      console.info(`[WebSocket] 用户 ${clientInfo.username} 已断开，在线: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.warn(`[WebSocket] 连接错误: ${err.message}`);
      clients.delete(ws);
    });
  });

  // 心跳检测：每 30 秒检查一次，清理无响应的连接
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        clients.delete(ws);
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  console.log('[WebSocket] 服务已启动，路径: /ws');
}

/**
 * 向所有已连接客户端广播新告警
 * @param {object} alert - 告警数据
 */
function broadcastAlert(alert) {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({
    type: 'NEW_ALERT',
    timestamp: Date.now(),
    payload: { alert },
  });

  clients.forEach((clientInfo, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

/**
 * 向所有客户端推送告警更新
 * @param {number|string} id - 告警 ID
 * @param {object} changes - 变更内容
 */
function broadcastAlertUpdate(id, changes) {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({
    type: 'UPDATE_ALERT',
    timestamp: Date.now(),
    payload: { id, changes },
  });

  clients.forEach((clientInfo, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

/**
 * 向所有客户端推送告警解决
 * @param {number|string} id - 告警 ID
 */
function broadcastAlertResolve(id) {
  if (!wss || clients.size === 0) return;

  const message = JSON.stringify({
    type: 'RESOLVE_ALERT',
    timestamp: Date.now(),
    payload: { id },
  });

  clients.forEach((clientInfo, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

/**
 * 获取当前在线客户端数量
 */
function getOnlineCount() {
  return clients.size;
}

function sendToUser(userId, message) {
  if (!wss) return;
  const payload = typeof message === 'string'
    ? { type: 'NOTIFICATION', timestamp: Date.now(), payload: { content: message } }
    : { type: 'NOTIFICATION', timestamp: Date.now(), payload: message };
  for (const [ws, info] of clients.entries()) {
    if (info.userId === userId && ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }
}

function broadcastNotification(notification) {
  if (!wss) return;
  const payload = { type: 'NOTIFICATION', timestamp: Date.now(), payload: notification };
  for (const [ws] of clients.entries()) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }
}

module.exports = {
  initWebSocketServer,
  broadcastAlert,
  broadcastAlertUpdate,
  broadcastAlertResolve,
  getOnlineCount,
  sendToUser,
  broadcastNotification,
};
