# -*- coding: utf-8 -*-
import pandas as pd
import re, glob

# 1. 员工花名册（7月30日快照）
emp = pd.read_excel(r'G:\safety_vault\08_保险及人员管理\花名册\20260730090323.xlsx', sheet_name='员工信息维护')
emp.columns = [str(c).strip() for c in emp.columns]

def town(dept):
    d = str(dept).strip()
    d2 = re.sub(r'(片区|一班|二班|三班|四班|五班|六班|七班|八班|九班|十班|三四班|六七班|一二班|二三班)$', '', d)
    return d2

emp['乡镇'] = emp['所属部门'].map(town)
name2town = dict(zip(emp['姓名'].astype(str), emp['乡镇']))

# 2. 合并文件（本地恢复版）
md = pd.read_excel(r'G:\safety_vault\04_现场管理\三违\三位喂喂喂\新建文件夹(6)\2026年7月三违汇总（合并）.xlsx')
md.columns = [str(c).strip() for c in md.columns]

# 3. 花名册
roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
rb = pd.read_excel(roster); rb.columns = [str(c).strip() for c in rb.columns]
name2level = dict(zip(rb['姓名'], rb['网格长等级']))

md['lv'] = md['检查人姓名'].map(name2level)
gv = md[(md['lv'].isin(['总网格长', '一级网格长'])) & md['违章人姓名'].notna()].copy()
gv['违章人姓名'] = gv['违章人姓名'].astype(str).str.strip()
gv['乡镇'] = gv['违章人姓名'].map(name2town)

print('公司管理三违记录数:', len(gv))
print('\n=== 违章人明细 ===')
for n in sorted(gv['违章人姓名'].unique()):
    cnt = (gv['违章人姓名'] == n).sum()
    t = name2town.get(n, '【未匹配】')
    # 找原始所属部门
    dep = emp[emp['姓名'].astype(str) == n]['所属部门'].iloc[0] if (emp['姓名'].astype(str) == n).any() else '？'
    print('  %s -> %s | 原始部门=%s | 条数=%d' % (n, t, dep, cnt))

print('\n=== 按乡镇统计 ===')
s = gv.groupby('乡镇').size()
for k, v in s.items():
    print('  %s: %d' % (k, v))
print('合计:', s.sum())