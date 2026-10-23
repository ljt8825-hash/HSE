# -*- coding: utf-8 -*-
import pandas as pd

roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
data = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\59495499-c858-45fd-86f0-a1eda81750a2_e451bd0c-4f00-405d-ad41-14c545831138_2026年7月三违汇总（合并）.xlsx'

r = pd.read_excel(roster)
r.columns = [str(c).strip() for c in r.columns]
r['姓名'] = r['姓名'].fillna('').astype(str).str.strip()
r['网格长等级'] = r['网格长等级'].fillna('').astype(str).str.strip()
print('花名册行数:', len(r), ' 列:', list(r.columns))
print('花名册 网格长等级 分布:', r['网格长等级'].value_counts().to_dict())
print('花名册 去重姓名数:', r['姓名'].nunique(), ' 总行数:', len(r))
# 花名册里是否有重名
dup = r[r.duplicated('姓名', keep=False)]
print('花名册重名字段行数:', len(dup))
if len(dup):
    print(dup[['姓名','网格长等级','所属部门']].to_string(index=False))

d = pd.read_excel(data)
d['检查人姓名'] = d['检查人姓名'].fillna('').astype(str).str.strip()

roster_names = set(r['姓名'])
data_names = set(d['检查人姓名']) - {''}
print('\n三违表 检查人姓名 去重数:', len(data_names))
print('三违表中 不在花名册 的姓名:')
missing = sorted(data_names - roster_names)
for n in missing:
    print('   ', repr(n))
print('花名册中 未在三违表出现 的姓名:')
absent = sorted(roster_names - data_names)
for n in absent:
    print('   ', repr(n))

# 名称模糊匹配（三违表 vs 花名册）找疑似同人不同写法
def norm(s):
    return s.replace(' ', '').replace('　','')
for n in missing:
    cands = [x for x in roster_names if norm(x) in norm(n) or norm(n) in norm(x)]
    if cands:
        print(f'  疑似匹配 {n!r} -> {cands}')