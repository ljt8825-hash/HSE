# -*- coding: utf-8 -*-
import pandas as pd, re, os

sep = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ecfc3203-8e99-4173-ad3b-b31ea8df7651_c7099510-7049-47a2-990e-594c19dc21f5_2026年9月三违汇总（合并）.xlsx'
roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'

md = pd.read_excel(sep, sheet_name='9月三违汇总')
md.columns = [str(c).strip() for c in md.columns]
md['检查人姓名'] = md['姓名'].astype(str).str.strip().replace({'李中胜': '李忠胜'})
md['分组名称'] = md['分组名称'].astype(str).str.strip().replace({'公司管理员': '公司管理'})

rb = pd.read_excel(roster); rb.columns = [str(c).strip() for c in rb.columns]
name2level = dict(zip(rb['姓名'].astype(str), rb['网格长等级']))
md['网格长等级'] = md['检查人姓名'].map(name2level)

def is_viol(x):
    s = str(x).strip()
    return s not in ('', '--', 'nan', 'None', '无', '——', '—')
md['是否三违'] = md['违章人姓名'].apply(is_viol)

unmapped = md[md['网格长等级'].isna()]
print('总行:', len(md), ' 无法映射检查人:', len(unmapped), unmapped['检查人姓名'].unique() if len(unmapped) else '')

d = md[md['网格长等级'].notna()].copy()
print('有效:', len(d), ' 三违:', int(d['是否三违'].sum()))
print('等级分布(花名册):', dict(sorted(d['网格长等级'].value_counts().items())))
print('分组名称 归一后种类:', d['分组名称'].nunique())

# 台账 vs 花名册 差异
diff = md[md['网格等级'].notna()].copy()
diff['t'] = diff['网格等级'].astype(str).str.strip()
diff['r'] = diff['检查人姓名'].map(name2level)
print('台账网格等级 vs 花名册不一致:', int((diff['t'] != diff['r']).sum()), '/', len(diff))

def classify(lv):
    return '公司管理' if lv in ('总网格长', '一级网格长') else lv
d['类别'] = d['网格长等级'].map(classify)
print('类别分布:', dict(sorted(d['类别'].value_counts().items())))

gongsi = d[d['类别'] == '公司管理']
print('\n公司管理 = 总(%d) + 一级(%d) 行, 三违 %d' % (
    len(gongsi[gongsi['网格长等级']=='总网格长']),
    len(gongsi[gongsi['网格长等级']=='一级网格长']),
    int(gongsi['是否三违'].sum())))
print('公司管理检查人明细:')
print(gongsi.groupby(['检查人姓名','网格长等级']).size().to_string())

# 公司管理三违 违章人
gv = gongsi[gongsi['是否三违']].copy()
gv['违章人姓名'] = gv['违章人姓名'].astype(str).str.strip()
print('\n公司管理三违违章人（原始）:')
for n in sorted(gv['违章人姓名'].unique()):
    print('  %s  x%d' % (n, (gv['违章人姓名']==n).sum()))