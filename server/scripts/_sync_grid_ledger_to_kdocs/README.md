# 网格长巡查台账 → WPS 镜像同步（骨架）

把 PostgreSQL 表 `grid_inspection_records` 同步进 WPS 在线文档，作为只读/协作镜像层。
**WPS 不替代数据库**，PG 仍是系统主库。

## 目录
```
config.js       配置 + 字段映射（唯一需维护的映射处）
pgSource.js     只读 PG（真实查询，复用 server/config/db.js）
mapper.js       PG 行 ↔ WPS 记录 互转
kdocsSink.js    WPS 写入端（集成接缝 + 限频退避）
sync.js         编排：拉 PG → diff → 分批推送
init.js         初始化 WPS 表头
```

## 快速开始
```bash
cd server/scripts/_sync_grid_ledger_to_kdocs

# 1) 核查 PG 数据
node pgSource.js --count

# 2) dry-run 看 diff（不碰 WPS）
node sync.js --dry-run

# 3) 真实前先建表头
node init.js

# 4) 实跑同步（默认桥接为 noop，仅打印将要调用的 kdocs 工具）
node sync.js
```

## 接入真实 WPS（必做 3 步）
1. **连接金山文档连接器**：在 WorkBuddy 连接器管理里授权金山文档，
   确认 `https://www.kdocs.cn/l/cbj5jDkU0KRu` 能解析出 `file_id`/`drive_id`，
   且文档类型为 **多维表格(.dbt)**（推荐）或 **表格(.xlsx/.ksheet)**。
2. **填 config.js**：把 `KDOCS_FILE_ID` / `KDOCS_DRIVE_ID` / `DOC_TYPE` 改成实际值
   （也可用环境变量 `KDOCS_FILE_ID` 等注入，避免硬编码）。
3. **注入真实桥接**：在自动化运行时调用
   ```js
   const sink = require('./kdocsSink');
   sink.setKdocsBridge(async (tool, args) => { /* 调用金山文档连接器对应工具 */ });
   ```
   kdocs 工具名请以 `references/dbsheet.md`（多维表格）或 `references/sheet.md`（普通表格）为准。
   本骨架约定名：`dbsheet.list_records / add_records / update_records / delete_records / add_fields`。

## 限频与健壮性
- kdocs 连接器会返回 `429001 限频` / `429002 熔断` 并带恢复时间；`kdocsSink.withRateLimit`
  捕获后会**立刻停止并等待恢复时间**再续传，**禁止**立即重试（否则触发熔断）。
- 写入按 `BATCH_SIZE`(默认 20) 分批，批间 `BATCH_INTERVAL_MS` 间隔。
- 更新策略当前为"快照存在即更新"的简化版；生产应按 `updated_at` 比对跳过未变行。

## 同步方向
- `SYNC_MODE='mirror'`（默认）：PG→WPS 单向，最稳，非技术同事在 WPS 看/改不回写。
- `SYNC_MODE='twoway'`（阶段 B）：需 WPS 多维表格配 Webhook 把改动回写 PG，
  且回写字段限制在 `config.TWOWAY_WRITABLE_PG`（对齐后端白名单），并加乐观锁防互覆盖。

## 已知边界
- 图片只镜像**路径**（如 `/uploads/grid-inspection/...`），不搬二进制。
- HSE 安全数据入第三方云前请确认内部合规口径。
