# -*- coding: utf-8 -*-
import pandas as pd
import glob

merged_glob = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\*_2026年7月三违汇总（合并）.xlsx'
f = glob.glob(merged_glob)[0]
print('合并文件:', f)

md = pd.read_excel(f)
md.columns = [str(c).strip() for c in md.columns]
print('列:', list(md.columns))
print('总行数:', len(md))

roster = r'c:\Users\honey\.trae-cn\attachments\6ab1177e5da3fb036f33ca96\ee67cd70-7f61-4017-879d-55c7d4008c7d_041a59d9-59c8-43fc-8874-6074005fa362_网格长花名册.xlsx'
rb = pd.read_excel(roster)
rb.columns = [str(c).strip() for c in rb.columns]
name2level = dict(zip(rb['姓名'], rb['网格长等级']))

md['lv'] = md['检查人姓名'].map(name2level)
gongsi = md[md['lv'].isin(['总网格长', '一级网格长'])].copy()
print('\n公司管理（总+一级）记录数:', len(gongsi))
print('其中三违(违章人姓名非空):', gongsi['违章人姓名'].notna().sum())

# dump 三违明细全部字段
gv = gongsi[gongsi['违章人姓名'].notna()]
print('\n=== 公司管理三违记录（全部字段）===')
for _, r in gv.iterrows():
    print({c: r[c] for c in md.columns if pd.notna(r[c])})
    print('---')