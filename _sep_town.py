# -*- coding: utf-8 -*-
import pandas as pd, re, os

base = r'G:\safety_vault\08_保险及人员管理\花名册'
def town(dept):
    d = str(dept).strip()
    return re.sub(r'(片区|一班|二班|三班|四班|五班|六班|七班|八班|九班|十班|三四班|六七班|一二班|二三班)$', '', d)

frames = []
for f, sheets in [(os.path.join(base, '员工信息维护_20260910140825在职版.xlsx'), ['员工信息维护']),
                  (os.path.join(base, '2026.9.1.xlsx'), ['员工信息维护'])]:
    for sh in sheets:
        try:
            df = pd.read_excel(f, sheet_name=sh)
            df.columns = [str(c).strip() for c in df.columns]
            if '姓名' in df.columns and '所属部门' in df.columns:
                frames.append(df[['姓名', '所属部门']])
        except Exception as e:
            print('skip', f, e)
emp = pd.concat(frames).dropna(subset=['姓名']).drop_duplicates(subset=['姓名'])
emp['姓名'] = emp['姓名'].astype(str).str.strip()
name2town = dict(zip(emp['姓名'], emp['所属部门'].map(town)))
print('员工花名册合并去重:', len(emp))

sep = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ecfc3203-8e99-4173-ad3b-b31ea8df7651_c7099510-7049-47a2-990e-594c19dc21f5_2026年9月三违汇总（合并）.xlsx'
roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
md = pd.read_excel(sep, sheet_name='9月三违汇总'); md.columns = [str(c).strip() for c in md.columns]
md['检查人姓名'] = md['姓名'].astype(str).str.strip().replace({'李中胜': '李忠胜'})
rb = pd.read_excel(roster); rb.columns = [str(c).strip() for c in rb.columns]
name2level = dict(zip(rb['姓名'].astype(str), rb['网格长等级']))
md['网格长等级'] = md['检查人姓名'].map(name2level)
def is_viol(x):
    s = str(x).strip(); return s not in ('', '--', 'nan', 'None', '无', '——', '—')
md['是否三违'] = md['违章人姓名'].apply(is_viol)
d = md[md['网格长等级'].notna()].copy()
gv = d[(d['网格长等级'].isin(['总网格长', '一级网格长'])) & d['是否三违']].copy()
gv['违章人原始'] = gv['违章人姓名'].astype(str).str.strip()

def clean_viol(s):
    return re.sub(r'[（(].*?[)）]', '', str(s).strip()).strip()
# 沿用8月笔误 + 9月可能的新笔误
typo_map = {'姚奎岭': '姚奎领', '李凤丽': '李风丽', '李建方': '李建芳', '范志新': '范治新',
            '李兰凤': '李兰风'}
gv['违章人'] = gv['违章人原始'].map(clean_viol).replace(typo_map)
gv['乡镇'] = gv['违章人'].map(name2town)

print('\n=== 公司管理三违 %d 起 ===' % len(gv))
for n in sorted(gv['违章人'].unique()):
    raw = gv[gv['违章人']==n]['违章人原始'].iloc[0]
    t = name2town.get(n)
    mark = '' if t else '【未匹配】'
    dep = emp[emp['姓名']==n]['所属部门'].iloc[0] if (emp['姓名']==n).any() else '?'
    print('  %s%s -> %s | 部门=%s | %d起' % (n, ('('+raw+')' if raw!=n else ''), t, dep, (gv['违章人']==n).sum()))

unmatched = sorted(gv[gv['乡镇'].isna()]['违章人'].unique())
print('\n未匹配违章人:', unmatched)
print('\n按乡镇:')
print(gv.groupby('乡镇', dropna=False).size().sort_values(ascending=False).to_string())
print('合计:', len(gv))