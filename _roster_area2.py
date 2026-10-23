import pandas as pd

roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
merged = r'G:\safety_vault\04_现场管理\三违\三位喂喂喂\新建文件夹(6)\2026年7月三违汇总（合并）.xlsx'

rb = pd.read_excel(roster)
rb.columns = [str(c).strip() for c in rb.columns]
md = pd.read_excel(merged)
md.columns = [str(c).strip() for c in md.columns]

# 乡镇提取：从 所属部门 去掉 “片区/班/一班~十班” 后缀
import re
def town(dept):
    d = str(dept)
    d2 = re.sub(r'(片区|一班|二班|三班|四班|五班|六班|七班|八班|九班|十班|三四班|六七班)$', '', d)
    return d2

name2level = dict(zip(rb['姓名'], rb['网格长等级']))
name2dept  = dict(zip(rb['姓名'], rb['所属部门']))
name2town  = {k: town(v) for k, v in name2dept.items()}

# 修正 李中胜 -> 李忠胜
md['检查人姓名_修正'] = md['检查人姓名'].replace({'李中胜': '李忠胜'})

md['_level'] = md['检查人姓名_修正'].map(name2level)
md['_town']  = md['检查人姓名_修正'].map(name2town)

print('=== 检查人姓名_修正 无法匹配花名册的（应为空）===')
unmatched = md[md['_level'].isna()]['检查人姓名_修正'].unique()
print(unmatched, '数量:', len(unmatched))

print('\n=== 片区/班组 vs 花名册乡镇 不一致的行（检查人所在科室 vs 实际片区）===')
mismatch = md[md['_town'].notna() & md['片区/班组'].notna() & (md['_town'] != md['片区/班组'])]
print('不一致行数:', len(mismatch))
if len(mismatch):
    print(mismatch[['检查人姓名','检查人姓名_修正','片区/班组','_town','_level']].drop_duplicates().to_string(index=False))

print('\n=== 片区/班组 为 NaN 的行 ===')
print(md[md['片区/班组'].isna()][['检查人姓名','检查人姓名_修正','网格等级','_level','_town','来源文件']].to_string(index=False))

print('\n=== 检查人姓名 为空 的行数 ===', (md['检查人姓名'].isna() | (md['检查人姓名']=='')).sum())
print('\n=== 违章人姓名 非空 的行数 ===', md['违章人姓名'].notna().sum())

print('\n=== 片区/班组 计数（含 NaN 行归属）===')
print(md['片区/班组'].value_counts(dropna=False).to_string())