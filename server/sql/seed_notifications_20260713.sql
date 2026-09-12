INSERT INTO notifications (user_id, title, content, type, biz_type, biz_id, is_read, created_at) VALUES
(1, '流程审批通过', '您提交的隐患整改申请已通过审批', 'workflow', 'hazard', '1', false, NOW() - INTERVAL '30 minutes'),
(1, '新告警通知', '检测到设备温度异常，请及时处理', 'alert', 'equipment', '2', false, NOW() - INTERVAL '2 hours'),
(1, '待办任务提醒', '您有3项安全巡检任务即将到期', 'task', 'patrol', '3', true, NOW() - INTERVAL '4 hours'),
(1, '系统更新通知', '系统将于今晚22:00进行例行维护', 'system', null, null, true, NOW() - INTERVAL '1 day'),
(1, '审批驳回', '您提交的培训计划被驳回，请修改后重新提交', 'approval', 'training', '4', false, NOW() - INTERVAL '2 days'),
(1, '隐患告警', '发现重大安全隐患，需立即处理', 'alert', 'hazard', '5', false, NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;
