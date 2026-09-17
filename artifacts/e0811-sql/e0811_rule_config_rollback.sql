-- =====================================================================
-- P2-B1-E-08-11 规则配置回滚（恢复 E-08-08 终态）
-- 适用库：safety_dashboard_dev
-- 恢复：by_violator_position['管理员'] = ["乡镇作业中心经理"]；
--       删除 helmet_layer_scores。
-- =====================================================================

UPDATE hse_assessment_rule
   SET transmission_config = jsonb_set(
         transmission_config - 'helmet_layer_scores',
         '{by_violator_position,管理员}',
         '["乡镇作业中心经理"]'::jsonb,
         true),
       updated_at = now()
 WHERE rule_code = 'VIOLATION003' AND is_deleted = FALSE;
