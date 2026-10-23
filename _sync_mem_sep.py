# -*- coding: utf-8 -*-
import io
p = r'c:\Users\honey\.trae-cn\memory\projects\-g-hse-dashboard--p2-39890f8dc61cf22a4d70\project_memory.md'
s = io.open(p, encoding='utf-8').read()
anchor = '详见 `docs/191副/②交付报告/2026-09-21_8月三违统计分析按花名册交付.md`'
new = ('\n- 9月三违统计口径（2026-09-21）：与7/8月一致（花名册「网格长等级」权威、总+一级=公司管理只合计、李中胜→李忠胜）。'
       '9月新增：台账分组名称「公司管理员」与「公司管理」为同一批人跨批次标法不一致→统计时归一为「公司管理」；'
       '笔误归并沿用8月并新增 李兰凤→李兰风、杜瑞兰→杜润兰、王春灵（去备注）。'
       '交付 `2026年9月三违统计分析（按花名册）.xlsx`（6 sheets，覆盖9/1-9/18未满月），详见 `docs/191副/②交付报告/2026-09-21_9月三违统计分析按花名册交付.md`')
assert anchor in s, 'anchor not found'
s = s.replace(anchor, anchor + new)
io.open(p, 'w', encoding='utf-8').write(s)
print('inserted OK')