/**
 * PM2 进程管理配置
 * 使用方式:
 *   pm2 start ecosystem.config.js               # 启动所有进程
 *   pm2 start ecosystem.config.js --env production  # 生产模式
 *   pm2 stop ecosystem.config.js                 # 停止所有进程
 *   pm2 restart ecosystem.config.js              # 重启所有进程
 *   pm2 logs hse-backend                         # 查看后端日志
 *   pm2 monit                                    # 监控面板
 *
 * 生产环境部署步骤:
 *   1. 确保 Node.js >= 18.0.0
 *   2. cd server && npm install --production
 *   3. 配置 server/.env（数据库连接、JWT 密钥等）
 *   4. pm2 start ecosystem.config.js
 *   5. pm2 save
 *   6. pm2 startup （开机自启）
 */
module.exports = {
  apps: [
    {
      name: 'hse-backend',
      script: './app.js',
      cwd: __dirname,
      instances: 1,                // 单机部署建议 1 个实例
      exec_mode: 'fork',           // fork 模式（Windows 推荐）
      watch: false,                // 生产环境关闭文件监听
      max_memory_restart: '500M',  // 内存超过 500MB 自动重启
      env: {
        NODE_ENV: 'production',
        PORT: 5666
      },
      // 日志配置
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // 自动重启策略
      max_restarts: 10,            // 10 分钟内最多重启 10 次
      restart_delay: 5000,         // 重启间隔 5 秒
      min_uptime: '10s',           // 最小运行时间（防频繁重启）
      // 健康检查
      listen_timeout: 10000,       // 启动后等待 10 秒
      kill_timeout: 5000,          // 停止等待 5 秒
      // 环境变量
      env_production: {
        NODE_ENV: 'production',
        PORT: 5666
      }
    }
  ]
};