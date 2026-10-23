# -*- coding: utf-8 -*-
import pandas as pd, re, glob, os

base = r'G:\safety_vault\08_保险及人员管理\花名册'

def town(dept):
    d = str(dept).strip()
    d2 = re.sub(r'(片区|一班|二班|三班|四班|五班|六班|七班|八班|九班|十班|三四班|六七班|一二班|二三班)$', '', d)
    return d2

# 8月花名册来源（优先靠后的快照，覆盖全8月）
sources = [
    (os.path.join(base, '2026.8.31.xlsx'), ['9.1在岗', '8.31']),
    (os.path.join(base, '2026.8.4.xlsx'), ['员工信息维护']),
]
frames = []
for f, sheets in sources:
    for sh in sheets:
        try:
            df = pd.read_excel(f, sheet_name=sh)
            df.columns = [str(c).strip() for c in df.columns]
            if '姓名' in df.columns and '所属部门' in df.columns:
                frames.append(df[['姓名', '所属部门']].assign(src='%s/%s' % (os.path.basename(f), sh)))
        except Exception as e:
            print('跳过', f, sh, e)

emp = pd.concat(frames).dropna(subset=['姓名']).drop_duplicates(subset=['姓名'], keep='first')
emp['姓名'] = emp['姓名'].astype(str).str.strip()
emp['乡镇'] = emp['所属部门'].map(town)
name2town = dict(zip(emp['姓名'], emp['乡镇']))
print('合并后员工数:', len(emp), ' 姓名→乡镇映射数:', len(name2town))

# August 违章人
aug = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\aaf02454-6603-4a85-b609-69c8e48001a2_880686f9-a9bb-4654-932d-bb3fe560623f_2026.8.1-31-区域.xlsx'
md = pd.read_excel(aug, sheet_name='详细数据统计（按预设名单顺序排序）', skiprows=1)
md.columns = [str(c).strip() for c in md.columns]
md['姓名'] = md['姓名'].astype(str).str.strip()
md['检查人姓名'] = md['姓名'].replace({'李中胜': '李忠胜'})

roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
rb = pd.read_excel(roster); rb.columns = [str(c).strip() for c in rb.columns]
name2level = dict(zip(rb['姓名'].astype(str), rb['网格长等级']))

def is_viol(x):
    s = str(x).strip()
    return s not in ('', '--', 'nan', 'None', '无')

md['是否三违'] = md['违章人姓名'].apply(is_viol)
md['网格长等级'] = md['检查人姓名'].map(name2level)
d = md[md['网格长等级'].notna()].copy()

# 全部违章人（所有等级）→ 乡镇，看整体匹配
allv = d[d['是否三违']].copy()
allv['违章人姓名'] = allv['违章人姓名'].astype(str).str.strip()
allv['乡镇'] = allv['违章人姓名'].map(name2town)
print('\n=== 全部512起三违 违章人→乡镇 匹配情况 ===')
unmatched_all = sorted([n for n in allv['违章人姓名'].unique() if n not in name2town])
print('未匹配违章人:', unmatched_all)
print('未匹配记录数:', int(allv['乡镇'].isna().sum()))

# 公司管理三违
gv = allv[allv['网格长等级'].isin(['总网格长', '一级网格长'])]
print('\n=== 公司管理三违 %d 起 ===' % len(gv))
for n in sorted(gv['违章人姓名'].unique()):
    t = name2town.get(n, '【未匹配】')
    dep = emp[emp['姓名'] == n]['所属部门'].iloc[0] if (emp['姓名'] == n).any() else '?'
    print('  %s -> %s | 原始部门=%s | 条数=%d' % (n, t, dep, (gv['违章人姓名'] == n).sum()))
print('\n按乡镇:')
print(gv.groupby('乡镇', dropna=False).size().to_string())
print('合计:', len(gv))