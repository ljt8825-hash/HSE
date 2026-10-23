# -*- coding: utf-8 -*-
import io
p = r'c:\Users\honey\.trae-cn\memory\projects\-g-hse-dashboard--p2-39890f8dc61cf22a4d70\project_memory.md'
s = io.open(p, encoding='utf-8').read()
anchor = '详见 `docs/191副/①规则口径/2026-09-21_网格长等级以花名册为权威口径.md`'
new = ('\n- 违章人姓名→乡镇映射口径（2026-09-21 冻结）：公司管理三违按乡镇统计时，'
       '违章人所属乡镇按员工花名册「所属部门」去班组后缀（片区/一班…十班/三四班/六七班/一二班/二三班）得乡镇；'
       '「车队」为非乡镇部门（杨小林）单独列「车队」不计乡镇；'
       '邢万俊=时集镇三班（7/30 花名册已离职故缺，按 7 月及前后多期花名册口径归「时集镇」）；'
       '张书丽、杜凤兰全部花名册均未命中→「未匹配」。'
       '2026 年 7 月公司管理三违按乡镇=长官镇 6、大曹镇 4、相衙镇 3、保店镇 2、柴胡店镇 1、时集镇 1、车队 1、未匹配 2（合计 20）')
assert anchor in s, 'anchor not found'
s = s.replace(anchor, anchor + new)
io.open(p, 'w', encoding='utf-8').write(s)
print('inserted OK')