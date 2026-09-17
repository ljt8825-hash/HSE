// Pages Functions 路由：/wps/* → Worker（照片上传 /wps/upload/image 等历史通道）
// 注意：这些路径不在 /api 前缀下，必须单独反代，否则前端照片上传会 404。
// 实现见 ./_workerProxy.js
import { proxyToWorker } from '../_workerProxy.js';
export const onRequest = proxyToWorker;
