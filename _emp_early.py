# -*- coding: utf-8 -*-
import pandas as pd, glob, os

base = r'G:\safety_vault\08_保险及人员管理\花名册'
cands = ['2026.7.2.xlsx', '2026.7.6.xlsx', '2026.6.23.xlsx', '2026.6.8.xlsx', '2026.5.26.xlsx', '2026.4.29.xlsx', '2026.8.4.xlsx']
targets = ['张书丽', '杜凤兰']

for fn in cands:
    p = os.path.join(base, fn)
    if not os.path.exists(p):
        print('缺失:', fn); continue
    try:
        xl = pd.ExcelFile(p)
    except Exception as e:
        print('跳过', fn, e); continue
    found_any = False
    for sh in xl.sheet_names:
        df = xl.parse(sh)
        df.columns = [str(c).strip() for c in df.columns]
        if '姓名' not in df.columns:
            continue
        hit = df[df['姓名'].astype(str).isin(targets)]
        if len(hit):
            found_any = True
            for _, r in hit.iterrows():
                dept = r.get('所属部门', '')
                pos = r.get('职位', '')
                print('%s [%s] %s -> %s %s' % (fn, sh, r['姓名'], dept, pos))
    if not found_any:
        print(fn, ': 未找到张书丽/杜凤兰')