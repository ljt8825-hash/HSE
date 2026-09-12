/**
 * ============================================================
 * 10-websocket-load.js — WebSocket 并发压测 (P1)
 * ============================================================
 *
 * 测试目标：
 *   - 10 / 50 / 100 WebSocket 并发连接 (ws://localhost:3000/ws?token=xxx)
 *   - 心跳保活（30s 间隔）
 *   - 消息接收延迟测试
 *   - 断线重连验证
 *
 * 关键指标：
 *   100 并发连接稳定，消息延迟 < 500ms，心跳无丢失
 *
 * 技术说明：
 *   k6 从 v0.45+ 开始原生支持 WebSocket（通过 k6/experimental/websockets）
 *   如果使用较低版本，需要安装 xk6-websocket 扩展：
 *     - 参考: https://github.com/grafana/xk6-websocket
 *     - 构建: xk6 build --with github.com/grafana/xk6-websocket@latest
 *
 *   本脚本使用 k6 原生 WebSocket API (k6/ws)，
 *   如果运行时报错找不到 'k6/ws'，请：
 *   1. 升级 k6 到 v0.45+，或
 *   2. 使用 xk6 构建：xk6 build --with github.com/grafana/xk6-websocket
 *      然后将 import 路径改为 'github.com/grafana/xk6-websocket'
 *
 *   注意：WebSocket 请求不支持 tags，部分指标通过代码手动计算
 *
 * 用法：
 *   k6 run --env env=local tests/10-websocket-load.js
 *   k6 run --env env=local --env ws_url=ws://localhost:3000/ws tests/10-websocket-load.js
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { thresholds } from '../config/thresholds.js';
import { getToken } from '../helpers/auth.js';

// ============================================================
// 自定义指标
// ============================================================

// 连接指标
const wsConnectDuration = new Trend('ws_connect_duration', true);
const wsConnectionsActive = new Gauge('ws_connections_active');
const wsConnectionSuccessRate = new Rate('ws_connection_success_rate');
const wsConnectionFailCount = new Counter('ws_connection_fail_count');

// 消息指标
const wsMessageLatency = new Trend('ws_message_latency', true);
const wsMessageSentCount = new Counter('ws_message_sent_count');
const wsMessageReceivedCount = new Counter('ws_message_received_count');

// 心跳指标
const wsHeartbeatSuccessRate = new Rate('ws_heartbeat_success_rate');
const wsHeartbeatLostCount = new Counter('ws_heartbeat_lost_count');
const wsHeartbeatSentCount = new Counter('ws_heartbeat_sent_count');
const wsHeartbeatRTT = new Trend('ws_heartbeat_rtt', true);

// 断线重连指标
const wsReconnectCount = new Counter('ws_reconnect_count');
const wsReconnectSuccessRate = new Rate('ws_reconnect_success_rate');

// 会话指标
const wsSessionDuration = new Trend('ws_session_duration', true);
const wsErrorRate = new Rate('ws_error_rate');

// ============================================================
// 测试配置
// ============================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || BASE_URL.replace('http', 'ws') + '/ws';
const HEARTBEAT_INTERVAL = 30;   // 心跳间隔（秒）
const MAX_RECONNECT = 3;         // 最大重连次数
const SESSION_DURATION = 60;     // 单次 WebSocket 会话持续时间（秒）

export const options = {
    scenarios: {
        // 场景1：阶梯并发连接测试
        ws_ramp: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '15s', target: 10 },   // 10 并发
                { duration: '1m',  target: 10 },   // 保持
                { duration: '15s', target: 50 },   // 50 并发
                { duration: '1m',  target: 50 },   // 保持
                { duration: '15s', target: 100 },  // 100 并发
                { duration: '2m',  target: 100 },  // 持续高压
                { duration: '15s', target: 0 },     // 断开
            ],
            exec: 'wsSession',
            tags: { scenario: 'ws_ramp' },
        },
        // 场景2：稳态长连接测试
        ws_steady: {
            executor: 'constant-vus',
            vus: 50,
            duration: '3m',
            startTime: '5m',  // 在主场景后执行
            exec: 'wsSession',
            tags: { scenario: 'ws_steady' },
        },
        // 场景3：断线重连测试
        ws_reconnect_test: {
            executor: 'constant-vus',
            vus: 20,
            duration: '2m',
            exec: 'reconnectTest',
            tags: { scenario: 'ws_reconnect_test' },
        },
    },
    thresholds: {
        // 使用 standard 阈值
        ...thresholds.standard,
        // WebSocket 连接性能
        'ws_connect_duration':         ['p(95)<2000', 'p(99)<5000'],
        'ws_connection_success_rate':   ['rate>0.99'],
        // 消息延迟
        'ws_message_latency':           ['p(95)<500', 'p(99)<1000'],
        // 心跳成功率
        'ws_heartbeat_success_rate':    ['rate>0.99'],
        // 断线重连成功率
        'ws_reconnect_success_rate':    ['rate>0.95'],
        // 错误率
        'ws_error_rate':                ['rate<0.02'],
    },
};

// ============================================================
// Setup — 获取 token
// ============================================================
export function setup() {
    const token = getToken(BASE_URL);

    if (!token) {
        throw new Error('无法获取认证 token');
    }

    console.log(`--- WebSocket 压测启动 ---`);
    console.log(`  WS URL: ${WS_URL}`);

    return { wsUrl: WS_URL, token };
}

// ============================================================
// 场景1 & 2：WebSocket 会话
// ============================================================
export function wsSession(data) {
    const vuId = __VU;
    const iterId = __ITER;
    const sessionStart = Date.now();
    let heartbeatCount = 0;
    let heartbeatLost = 0;
    let heartbeatTotalRTT = 0;
    let messageReceivedCount = 0;
    let messageTotalLatency = 0;
    let connected = false;

    // 构建带 token 的 WebSocket URL
    const wsUrl = `${data.wsUrl}?token=${encodeURIComponent(data.token)}`;
    const connectStart = Date.now();

    try {
        ws.connect(wsUrl, null, function (socket) {
            socket.on('open', function () {
                connected = true;
                const connectDuration = Date.now() - connectStart;
                wsConnectDuration.add(connectDuration);
                wsConnectionSuccessRate.add(true);
                wsConnectionsActive.add(1);

                // 连接成功后发送初始消息
                socket.send(JSON.stringify({
                    type: 'subscribe',
                    channels: ['hazard_alerts', 'system_notices'],
                    vuId,
                }));
            });

            socket.on('message', function (msg) {
                messageReceivedCount++;
                wsMessageReceivedCount.add(1);

                // 解析消息计算延迟
                try {
                    const data = JSON.parse(msg);
                    if (data.type === 'pong' || data.type === 'heartbeat_ack') {
                        // 心跳响应
                        const rtt = data.timestamp ? Date.now() - data.timestamp : 0;
                        heartbeatTotalRTT += rtt;
                        wsHeartbeatRTT.add(rtt);
                    } else if (data.type === 'notification' || data.type === 'alert') {
                        // 业务消息延迟
                        const latency = data.sentAt ? Date.now() - new Date(data.sentAt).getTime() : 0;
                        messageTotalLatency += latency;
                        wsMessageLatency.add(latency > 0 ? latency : Date.now() - sessionStart);
                    }
                } catch (e) {
                    // 非JSON消息，记录接收时间
                    wsMessageLatency.add(Date.now() - sessionStart);
                }
            });

            socket.on('error', function (e) {
                wsErrorRate.add(1);
                console.error(`[VU ${vuId}] WebSocket 错误: ${e.error()}`);
            });

            socket.on('close', function () {
                wsConnectionsActive.add(0);
            });

            // 心跳循环
            socket.setTimeout(function () {
                heartbeatCount++;
                wsHeartbeatSentCount.add(1);

                // 发送心跳
                const pingSent = Date.now();
                socket.send(JSON.stringify({
                    type: 'ping',
                    timestamp: pingSent,
                    vuId,
                }));

                // 检查上次心跳是否收到响应（简化逻辑）
                if (heartbeatCount > 1 && messageReceivedCount < heartbeatCount - 1) {
                    heartbeatLost++;
                    wsHeartbeatLostCount.add(1);
                    wsHeartbeatSuccessRate.add(false);
                } else {
                    wsHeartbeatSuccessRate.add(true);
                }
            }, HEARTBEAT_INTERVAL * 1000);

            // 设置会话超时
            socket.setTimeout(function () {
                socket.close();
            }, SESSION_DURATION * 1000);

            // 定期发送消息（模拟客户端活动）
            socket.setInterval(function () {
                wsMessageSentCount.add(1);
                socket.send(JSON.stringify({
                    type: 'client_activity',
                    vuId,
                    timestamp: Date.now(),
                }));
            }, 5000);

        });
    } catch (e) {
        wsConnectionSuccessRate.add(false);
        wsConnectionFailCount.add(1);
        wsErrorRate.add(1);
    }

    // 会话结束统计
    const sessionDuration = Date.now() - sessionStart;
    wsSessionDuration.add(sessionDuration);

    check(null, {
        'WS: 连接成功': () => connected,
        'WS: 会话持续时间合理': () => sessionDuration > 10000,
    });
}

// ============================================================
// 场景3：断线重连测试
// ============================================================
export function reconnectTest(data) {
    const vuId = __VU;
    const wsUrl = `${data.wsUrl}?token=${encodeURIComponent(data.token)}`;

    for (let attempt = 1; attempt <= MAX_RECONNECT; attempt++) {
        let reconnected = false;
        const connectStart = Date.now();

        try {
            ws.connect(wsUrl, null, function (socket) {
                socket.on('open', function () {
                    reconnected = true;
                    const connectDuration = Date.now() - connectStart;
                    wsConnectDuration.add(connectDuration);
                    wsConnectionsActive.add(1);

                    socket.send(JSON.stringify({
                        type: 'subscribe',
                        channels: ['hazard_alerts'],
                        vuId,
                    }));

                    // 连接 10s 后主动断开
                    socket.setTimeout(function () {
                        wsConnectionsActive.add(0);
                        socket.close();
                    }, 10000);
                });

                socket.on('message', function (msg) {
                    wsMessageReceivedCount.add(1);
                });

                socket.on('error', function (e) {
                    wsErrorRate.add(1);
                });

                socket.on('close', function () {
                    wsConnectionsActive.add(0);
                });
            });
        } catch (e) {
            wsConnectionSuccessRate.add(false);
            wsConnectionFailCount.add(1);
        }

        if (reconnected) {
            wsReconnectCount.add(attempt);
            wsReconnectSuccessRate.add(true);
        } else {
            wsReconnectSuccessRate.add(false);
        }

        // 重连间隔
        if (attempt < MAX_RECONNECT) {
            sleep(Math.random() * 3 + 2);
        }
    }

    sleep(Math.random() * 5 + 2);
}

// ============================================================
// Teardown
// ============================================================
export function teardown(data) {
    console.log('\n--- WebSocket 并发压测完成 ---');
    console.log(`  WS URL: ${data.wsUrl}`);
    console.log(`  心跳间隔: ${HEARTBEAT_INTERVAL}s`);
    console.log(`  最大重连: ${MAX_RECONNECT} 次`);
    console.log('\n  提示: 如果运行时报错找不到 k6/ws 模块，请：');
    console.log('  1. 升级 k6 到 v0.45+，或');
    console.log('  2. 使用 xk6 构建: xk6 build --with github.com/grafana/xk6-websocket');
}
