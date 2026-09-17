-- =====================================================================
-- P2-B1-E-08-11 公司检查三违责任扣分分层规则 · 规则配置 DML（幂等）
-- 适用库：safety_dashboard_dev（生产待单独授权）
-- 变更点（仅 VIOLATION003 一行，transmission_config JSONB）：
--   1) by_violator_position['管理员'] 收回本人槽位：
--        ["乡镇作业中心经理"] → ["管理员","乡镇作业中心经理"]
--      （业务 T7/T3：管理员违规时 本人扣分 + 直接上级乡镇经理扣分）
--   2) 新增 helmet_layer_scores（E-08-11 分层，键与 resolver.resolutionLayer 对齐）：
--        { "self_violator": 5, "direct_supervisor": 5, "escalated": 1 }
--      语义：安全头盔特殊项目 → 违规者本人 5 / 直接上级 5 / 更高一级 1；
--      普通公司三违不受影响（每责任目标 company_score=1）。
-- 幂等：jsonb_build_object 整体重建，重复执行结果一致。
-- =====================================================================

UPDATE hse_assessment_rule
   SET transmission_config = jsonb_set(
         jsonb_set(
           transmission_config,
           '{by_violator_position,管理员}',
           '["管理员","乡镇作业中心经理"]'::jsonb,
           true),
         '{helmet_layer_scores}',
         '{"self_violator":5,"direct_supervisor":5,"escalated":1}'::jsonb,
         true),
       updated_at = now()
 WHERE rule_code = 'VIOLATION003' AND is_deleted = FALSE;

-- 自检：幂等重跑一致性 + 结果断言
-- （应用脚本 _e0811_apply_rule_config.cjs 会校验以下内容）
--   transmission_config->'by_violator_position'->'管理员'      = ["管理员","乡镇作业中心经理"]
--   transmission_config->'helmet_layer_scores'->'escalated'    = 1
--   其余槽位（保洁员/乡镇作业中心经理/收运辅助工/转运站操作员/垃圾收运车驾驶员/垃圾转运车驾驶员）不变
--   scope_config（company_score/company_item_scores/checker_scope）不变
