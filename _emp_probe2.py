# -*- coding: utf-8 -*-
import pandas as pd

files = [
    r'G:\safety_vault\08_保险及人员管理\花名册\20260721090748.xlsx',
    r'G:\safety_vault\08_保险及人员管理\花名册\20260730090323.xlsx',
]
for f in files:
    print('\n===== 文件:', f.split('\\')[-1], '=====')
    try:
        xl = pd.ExcelFile(f)
        print('sheets:', xl.sheet_names)
        for sh in xl.sheet_names:
            df = xl.parse(sh, nrows=3)
            print('  [%s] 列:' % sh, list(df.columns))
            print(df.head(2).to_string(index=False))
    except Exception as e:
        print('  失败:', e)