# 宁津项目HSE安全管理系统 — 数据库说明

## 一、ER关系图（文字版）

```
                       ┌──────────────┐
                       │ departments  │  (部门字典)
                       └──────┬───────┘
                              │ 1:N
                              ▼
┌──────────────┐       ┌──────────────┐
│  grid_areas  │ N:1   │  personnel   │  ◀──┐
└──────┬───────┘──────▶└──────┬───────┘     │
       │ (网格长)             │             │
       │ 1:N                  │ 1:N         │ 1:N
       ▼                      ▼             │
┌──────────────────┐    ┌──────────────────┐  │
│grid_patrol_logs  │    │personnel_        │  │
└──────────────────┘    │  insurance       │  │
                       └──────────────────┘  │
                              │             │
       ┌──────────────────────┘             │
       │                                    │
       │ 1:N                                │
       ▼                                    │
┌──────────────────┐   N:1                  │
│  training_       │────▶ personnel         │
│  records         │                        │
└──────────────────┘                        │
                                            │
┌──────────────────┐   N:1  ┌──────────────┴──────┐
│  over_age_       │───────▶│   personnel         │
│  personnel       │        └─────────────────────┘
└──────────────────┘

┌──────────────┐  1:N    ┌──────────────────┐
│  vehicles    │────────▶│ insurance_history │
└──────┬───────┘         └──────────────────┘
       │
       │ N:1 (被事故关联)
       ▼
┌──────────────┐  1:N    ┌──────────────────┐
│  accidents   │────────▶│ accident_persons │  M:N
└──────┬───────┘         └────────┬─────────┘
       │                          │ N:1
       │ N:1                      ▼
       │                    personnel
       ▼
   (车辆-事故关联通过involved_vehicle字段冗余/外键)


┌──────────────┐  (独立表，无外键)
│  hazards     │  隐患排查
└──────────────┘

┌──────────────┐
│  import_logs │  导入日志(辅助)
└──────────────┘
┌──────────────────┐
│ sys_operation_log│  操作日志(辅助)
└──────────────────┘
```

## 二、核心关系说明

| 父表 | 子表 | 关系 | 说明 |
|------|------|------|------|
| `departments` | `personnel` | 1:N | 部门→人员 |
| `personnel` | `personnel_insurance` | 1:N | 一人可能有多份保单 |
| `personnel` | `over_age_personnel` | 1:1 | 适龄/超龄分类 |
| `personnel` | `training_records` | 1:N | 多次培训 |
| `personnel` | `training_roster` | 1:1 | 培训花名册 |
| `personnel` | `grid_areas` | 1:1 | 网格长映射 |
| `personnel` | `accident_persons` | 1:N | 事故可涉及多人 |
| `personnel` | `accidents` | 1:N | 涉事人员 |
| `vehicles` | `insurance_history` | 1:N | 一车多年保单 |
| `vehicles` | `accidents` | 1:N | 涉事车辆 |
| `accidents` | `accident_persons` | 1:N | 事故→涉事人员 |
| `grid_areas` | `grid_patrol_logs` | 1:N | 巡查日志 |

## 三、表清单

| 序号 | 表名 | 中文说明 | 核心索引 |
|------|------|----------|----------|
| 1 | `departments` | 部门字典 | name(uk) |
| 2 | `vehicles` | 车辆基础信息 | plate(uk), vin, ins_end, status |
| 3 | `insurance_history` | 保险历史 | vehicle_id, plate, end_date, is_current |
| 4 | `personnel` | 人员基础信息 | id_card(uk), name, age, dept |
| 5 | `personnel_insurance` | 人员保险 | personnel_id, expire_date, type |
| 6 | `over_age_personnel` | 超龄人员 | age, control_type, optimize_status |
| 7 | `training_records` | 培训记录 | training_date, name, grid_level |
| 8 | `training_roster` | 培训花名册 | name(uk), level |
| 9 | `hazards` | 隐患排查 | hazard_date, status, deadline, level |
| 10 | `accidents` | 事故记录 | accident_date, year/month, type, status |
| 11 | `accident_persons` | 事故-人员多对多 | accident_id, personnel_id |
| 12 | `grid_areas` | 网格管理 | grid_code(uk), grid_level, name |
| 13 | `grid_patrol_logs` | 网格巡查日志 | grid_id, patrol_date |
| 14 | `import_logs` | 导入日志 | module, created_at |
| 15 | `sys_operation_log` | 操作日志 | module, operator, created_at |

## 四、通用规范

- **字符集**: utf8mb4 / utf8mb4_unicode_ci
- **存储引擎**: InnoDB（支持事务、外键、行锁）
- **必备字段**: 每张业务表均含 `id`(BIGINT自增主键)、`created_at`、`updated_at`、`is_deleted`
- **软删除**: 通过 `is_deleted=0/1` 控制，避免物理删除导致数据丢失
- **金额字段**: `DECIMAL(12,2)` 或 `DECIMAL(14,2)`，避免浮点误差
- **时间字段**: 日期用 `DATE`，时间戳用 `DATETIME`
- **冗余字段**: 高频查询字段（如人员姓名、车牌号）允许冗余存储，提升查询性能

## 五、关键视图

| 视图 | 用途 |
|------|------|
| `v_vehicle_insurance_expiring` | 60天内保险到期的车辆 |
| `v_personnel_insurance_anomaly` | 人员参保异常清单 |
| `v_hazard_pending` | 未完成/逾期隐患 |

## 六、数据迁移思路

1. **当前导入方式**：
   - 通过系统前端导入页面或后端导入 API 处理 Excel/CSV 数据
   - 字段校验、重复检查和导入日志由当前服务负责

2. **旧文件同步已停用**：
   - 不再从旧静态目录的 `*_data.js` 提取或同步数据
   - 不再使用旧目录脚本生成前端数据文件

## 七、性能与扩展建议

1. **分表**：`accidents`、`insurance_history` 长期增长，按 `year` 分区
2. **归档**：`is_deleted=1` 数据超过1年可归档到历史表
3. **缓存**：保险即将到期等看板数据可使用 Redis 缓存10分钟
4. **审计**：通过 `sys_operation_log` 记录关键变更
5. **加密**：身份证号 `id_card` 建议在应用层加密存储

## 八、SQL文件清单

| 文件 | 用途 |
|------|------|
| `sql/ningjin_hse_schema.sql` | 建库建表主脚本 |
| `sql/import_personnel_data.sql` | 人员数据导入（待补） |
| `sql/import_accident_data.sql` | 事故数据导入（待补） |
| `sql/import_hazard_data.sql` | 隐患数据导入（待补） |
| `sql/import_grid_data.sql` | 网格数据导入（待补） |
