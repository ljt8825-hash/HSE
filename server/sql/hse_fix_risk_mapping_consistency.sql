-- ============================================================
-- position_risk_mapping 治理：position_code 一致性 + 映射补全
-- 日期：2026-08-27
-- 1) position_code 统一为 POS-*（与 position 表一致）
-- 2) 补全映射：总经理→项目总经理(1381)；新增管理岗(环卫中心副经理/环卫作业中心副经理(人工)/副经理/保洁班长)；
--    新增有在职的 normal 岗(转运站操作员/收运辅助工/安环专员/文员/会计/人事专员)
-- 3) 删除 3 行死配置(勾臂车司机/收运车司机/吸污车司机机动岗，岗位已软删)
-- 注：网格长(id=6)为逻辑岗位，position 表无实体，保留 position_id=null（巡查按岗位名 ILIKE 独立处理）。
-- 回滚：DELETE 新增的 17-26 行；id=8 还原 position_id=null/name='总经理'/code='GM'/level=null；
--       id=9/10/11 code 还原 DM/TOWM_MGR/AREA_MGR；重新 INSERT id=12/13/14。
-- ============================================================

BEGIN;

-- 1. 删除死配置（岗位已软删）
DELETE FROM position_risk_mapping WHERE id IN (12, 13, 14);

-- 2. position_code 统一为 POS-*
UPDATE position_risk_mapping SET position_code = 'POS-DEPT-MGR', updated_at = NOW() WHERE id = 9;   -- 部门经理
UPDATE position_risk_mapping SET position_code = 'POS-TOWN-MGR', updated_at = NOW() WHERE id = 10;  -- 乡镇作业中心经理
UPDATE position_risk_mapping SET position_code = 'POS-HW-AREA-MGR', updated_at = NOW() WHERE id = 11; -- 环卫作业中心片区长

-- 3. 总经理 → 项目总经理(1381) 补全
UPDATE position_risk_mapping
   SET position_id = 1381, position_name = '项目总经理', position_code = 'POS-GM',
       management_level = 'high', updated_at = NOW()
 WHERE id = 8;

-- 4. 新增管理岗映射
INSERT INTO position_risk_mapping (position_name, position_code, position_id, risk_category, is_driver, applicable_risk_types, description, is_active, management_level, created_at, updated_at) VALUES
('环卫中心副经理','POS-HW-MGR',1382,'management',false,'["violation","training_compliance","incident","management_execution"]','环卫中心副经理岗位',true,'middle',NOW(),NOW()),
('环卫作业中心副经理（人工）','POS-HW-DEPMGR',1392,'management',false,'["violation","training_compliance","incident","management_execution"]','环卫作业中心副经理（人工）岗位',true,'frontline',NOW(),NOW()),
('副经理','POS-DEPT-DEPUTY',1403,'management',false,'["violation","training_compliance","incident","management_execution"]','副经理岗位',true,'middle',NOW(),NOW()),
('保洁班长','POS-FOREMAN',1384,'management',false,'["violation","training_compliance","incident","management_execution"]','保洁班长岗位',true,'frontline',NOW(),NOW());

-- 5. 新增有在职的 normal 岗位映射
INSERT INTO position_risk_mapping (position_name, position_code, position_id, risk_category, is_driver, applicable_risk_types, description, is_active, management_level, created_at, updated_at) VALUES
('转运站操作员','POS-STATION',1387,'normal',false,'["violation","training_compliance","incident"]','转运站操作员岗位',true,NULL,NOW(),NOW()),
('收运辅助工','POS-COLLECT-HELPER',1388,'normal',false,'["violation","training_compliance","incident"]','收运辅助工岗位',true,NULL,NOW(),NOW()),
('安环专员','POS-SAFETY',1390,'normal',false,'["violation","training_compliance","incident"]','安环专员岗位',true,NULL,NOW(),NOW()),
('文员','POS-CLERK',1400,'normal',false,'["violation","training_compliance","incident"]','文员岗位',true,NULL,NOW(),NOW()),
('会计','POS-ACCOUNTANT',1401,'normal',false,'["violation","training_compliance","incident"]','会计岗位',true,NULL,NOW(),NOW()),
('人事专员','POS-HR',1402,'normal',false,'["violation","training_compliance","incident"]','人事专员岗位',true,NULL,NOW(),NOW());

COMMIT;

-- 验证：
-- SELECT id, position_name, position_code, position_id FROM position_risk_mapping WHERE position_code IS NOT NULL AND position_code != (SELECT position_code FROM position WHERE id = position_risk_mapping.position_id);  -- 应空
-- SELECT count(*) FROM position_risk_mapping m LEFT JOIN position p ON p.id=m.position_id WHERE m.position_id IS NOT NULL AND p.id IS NULL;  -- 应 0
