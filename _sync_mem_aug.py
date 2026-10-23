# -*- coding: utf-8 -*-
import io
p = r'c:\Users\honey\.trae-cn\memory\projects\-g-hse-dashboard--p2-39890f8dc61cf22a4d70\project_memory.md'
s = io.open(p, encoding='utf-8').read()
anchor = '（合计 20）'
new = ('\n- 8月三违统计口径（2026-09-21）：与7月完全一致（花名册「网格长等级」为唯一权威、总网格长+一级网格长=公司管理只合计、按姓名仅二/三级、李中胜→李忠胜）。'
       '违章人姓名属自由文本，统计前需清洗（去括号备注/标点）再按员工花名册「所属部门」去班组后缀得乡镇；'
       '8月笔误归并：姚奎岭→姚奎领、李凤丽→李风丽、李建方→李建芳、范志新→范治新、袁书霞（去备注）；孙艳红/张宝树全花名册未命中→未匹配。'
       '交付 `2026年8月三违统计分析（按花名册）.xlsx`（6 sheets），详见 `docs/191副/②交付报告/2026-09-21_8月三违统计分析按花名册交付.md`')
assert anchor in s, 'anchor not found'
s = s.replace(anchor, anchor + new)
io.open(p, 'w', encoding='utf-8').write(s)
print('inserted OK')