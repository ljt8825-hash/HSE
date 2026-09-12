# -*- coding: utf-8 -*-
import pandas as pd
import os

base_dir = r'F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险'
output_file = os.path.join(base_dir, '人员保险_new.xlsx')

df = pd.read_excel(output_file, engine='openpyxl')

print("=" * 60)
print("验证生成的'人员保险.xlsx'数据")
print("=" * 60)

print(f"\n总记录数: {len(df)}")
print(f"列名: {list(df.columns)}")

# 检查适龄人员的雇主责任险金额
print("\n【检查适龄人员的雇主责任险金额】")
shiling = df[df['年龄分类'] == '适龄人员']
print(f"适龄人员总数: {len(shiling)}")
print(f"\n雇主责任险金额分布:")
print(shiling['雇主责任险金额'].value_counts())

# 检查超龄人员的雇主责任险金额
print("\n【检查超龄人员的雇主责任险金额】")
chaoling = df[df['年龄分类'] == '超龄人员']
print(f"超龄人员总数: {len(chaoling)}")
print(f"\n雇主责任险金额分布:")
print(chaoling['雇主责任险金额'].value_counts())

# 检查公益岗人员
print("\n【检查公益岗人员】")
gongyi = df[df['年龄分类'] == '公益岗人员']
print(f"公益岗人员总数: {len(gongyi)}")
print(f"\n雇主责任险金额分布:")
print(gongyi['雇主责任险金额'].value_counts())

# 检查合规异常情况
print("\n【检查合规异常情况】")
anomaly = df[df['合规等级'] == 'danger']
print(f"合规异常人数: {len(anomaly)}")
print(f"\n合规异常原因分布:")
print(anomaly['合规状态'].value_counts())

# 显示几个具体的案例
print("\n【适龄人员示例（应缴80万）】")
print(shiling[['姓名', '年龄', '性别', '年龄分类', '应缴保险类型', '雇主责任险金额', '合规状态']].head(10).to_string())

print("\n【超龄人员示例（应缴工伤险+10万）】")
print(chaoling[['姓名', '年龄', '性别', '年龄分类', '应缴保险类型', '工伤保险', '雇主责任险金额', '合规状态']].head(10).to_string())

print("\n【合规异常人员示例】")
print(anomaly[['姓名', '年龄', '性别', '年龄分类', '应缴保险类型', '工伤保险', '雇主责任险金额', '合规状态']].head(10).to_string())