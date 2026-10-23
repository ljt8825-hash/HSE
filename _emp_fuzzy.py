# -*- coding: utf-8 -*-
import pandas as pd

emps = []
for f, sh in [
    (r'G:\safety_vault\08_保险及人员管理\花名册\20260730090323.xlsx', '员工信息维护'),
    (r'G:\safety_vault\08_保险及人员管理\花名册\20260721090748.xlsx', '全员'),
    (r'G:\safety_vault\02_规章制度\HSE制度、操作规程及法律\宁津项目2024制度更新\网格化管理\员工信息维护_20260625140249(1).xlsx', '员工信息维护'),
]:
    df = pd.read_excel(f, sheet_name=sh)
    df.columns = [str(c).strip() for c in df.columns]
    if '姓名' not in df.columns: continue
    emps.append(df[['姓名', '所属部门', '职位']])

allp = pd.concat(emps).drop_duplicates(subset=['姓名']).reset_index(drop=True)

# 模糊：张书丽 -> 张+书/淑 或 丽；杜凤兰 -> 杜+凤/风 或 兰
print('张姓 含"书"或"淑":')
for _, r in allp[allp['姓名'].astype(str).str.startswith('张')].iterrows():
    n = str(r['姓名'])
    if ('书' in n) or ('淑' in n) or (n.endswith('丽') and len(n) == 3):
        print('   ', n, '->', r['所属部门'], r['职位'])

print('\n杜姓 含"凤"或"风"或"兰":')
for _, r in allp[allp['姓名'].astype(str).str.startswith('杜')].iterrows():
    n = str(r['姓名'])
    if ('凤' in n) or ('风' in n) or ('兰' in n) or n.endswith('兰'):
        print('   ', n, '->', r['所属部门'], r['职位'])

print('\n邢姓 全体:')
for _, r in allp[allp['姓名'].astype(str).str.startswith('邢')].iterrows():
    print('   ', r['姓名'], '->', r['所属部门'], r['职位'])