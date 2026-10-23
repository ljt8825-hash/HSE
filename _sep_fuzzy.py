# -*- coding: utf-8 -*-
import pandas as pd, glob, os, re
base = r'G:\safety_vault\08_保险及人员管理\花名册'
files = sorted(glob.glob(os.path.join(base, '*.xlsx')))
rows = {}
for f in files:
    try:
        xl = pd.ExcelFile(f)
    except Exception:
        continue
    for sh in xl.sheet_names:
        df = xl.parse(sh)
        df.columns = [str(c).strip() for c in df.columns]
        if '姓名' not in df.columns:
            continue
        for _, r in df.iterrows():
            n = str(r['姓名']).strip()
            if not n or n == 'nan':
                continue
            dept = str(r.get('所属部门', '')).strip() if '所属部门' in df.columns else ''
            pos = str(r.get('职位', '')).strip() if '职位' in df.columns else ''
            if n not in rows or (not rows[n][0] and dept):
                rows[n] = (dept, pos)
print('花名册去重人数:', len(rows))

t = '杜瑞兰'
print('精确匹配:', '有' if t in rows else '无')
surname = '杜'
cands = [(n, d, p) for n, (d, p) in rows.items() if n.startswith(surname)]
tl = list(t)
scored = sorted([(len(set(tl) & set(list(n))), n, d, p) for n, d, p in cands], reverse=True)
print('杜姓模糊候选（按同字数）:')
for common, n, d, p in scored[:15]:
    print('   (%d字同) %s -> %s %s' % (common, n, d, p))