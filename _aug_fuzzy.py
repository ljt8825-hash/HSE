# -*- coding: utf-8 -*-
import pandas as pd, glob, os, re

base = r'G:\safety_vault\08_保险及人员管理\花名册'
files = sorted(glob.glob(os.path.join(base, '*.xlsx')))

# 建立 姓名->(部门,职位) 全集（去重，优先有部门的）
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
            key = n
            if key not in rows or (not rows[key][0] and dept):
                rows[key] = (dept, pos)

print('花名册去重人数:', len(rows))

def norm(s):
    return re.sub(r'[\s\.\'′丶,，/\\、0-9()（）]+', '', str(s))

# 模糊：同姓 + 至少两个字符相同（按字集合相似）
targets = {
    '孙艳红': '孙',
    '张宝树': '张',
    '李凤丽': '李',
    '李建方': '李',
    '范志新': '范',
}
for t, surname in targets.items():
    print('\n===== %s =====' % t)
    cands = [(n, d, p) for n, (d, p) in rows.items() if n.startswith(surname)]
    tl = [c for c in t]
    scored = []
    for n, d, p in cands:
        nl = [c for c in n]
        common = len(set(tl) & set(nl))
        scored.append((common, n, d, p))
    scored.sort(reverse=True)
    for common, n, d, p in scored[:8]:
        print('   (%d字同) %s -> %s %s' % (common, n, d, p))