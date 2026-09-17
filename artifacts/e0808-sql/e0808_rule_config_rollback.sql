-- ============================================================================
-- P2-B1-E-08-08 DEV 规则配置回滚脚本（仅 DEV 执行）
-- ============================================================================
-- 恢复 VIOLATION003 为 E-08-08 执行前配置（2026-09-14 执行前实测快照）：
--   scope_config = {"object_type":"township","transmission":true,"company_score":5}
--   transmission_config.by_violator_position =
--     保洁员:[管理员,乡镇作业中心经理] / 管理员:[管理员,乡镇作业中心经理] /
--     乡镇作业中心经理:[乡镇作业中心经理]
-- ============================================================================

UPDATE hse_assessment_rule
   SET scope_config = '{"object_type": "township", "transmission": true, "company_score": 5}'::jsonb,
       transmission_config = '{
         "fallback": "skip",
         "only_check_source": "company",
         "by_violator_position": {
           "保洁员": ["管理员", "乡镇作业中心经理"],
           "管理员": ["管理员", "乡镇作业中心经理"],
           "乡镇作业中心经理": ["乡镇作业中心经理"]
         }
       }'::jsonb,
       updated_at = NOW()
 WHERE rule_code = 'VIOLATION003'
   AND is_deleted = FALSE;

-- 预期影响：1 行
