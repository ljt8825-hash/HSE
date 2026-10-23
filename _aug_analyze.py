# -*- coding: utf-8 -*-
import pandas as pd

aug = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\aaf02454-6603-4a85-b609-69c8e48001a2_880686f9-a9bb-4654-932d-bb3fe560623f_2026.8.1-31-区域.xlsx'
roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'

md = pd.read_excel(aug, sheet_name='详细数据统计（按预设名单顺序排序）', skiprows=1)
md.columns = [str(c).strip() for c in md.columns]
md['姓名'] = md['姓名'].astype(str).str.strip()
md['检查人姓名'] = md['姓名']

rb = pd.read_excel(roster)
rb.columns = [str(c).strip() for c in rb.columns]
name2level = dict(zip(rb['姓名'].astype(str), rb['网格长等级']))

# 李中胜→李忠胜 笔误合并
md['检查人姓名'] = md['检查人姓名'].replace({'李中胜': '李忠胜'})

md['网格长等级'] = md['检查人姓名'].map(name2level)

# 三违判定：违章人姓名 非 '--' 非空
def is_viol(x):
    s = str(x).strip()
    return s not in ('', '--', 'nan', 'None', '无')

md['是否三违'] = md['违章人姓名'].apply(is_viol)

# 空姓名/无法映射
unmapped = md[md['网格长等级'].isna()]
print('总数据行:', len(md))
print('无法映射到花名册的检查人（网格长等级为空）行数:', len(unmapped))
if len(unmapped):
    print('  相关姓名:', sorted(unmapped['检查人姓名'].unique()), '-> 各自行数:',
          unmapped['检查人姓名'].value_counts().to_dict())

d = md[md['网格长等级'].notna()].copy()
print('有效记录（映射成功）:', len(d))
print('网格长等级分布（花名册权威）:')
print(d['网格长等级'].value_counts().to_dict())

# 归类
def classify(lv):
    return '公司管理' if lv in ('总网格长', '一级网格长') else lv
d['类别'] = d['网格长等级'].map(classify)

print('\n=== 台账自带 网格等级 列 分布（对照，仅供参考）===')
print(md['网格等级'].value_counts(dropna=False).to_dict())

print('\n=== 网格长等级 差异（台账 vs 花名册）===')
diff = md[md['网格等级'].notna()].copy()
diff['台账等级'] = diff['网格等级'].astype(str).str.strip()
diff['花名册等级'] = diff['检查人姓名'].map(name2level)
mismatch = diff[diff['台账等级'] != diff['花名册等级']]
print('不一致行数:', len(mismatch), '/', len(diff))

print('\n总记录=%d, 三违=%d(公司管理+二级+三级有效行内)' % (len(d), int(d['是否三违'].sum())))
print('公司管理有效行:', len(d[d['类别']=='公司管理']), ' 三违:', int(d[d['类别']=='公司管理']['是否三违'].sum()))