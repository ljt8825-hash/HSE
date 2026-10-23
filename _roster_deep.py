# -*- coding: utf-8 -*-
import pandas as pd

roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
data = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\59495499-c858-45fd-86f0-a1eda81750a2_e451bd0c-4f00-405d-ad41-14c545831138_2026年7月三违汇总（合并）.xlsx'

r = pd.read_excel(roster)
r.columns=[str(c).strip() for c in r.columns]
for c in ['姓名','网格长等级','所属部门','职位','直接上级']:
    r[c]=r[c].fillna('').astype(str).str.strip()

print('=== 花名册 所属部门 分布 ===')
print(r['所属部门'].value_counts().to_string())
print('\n=== 花名册 职位 分布 ===')
print(r['职位'].value_counts().to_string())

d = pd.read_excel(data)
for c in ['检查人姓名','网格等级']:
    d[c]=d[c].fillna('').astype(str).str.strip()

name2level = dict(zip(r['姓名'], r['网格长等级']))
name2dept = dict(zip(r['姓名'], r['所属部门']))

# 三违表里 李中胜 的详情
print('\n=== 李中胜 详情 ===')
lm = d[d['检查人姓名']=='李中胜']
print('行数:', len(lm))
print(lm[['日期','片区/班组','网格等级','三违行为','来源文件']].to_string(index=False))

# 等级一致性：三违表原始 网格等级 vs 花名册权威等级
d['_roster_level'] = d['检查人姓名'].map(name2level)
d['_mismatch'] = (d['网格等级']!='') & (d['_roster_level']!='') & (d['网格等级']!=d['_roster_level'])
print('\n三违表 网格等级 与 花名册 不一致的行数:', int(d['_mismatch'].sum()))
if d['_mismatch'].sum():
    mm = d[d['_mismatch']][['检查人姓名','网格等级','_roster_level']].drop_duplicates()
    print(mm.to_string(index=False))

# 空格等级的来源归属（查到姓名后按花名册补）
empty = d[d['网格等级']=='']
print('\n网格等级为空的', len(empty), '行，按检查人姓名去重后：')
print(empty['检查人姓名'].value_counts().to_string())

# 7/27 文件是否就是空等级来源
print('\n空等级行的来源文件分布:')
print(empty['来源文件'].value_counts().to_string())