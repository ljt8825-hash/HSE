-- ============================================================
-- hse_todo_sources 第二批种子：按真实业务扩展"待办缺口"来源
-- 安委会 / 规章制度 / 三违 / 网格（均持续型，出现在 每天/每周/每月）
-- 每个新源对应 server/routes/todos.js 中一个 handler
-- ============================================================
INSERT INTO hse_todo_sources
  (source_code, module, sub_board, title, cadence, detail_api, export_columns, link, enabled)
VALUES
  (
    'committee_meeting_missing', '安委会', '安全会议', '安委会会议未录入',
    ARRAY['daily','weekly','monthly'], 'committee:meeting-missing',
    '[{"field":"periodLabel","header":"应开周期"},{"field":"itemName","header":"缺失事项"},{"field":"dueEnd","header":"应录入截止"}]'::jsonb,
    '/objectives/committee', true
  ),
  (
    'regulation_pending', '规章制度', '制度管理', '规章制度待发布/修订',
    ARRAY['daily','weekly','monthly'], 'regulation:pending',
    '[{"field":"name","header":"制度名称"},{"field":"category","header":"类别"},{"field":"status","header":"状态"},{"field":"effectiveDate","header":"生效日期"}]'::jsonb,
    '/standards/regulations', true
  ),
  (
    'violation_pending', '三违管理', '三违记录', '三违待处理',
    ARRAY['daily','weekly','monthly'], 'violation:pending',
    '[{"field":"no","header":"编号"},{"field":"violationType","header":"类型"},{"field":"violatorName","header":"违规人"},{"field":"location","header":"位置"},{"field":"violationDate","header":"日期"},{"field":"status","header":"状态"}]'::jsonb,
    '/site/violation', true
  ),
  (
    'grid_completion', '网格管理', '网格巡查', '网格巡查完成率不达标',
    ARRAY['daily','weekly','monthly'], 'grid:completion',
    '[{"field":"gridCode","header":"网格编码"},{"field":"name","header":"网格名称"},{"field":"gridLevel","header":"层级"},{"field":"completionRate","header":"完成率"}]'::jsonb,
    '/site/grid', true
  )
ON CONFLICT (source_code) DO UPDATE SET
  module = EXCLUDED.module,
  sub_board = EXCLUDED.sub_board,
  title = EXCLUDED.title,
  cadence = EXCLUDED.cadence,
  detail_api = EXCLUDED.detail_api,
  export_columns = EXCLUDED.export_columns,
  link = EXCLUDED.link,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();
