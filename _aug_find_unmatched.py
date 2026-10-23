# -*- coding: utf-8 -*-
import pandas as pd, glob, os, re

# 公司管理三违 8 起未匹配的违章人（含原始写法）
targets = ['姚奎岭', '孙艳红', '张宝树', '李凤丽', '李建方', '范志新', '袁书霞']

base = r'G:\safety_vault\08_保险及人员管理\花名册'
files = sorted(glob.glob(os.path.join(base, '*.xlsx')))

def clean(s):
    s = str(s).strip()
    s = re.sub(r'[（(].*?[)）]', '', s)  # 去括号备注
    s = re.sub(r'[\s\.\'′丶,，/\\、0-9]+', '', s)  # 去标点/数字/分隔
    return s

for t in targets:
    print('\n===== 目标:', t, ' =====')
    tc = clean(t)
    found = 0
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
            names = df['姓名'].astype(str).str.strip()
            hit = names[names.map(clean) == tc]
            if len(hit):
                for _, r in df[names.map(clean) == tc].iterrows():
                    found += 1
                    if '所属部门' in df.columns:
                        print('  %s [%s] %s -> 部门=%s 职位=%s' % (os.path.basename(f), sh, r['姓名'], r.get('所属部门'), r.get('职位')))
                    else:
                        print('  %s [%s] %s (无部门列)' % (os.path.basename(f), sh, r['姓名']))
                    break
    if not found:
        print('  （所有花名册均未命中）')