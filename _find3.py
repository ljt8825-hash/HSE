# -*- coding: utf-8 -*-
import pandas as pd, glob, os

targets = ['张书丽', '杜凤兰', '邢万俊']
base = r'G:\safety_vault\08_保险及人员管理\花名册'
files = glob.glob(os.path.join(base, '*.xlsx'))

for f in sorted(files):
    try:
        xl = pd.ExcelFile(f)
    except Exception:
        continue
    for sh in xl.sheet_names:
        df = xl.parse(sh)
        df.columns = [str(c).strip() for c in df.columns]
        if '姓名' not in df.columns:
            continue
        hit = df[df['姓名'].astype(str).isin(targets)]
        if len(hit):
            for _, r in hit.iterrows():
                dept = r.get('所属部门', '')
                pos = r.get('职位', '')
                print('%s [%s] %s -> 部门=%s 职位=%s' % (os.path.basename(f), sh, r['姓名'], dept, pos))