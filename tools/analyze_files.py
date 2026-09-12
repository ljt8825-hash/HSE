# -*- coding: utf-8 -*-
import pandas as pd
import os

# 使用原始目录中的文件
base_dir = r'F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险'
files = {
    '员工信息维护': os.path.join(base_dir, '员工信息维护_20260625140249(3).xlsx'),
    '工伤险分配表': os.path.join(base_dir, '工伤险分配表.xls'),
    '最新雇员清单': os.path.join(base_dir, '最新雇员清单.xlsx'),
    '公益岗工资表': os.path.join(base_dir, '11月份公益岗工资表.xlsx')
}

for name, path in files.items():
    print(f'\n===== {name} =====')
    print(f'文件: {os.path.basename(path)}')
    try:
        # 尝试用openpyxl读取所有文件
        df = pd.read_excel(path, engine='openpyxl')
        print(f'列名: {list(df.columns)}')
        print(f'行数: {len(df)}')
        if name == '公益岗工资表':
            print(df.to_string())
        else:
            print(df.head(3).to_string())
    except Exception as e:
        print(f'读取错误: {e}')