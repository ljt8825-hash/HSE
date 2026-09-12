# -*- coding: utf-8 -*-
import pandas as pd
import os

base_dir = r'F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险'

# 查看五险一金的全部内容
df = pd.read_excel(os.path.join(base_dir, '2026.4五险一金.xlsx'), engine='openpyxl', header=None)
print("【2026.4五险一金 全部内容】")
print(df.to_string())

# 检查所有sheet
print("\n\n【检查所有Sheet】")
xl = pd.ExcelFile(os.path.join(base_dir, '2026.4五险一金.xlsx'), engine='openpyxl')
print(f"Sheet名: {xl.sheet_names}")
for sheet in xl.sheet_names:
    df = pd.read_excel(os.path.join(base_dir, '2026.4五险一金.xlsx'), engine='openpyxl', sheet_name=sheet, header=None)
    print(f"\nSheet: {sheet}, 行数: {len(df)}")
    if len(df) > 20:
        # 查找姓名列
        for i, row in df.iterrows():
            vals = [str(v) for v in row.values if pd.notna(v)]
            if any('姓名' in v or '人员' in v for v in vals):
                print(f"  第{i}行可能含表头: {vals[:8]}")
    print(df.head(15).to_string())