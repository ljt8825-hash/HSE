import pandas as pd
merged = r'G:\safety_vault\04_现场管理\三违\三位喂喂喂\新建文件夹(6)\2026年7月三违汇总（合并）.xlsx'
md = pd.read_excel(merged)
md.columns = [str(c).strip() for c in md.columns]
empty = md[md['检查人姓名'].isna() | (md['检查人姓名']=='')]
print('检查人姓名为空的行：', len(empty))
print(empty.to_string(index=False))