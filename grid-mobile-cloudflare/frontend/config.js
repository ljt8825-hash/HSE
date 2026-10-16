// CF-WPS-11 H5 前端配置（最小化；无任何密钥/凭据）
// API 基址：
//   - 同源部署（Pages Functions 反代 /api → Worker）：留空 ''  ← 生产口径
//     ⚠️ 2026-10-16 教训：绝对不要直连 *.workers.dev——
//        ① workers.dev 在国内手机网络普遍被墙，现场用户根本连不上；
//        ② `grid-mobile-cloudflare.ljt8825.workers.dev` 是 Pages 项目自身的
//           workers.dev 别名（见 _pages_deploy/wrangler.toml name），不是 API
//           Worker，其上没有 WORKER_SESSION_SECRET，登录恒 503。
//   - 本地开发直连 Worker：填 API Worker 完整地址
//     'https://grid-mobile-cloudflare-worker.ljt8825.workers.dev'
const API_BASE = '';
