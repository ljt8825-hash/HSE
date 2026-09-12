# -*- coding: utf-8 -*-
import pandas as pd
import os

base_dir = r'F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险'
output_file = os.path.join(base_dir, '人员保险.xlsx')

df = pd.read_excel(output_file, engine='openpyxl')

print("=" * 60)
print("最终验证：人员保险.xlsx")
print("=" * 60)

print(f"\n总记录数: {len(df)}")
print(f"列名: {list(df.columns)}")

# 统计信息
print("\n【年龄分类统计】")
print(df['年龄分类'].value_counts())

print("\n【保险缴纳统计】")
print(f"已缴纳工伤保险: {len(df[df['工伤保险'] == '是'])} 人")
print(f"已缴纳雇主责任险: {len(df[df['雇主责任险'] == '是'])} 人")

print("\n【合规状态统计】")
print(df['合规等级'].value_counts())

print("\n【合规异常原因】")
anomaly = df[df['合规等级'] == 'danger']
print(anomaly['合规状态'].value_counts())

print("\n【公益岗人员】")
gongyi = df[df['是否公益岗'] == '是']
print(gongyi[['姓名', '年龄', '性别', '雇主责任险金额']].to_string())

print("\n验证完成！")