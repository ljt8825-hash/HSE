import openpyxl, pandas as pd

roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
merged = r'G:\safety_vault\04_现场管理\三违\三位喂喂喂\新建文件夹(6)\2026年7月三违汇总（合并）.xlsx'

rb = pd.read_excel(roster, sheet_name='Sheet1')
rb.columns = [str(c).strip() for c in rb.columns]
print('=== 花名册 列名 ===')
print(list(rb.columns))
print('=== 花名册 姓名+所属部门+网格长等级 (全部68行) ===')
print(rb[['姓名','所属部门','网格长等级']].to_string(index=False))

md = pd.read_excel(merged)
md.columns = [str(c).strip() for c in md.columns]
print('\n=== 合并表 列名 ===')
print(list(md.columns))
print('\n=== 合并表 行数 ===', len(md))
print('\n=== 片区/班组 去重值及计数 ===')
print(md['片区/班组'].value_counts(dropna=False).to_string())
print('\n=== 片区/班组 唯一值数量 ===', md['片区/班组'].nunique())