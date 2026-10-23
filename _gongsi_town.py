# -*- coding: utf-8 -*-
import pandas as pd
import re, glob

# 1. 员工花名册（7月30日快照，列最全）
emp = pd.read_excel(r'G:\safety_vault\08_保险及人员管理\花名册\20260730090323.xlsx', sheet_name='员工信息维护')
emp.columns = [str(c).strip() for c in emp.columns]
print('员工花名册 行数:', len(emp), ' 列:', list(emp.columns))

def town(dept):
    d = str(dept).strip()
    d2 = re.sub(r'(片区|一班|二班|三班|四班|五班|六班|七班|八班|九班|十班|三四班|六七班|一二班|二三班)$', '', d)
    return d2

emp['乡镇'] = emp['所属部门'].map(town)
name2town = dict(zip(emp['姓名'].astype(str), emp['乡镇']))

# 2. 合并文件（附件副本）
f = glob.glob(r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\*_2026年7月三违汇总（合并）.xlsx')[0]
md = pd.read_excel(f)
md.columns = [str(c).strip() for c in md.columns]

# 3. 公司管理三违
roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
rb = pd.read_excel(roster); rb.columns = [str(c).strip() for c in rb.columns]
name2level = dict(zip(rb['姓名'], rb['网格长等级']))

md['lv'] = md['检查人姓名'].map(name2level)
gv = md[(md['lv'].isin(['总网格长','一级网格长'])) & md['违章人姓名'].notna()].copy()
gv['违章人姓名'] = gv['违章人姓名'].astype(str).str.strip()
gv['乡镇'] = gv['违章人姓名'].map(name2town)

print('\n公司管理三违记录数:', len(gv))
print('违章人去重名单及匹配乡镇:')
for n in sorted(gv['违章人姓名'].unique()):
    print('   %s -> %s' % (n, name2town.get(n, '【未匹配】')))

print('\n未匹配乡镇的违章人:', sorted([n for n in gv['违章人姓名'].unique() if n not in name2town]))
print('\n按乡镇统计（罚款条数）:')
print(gv.groupby('乡镇').size().to_string())

# 员工花名册 所属部门 前若干种类（判断乡镇取值）
print('\n员工花名册 所属部门 样例:', sorted(emp['所属部门'].dropna().astype(str).unique())[:40])