// Pages Functions 路由：/api/* → Worker（H5 主业务链路）
// 实现见 ./_workerProxy.js
import { proxyToWorker } from '../_workerProxy.js';
export const onRequest = proxyToWorker;
