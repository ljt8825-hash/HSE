# -*- coding: utf-8 -*-
import pandas as pd
import os

# 文件路径
base_dir = r'F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险'

print("=" * 60)
print("详细分析四个数据源文件")
print("=" * 60)

# 1. 员工信息维护（花名册）
print("\n【1. 员工信息维护】")
df_roster = pd.read_excel(os.path.join(base_dir, '员工信息维护.xlsx'), engine='openpyxl')
df_roster = df_roster.dropna(subset=['姓名'])
print(f"总记录数: {len(df_roster)}")
print(f"列名: {list(df_roster.columns)}")
print("\n示例数据（前5行）:")
print(df_roster[['姓名', '身份证号码', '性别', '年龄', '所属部门', '职位']].head(5).to_string())

# 检查身份证号码格式
print("\n身份证号码示例:")
for i, row in df_roster.head(5).iterrows():
    print(f"  {row['姓名']}: {row['身份证号码']} (长度: {len(str(row['身份证号码'])) if pd.notna(row['身份证号码']) else 'N/A'})")

# 2. 工伤险分配表
print("\n" + "=" * 60)
print("【2. 工伤险分配表】")
df_injury = pd.read_excel(os.path.join(base_dir, '工伤险分配表.xls'), engine='openpyxl', header=None)
# 找到表头行
for i, row in df_injury.iterrows():
    if '序号' in str(row.values):
        header_row = i
        break
df_injury = pd.read_excel(os.path.join(base_dir, '工伤险分配表.xls'), engine='openpyxl', header=header_row)
df_injury.columns = [str(c).strip() if pd.notna(c) else f'col_{i}' for i, c in enumerate(df_injury.columns)]
df_injury = df_injury.dropna(subset=['姓名'])
# 排除合计行等
df_injury = df_injury[df_injury['姓名'].apply(lambda x: str(x).strip() not in ['合计', '合计', 'NaN', 'nan', ''])]
print(f"总记录数: {len(df_injury)}")
print(f"列名: {list(df_injury.columns)}")
print("\n示例数据（前5行）:")
print(df_injury.head(5).to_string())

# 检查是否有身份证号列
if '身份证号' in df_injury.columns:
    print("\n工伤险表身份证号示例:")
    for i, row in df_injury.head(5).iterrows():
        print(f"  {row['姓名']}: {row.get('身份证号', 'N/A')}")

# 3. 最新雇员清单（雇主责任险）
print("\n" + "=" * 60)
print("【3. 最新雇员清单】")
df_employee = pd.read_excel(os.path.join(base_dir, '最新雇员清单.xlsx'), engine='openpyxl')
df_employee = df_employee.dropna(subset=['雇员姓名'])
print(f"总记录数: {len(df_employee)}")
print(f"列名: {list(df_employee.columns)}")
print("\n示例数据（前5行）:")
print(df_employee.head(5).to_string())

# 检查证件号码格式
print("\n雇员清单证件号码示例:")
for i, row in df_employee.head(5).iterrows():
    print(f"  {row['雇员姓名']}: {row['证件号码']} (长度: {len(str(row['证件号码'])) if pd.notna(row['证件号码']) else 'N/A'})")

# 4. 公益岗工资表
print("\n" + "=" * 60)
print("【4. 公益岗工资表】")
df_public = pd.read_excel(os.path.join(base_dir, '11月份公益岗工资表.xlsx'), engine='openpyxl', header=None)
for i, row in df_public.iterrows():
    if '姓名' in str(row.values):
        header_row = i
        break
df_public = pd.read_excel(os.path.join(base_dir, '11月份公益岗工资表.xlsx'), engine='openpyxl', header=header_row)
df_public.columns = [str(c).strip() if pd.notna(c) else f'col_{i}' for i, c in enumerate(df_public.columns)]
df_public = df_public.dropna(subset=['姓名'])
df_public = df_public[df_public['姓名'].apply(lambda x: str(x).strip() not in ['合计', '合计', 'NaN', 'nan', ''])]
print(f"总记录数: {len(df_public)}")
print(f"列名: {list(df_public.columns)}")
print("\n全部数据:")
print(df_public.to_string())

# 5. 检查生成的文件
print("\n" + "=" * 60)
print("【5. 当前生成的'人员保险.xlsx'】")
output_file = os.path.join(base_dir, '人员保险.xlsx')
if os.path.exists(output_file):
    df_result = pd.read_excel(output_file, engine='openpyxl')
    print(f"总记录数: {len(df_result)}")
    print(f"列名: {list(df_result.columns)}")
    print("\n示例数据（前5行）:")
    print(df_result.head(5).to_string())
    
    # 检查各列的数据填充情况
    print("\n各列数据填充率:")
    for col in df_result.columns:
        filled = df_result[col].notna().sum()
        empty = df_result[col].isna().sum()
        non_empty_str = df_result[col].apply(lambda x: str(x).strip() != '' and str(x).strip() != 'nan' if pd.notna(x) else False).sum()
        print(f"  {col}: 非空={filled}, 空字符串={len(df_result) - non_empty_str}, 总计={len(df_result)}")
else:
    print("文件不存在")

# 6. 名字匹配测试
print("\n" + "=" * 60)
print("【6. 名字匹配测试】")
print("\n花名册与工伤险表匹配:")
roster_names = df_roster['姓名'].tolist()
injury_names = df_injury['姓名'].tolist()
matched_injury = set(roster_names) & set(injury_names)
print(f"  花名册人数: {len(roster_names)}")
print(f"  工伤险人数: {len(injury_names)}")
print(f"  匹配成功: {len(matched_injury)}")

print("\n花名册与雇员清单匹配:")
employee_names = df_employee['雇员姓名'].tolist()
matched_employee = set(roster_names) & set(employee_names)
print(f"  花名册人数: {len(roster_names)}")
print(f"  雇员清单人数: {len(employee_names)}")
print(f"  匹配成功: {len(matched_employee)}")

print("\n花名册与公益岗匹配:")
public_names = df_public['姓名'].tolist()
matched_public = set(roster_names) & set(public_names)
print(f"  花名册人数: {len(roster_names)}")
print(f"  公益岗人数: {len(public_names)}")
print(f"  匹配成功: {len(matched_public)}")

# 7. 检查未匹配的人员
print("\n" + "=" * 60)
print("【7. 未匹配情况】")
print("\n花名册中未匹配到工伤险的人员（前10个）:")
unmatched_injury = [n for n in roster_names[:100] if n not in injury_names][:10]
print(f"  {unmatched_injury}")

print("\n花名册中未匹配到雇员清单的人员（前10个）:")
unmatched_employee = [n for n in roster_names[:100] if n not in employee_names][:10]
print(f"  {unmatched_employee}")