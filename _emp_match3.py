# -*- coding: utf-8 -*-
import pandas as pd

targets = ['张书丽', '杜凤兰', '邢万俊']

def town(dept):
    import re
    d = str(dept).strip()
    return re.sub(r'(片区|一班|二班|三班|四班|五班|六班|七班|八班|九班|十班|三四班|六七班|一二班|二三班)$', '', d)

files = [
    (r'G:\safety_vault\08_保险及人员管理\花名册\20260721090748.xlsx', '全员'),
    (r'G:\safety_vault\08_保险及人员管理\花名册\20260721090748.xlsx', 'Sheet2'),
    (r'G:\safety_vault\02_规章制度\HSE制度、操作规程及法律\宁津项目2024制度更新\网格化管理\员工信息维护_20260625140249(1).xlsx', '员工信息维护'),
]

for f, sh in files:
    try:
        df = pd.read_excel(f, sheet_name=sh)
        df.columns = [str(c).strip() for c in df.columns]
        if '姓名' not in df.columns or '所属部门' not in df.columns:
            print('  [%s/%s] 无姓名/所属部门列，跳过' % (f.split('\\')[-1], sh))
            continue
        print('\n===== %s / %s (共%d人) =====' % (f.split('\\')[-1], sh, len(df)))
        for t in targets:
            hit = df[df['姓名'].astype(str) == t]
            if len(hit):
                for _, r in hit.iterrows():
                    print('   %s -> 部门=%s 职位=%s' % (t, r['所属部门'], r.get('职位')))
            else:
                print('   %s -> 未找到' % t)
    except Exception as e:
        print('  [%s/%s] 失败: %s' % (f.split('\\')[-1], sh, e))