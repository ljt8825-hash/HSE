/**
 * ============================================================
 * PM2 进程管理配置 — 宁津环卫 HSE 安全管理系统 v4.1
 * ============================================================
 *
 * 使用方式:
 *   pm2 start ecosystem.config.js                    # 默认启动（development）
 *   pm2 start ecosystem.config.js --env production    # 生产模式启动
 *   pm2 stop ecosystem.config.js                      # 停止所有进程
 *   pm2 restart ecosystem.config.js                   # 重启所有进程
 *   pm2 delete ecosystem.config.js                    # 删除所有进程
 *   pm2 logs hse-backend                              # 查看后端日志
 *   pm2 monit                                         # 实时监控面板
 *   pm2 save                                          # 保存当前进程列表
 *   pm2 startup                                       # 设置开机自启
 *
 * 生产环境部署步骤:
 *   1. 确保 Node.js >= 22.0.0
 *   2. cd server && npm ci --production
 *   3. 配置 .env.production（数据库连接、JWT 密钥等）
 *   4. pm2 start ecosystem.config.js --env production
 *   5. pm2 save
 *   6. pm2 startup
 * ============================================================
 */
module.exports = {
  apps: [
    {
      // ---- 应用名称 ----
      name: 'hse-backend',

      // ---- 入口脚本（相对于 cwd） ----
      script: 'server/app.js',

      // ---- 工作目录 ----
      cwd: __dirname,

      // ---- 实例配置 ----
      instances: 2,           // 启动 2 个进程（cluster 模式充分利用多核 CPU）
      exec_mode: 'cluster',    // cluster 模式（Linux 推荐，Windows 不支持 cluster 请改为 'fork'）

      // ---- 内存限制 ----
      max_memory_restart: '512M', // 单个进程内存超过 512MB 自动重启

      // ---- 环境变量 ----
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // 以下变量从 .env.production 读取，PM2 会自动加载
        // DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
        // JWT_SECRET, JWT_EXPIRES_IN
        // CORS_ORIGINS
      },

      // ---- 日志配置 ----
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',  // 日志时间格式（含时区）
      error_file: './logs/pm2-error.log',          // 错误日志路径
      out_file: './logs/pm2-out.log',              // 标准输出日志路径
      merge_logs: true,                            // 开启集群模式日志合并
      time: true,                                  // 日志前缀添加时间戳

      // ---- 自动重启策略 ----
      autorestart: true,          // 进程异常退出后自动重启
      max_restarts: 10,          // 单周期内最大重启次数
      restart_delay: 4000,       // 重启间隔 4 秒
      min_uptime: '10s',         // 进程运行不足 10 秒就退出视为异常启动

      // ---- 超时配置 ----
      listen_timeout: 3000,       // 启动后等待端口监听超时 3 秒
      kill_timeout: 5000,         // 停止进程超时 5 秒（强制 SIGKILL）

      // ---- 关闭文件监听（生产环境不需要） ----
      watch: false,

      // ---- 忽略监听的目录 ----
      ignore_watch: [
        'node_modules',
        'logs',
        'uploads',
        '.git'
      ]
    }
  ],

  // ---- PM2 部署配置（可选，用于 pm2 deploy 远程部署） ----
  deploy: {
    production: {
      user: 'deploy',                              // 远程服务器用户名
      host: 'your-production-server.com',           // 远程服务器地址
      ref: 'origin/main',                          // Git 分支
      repo: 'git@github.com:your-org/hse-safety-dashboard.git', // Git 仓库地址
      path: '/opt/hse-safety-dashboard',            // 远程部署路径
      'pre-deploy-local': '',                      // 本地部署前钩子
      'post-deploy':
        'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''                              // 首次部署前钩子
    }
  }
};
