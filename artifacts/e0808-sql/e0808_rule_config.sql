-- ============================================================================
-- P2-B1-E-08-08 三违责任扣分规则重新调整 —— DEV 规则配置 DML（仅 DEV 执行）
-- ============================================================================
-- 目标库   : safety_dashboard_dev（生产 safety_dashboard 禁止执行，须另行授权）
-- 目标规则 : hse_assessment_rule.rule_code = 'VIOLATION003'（自身三违行为）
-- 性质     : 纯 DML（UPDATE 单行 JSONB 配置），无 DDL，无数据行修改，幂等可重跑
--
-- 变更内容（E-08-08 规格 §二/§三/§四/§五/§六/§八）：
--   1. scope_config.company_score: 5 → 1
--      公司检查「普通三违」基础扣分 = 1 分/次（此前 5 分/次理解作废）。
--   2. 新增 scope_config.company_item_scores:
--      仅「不戴安全头盔」这一项三违 → 责任上级扣 5 分/次，严禁扩散到其他项目。
--      match_keywords 含业务规范名「不戴安全头盔」与库内实测历史名「骑车不戴头盔」
--      （DEV 2506 条存量中头盔类仅此两种写法 + 组合写法「骑车不戴头盔,未穿工作服」，
--        无「不戴安全帽/未佩戴安全头盔」等其它历史变体 —— 审计结论见阶段报告 §八）。
--      组件/描述与关键词「精确包含」匹配；多项目命中取最高分，不做分值累加。
--   3. 新增 scope_config.checker_scope（检查人「公司检查/乡镇自查」权威判定，E-08-08 §三/§七）：
--      - company_org_names: 公司部门与作业中心（DEV 实测组织值域，含市政绿化作业中心备 future）
--      - company_position_names: 公司层面岗位（DEV 实测岗位值域）
--      - township_self_positions: 乡镇作业中心经理 / 管理员（自查，不产生责任扣分）
--      代码零硬编码人员 id/姓名/组织名/岗位名，全部配置驱动（改库不改码）。
--   4. transmission_config.by_violator_position 调整（E-08-08 §四）：
--      - 管理员: [管理员, 乡镇作业中心经理] → [乡镇作业中心经理]
--        （公司检查发现管理员三违 → 仅乡镇作业中心经理扣分，管理员本人不再自扣）
--      - 新增岗位槽位（DEV 实测岗位名）：
--        垃圾收运车驾驶员 / 垃圾转运车驾驶员（规格「驾驶员」）、
--        收运辅助工（规格「挂桶工（辅助工）」，DEV 实测 3 人）、
--        转运站操作员（规格「转运站操作员（转运站管理员）」）
--        → [乡镇作业中心经理]
--      - 保洁员 / 乡镇作业中心经理 槽位保持 R4 冻结口径不变。
-- 不改动：GRIDVIOL001（网格候选确认域，独立冻结规则，存量 0 行）、metric_code、
--         valid_from/valid_to、integration_status、deduct_score（基准分仍 1 分）。
-- ============================================================================

UPDATE hse_assessment_rule
   SET scope_config = jsonb_build_object(
         'object_type', 'township',
         'transmission', TRUE,
         'company_score', 1,
         'company_item_scores', jsonb_build_object(
           '不戴安全头盔', jsonb_build_object(
             'score', 5,
             'match_keywords', jsonb_build_array('不戴安全头盔', '骑车不戴头盔')
           )
         ),
         'checker_scope', jsonb_build_object(
           'company_org_names', jsonb_build_array(
             '安环管理部', '生产管理部', '人力综合部', '财务部', '项目管理层',
             '环卫作业中心', '市政绿化作业中心'
           ),
           'company_position_names', jsonb_build_array(
             '项目总经理', '部门经理', '安环专员', '人力综合部经理'
           ),
           'township_self_positions', jsonb_build_array(
             '乡镇作业中心经理', '管理员'
           )
         )
       ),
       transmission_config = jsonb_build_object(
         'fallback', 'skip',
         'only_check_source', 'company',
         'by_violator_position', jsonb_build_object(
           '保洁员', jsonb_build_array('管理员', '乡镇作业中心经理'),
           '管理员', jsonb_build_array('乡镇作业中心经理'),
           '乡镇作业中心经理', jsonb_build_array('乡镇作业中心经理'),
           '垃圾收运车驾驶员', jsonb_build_array('乡镇作业中心经理'),
           '垃圾转运车驾驶员', jsonb_build_array('乡镇作业中心经理'),
           '收运辅助工', jsonb_build_array('乡镇作业中心经理'),
           '转运站操作员', jsonb_build_array('乡镇作业中心经理')
         )
       ),
       updated_at = NOW()
 WHERE rule_code = 'VIOLATION003'
   AND is_deleted = FALSE;

-- 预期影响：1 行（VIOLATION003 id=12）
