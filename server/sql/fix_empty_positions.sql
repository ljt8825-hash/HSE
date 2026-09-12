-- fix_empty_positions.sql
-- 任务1 (提示词-82 D2): 补全 18 名 position_id 为空的员工当前任职岗位
-- 幂等: 仅更新 is_current=true 且 is_deleted=false 且 position_id IS NULL 的任职行
--
-- 数据源: employee_import_pending 中这些员工的 raw_position / target_pos_id
--   7 名员工 pending 已解析出 target_pos_id -> 直接使用
--   11 名员工仅有 raw_position 文本 -> 按 position 表名称映射(口径同 提示词-79 粗映射)
--   TEST001 为 1 名文件外/测试员工, raw_position 为空 -> 赋文档化默认值 管理员(1395)
--
-- position 表 30 行全部 is_deleted=t 属"软删实则活跃", 引用其 id 不违反 FK

WITH fixes(emp_code, pos_id) AS (VALUES
  ('00179501', 1381),  -- 黄殿兴  项目总经理          -> 项目总经理(1381) pending target_pos_id
  ('00268763', 1395),  -- 肖松娥  维保管理专员        -> 管理员(1395) 专员口径
  ('00271315', 1391),  -- 韩婷    人力综合部经理      -> 部门经理(1391) 经理口径
  ('00271317', 1389),  -- 刘金涛  安环管理部经理      -> 安环副经理(1389) 安环经理口径
  ('00271497', 1391),  -- 孙佳敏  行政综合主管        -> 部门经理(1391) 主管口径
  ('00271499', 1395),  -- 柴倩倩  标准化专员          -> 管理员(1395) 专员口径
  ('00275165', 1391),  -- 张康    生产管理部经理      -> 部门经理(1391) 经理口径
  ('00275183', 1402),  -- 刘会杰  人事专员            -> 人事专员(1402) pending target_pos_id
  ('00280305', 1390),  -- 孟祥宇  安环专员            -> 安环专员(1390) 精确同名
  ('00296262', 1391),  -- 于鑫宁  作业质量管理主管    -> 部门经理(1391) 主管口径
  ('00307234', 1401),  -- 曹周平  会计                -> 会计(1401) pending target_pos_id
  ('00325046', 1390),  -- 李真真  安环专员            -> 安环专员(1390) 精确同名
  ('00325047', 1395),  -- 王明轩  库管专员            -> 管理员(1395) 专员口径
  ('00400097', 1392),  -- 黄元同  生产作业中心副经理  -> 生产作业中心副经理(人工)(1392) pending target_pos_id
  ('00408517', 1394),  -- 刘菲    人工片区长          -> 环卫作业中心片区长(1394) pending target_pos_id
  ('00408519', 1394),  -- 韩晓亮  人工片区长          -> 环卫作业中心片区长(1394) pending target_pos_id
  ('00449297', 1400),  -- 黄佳琦  文员                -> 文员(1400) pending target_pos_id
  ('TEST001',  1395)   -- 张三    文件外/测试员工(无岗位数据) -> 管理员(1395) 文档化默认值
)
UPDATE employee_assignment a
SET position_id = f.pos_id
FROM fixes f
JOIN employee e ON e.employee_code = f.emp_code AND e.is_deleted = false
WHERE a.employee_id = e.id
  AND a.is_current = true
  AND a.is_deleted = false
  AND a.position_id IS NULL;
