# -*- coding: utf-8 -*-
import pandas as pd

files = [
    r'G:\safety_vault\08_保险及人员管理\花名册\员工信息维护_20260721090748.xlsx',
    r'G:\safety_vault\08_保险及人员管理\花名册\员工信息维护_20260730090323.xlsx',
    r'G:\safety_vault\02_规章制度\HSE制度、操作规程及法律\宁津项目2024制度更新\网格化管理\员工信息维护_20260625140249(1).xlsx',
]
for f in files:
    print('\n===== 文件:', f.split('\\')[-1], '=====')
    try:
        xl = pd.ExcelFile(f)
        print('sheets:', xl.sheet_names)
        for sh in xl.sheet_names:
            df = xl.parse(sh, nrows=3)
            print('  [%s] 列:' % sh, list(df.columns), ' 前2行样例:')
            print(df.head(2).to_string(index=False))
    except Exception as e:
        print('  读取失败:', e)