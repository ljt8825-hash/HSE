# -*- coding: utf-8 -*-
import pandas as pd
import os

base_dir = r'F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险'

# 1. 分析2026.4五险一金
print("=" * 60)
print("【2026.4五险一金】")
df = pd.read_excel(os.path.join(base_dir, '2026.4五险一金.xlsx'), engine='openpyxl')
print(f"总记录数: {len(df)}")
print(f"列名: {list(df.columns)}")
print(df.head(5).to_string())

# 检查是否有姓名列
for col in df.columns:
    if '姓名' in str(col) or '名' == str(col):
        print(f"\n姓名列: {col}")
        print(f"姓名示例: {df[col].head(5).tolist()}")

# 2. 检查花名册和员工信息维护是否相同
print("\n" + "=" * 60)
print("【对比花名册和员工信息维护】")
df_hm = pd.read_excel(os.path.join(base_dir, '花名册.xlsx'), engine='openpyxl')
df_yg = pd.read_excel(os.path.join(base_dir, '员工信息维护.xlsx'), engine='openpyxl')
print(f"花名册记录数: {len(df_hm)}, 列名: {list(df_hm.columns)}")
print(f"员工信息维护记录数: {len(df_yg)}, 列名: {list(df_yg.columns)}")
if '姓名' in df_hm.columns and '姓名' in df_yg.columns:
    hm_names = set(df_hm['姓名'].dropna().tolist())
    yg_names = set(df_yg['姓名'].dropna().tolist())
    print(f"花名册人数: {len(hm_names)}, 员工信息维护人数: {len(yg_names)}")
    print(f"仅在花名册: {len(hm_names - yg_names)}, 仅在员工信息维护: {len(yg_names - hm_names)}")