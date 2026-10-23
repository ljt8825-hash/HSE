# -*- coding: utf-8 -*-
import pandas as pd

F9 = r'c:\Users\honey\.trae-cn\attachments\6ab1469f5da3fb036f33cd58\578505b2-9cce-47e3-bed4-e7b61710a382_f22fefb3-7f4b-4ed6-9c94-1c0f87ffef0e_9月网格长巡查及三违统计_按主表纠错.xlsx'
F8 = r'c:\Users\honey\.trae-cn\attachments\6ab1469f5da3fb036f33cd58\733d1b09-ce58-43b4-81fa-117f1498433c_06198459-2f81-4916-a80e-2639a19e5783_8月网格长巡查及三违统计_按主表纠错.xlsx'

TOWNS = ['杜集镇', '柴胡店镇', '长官镇', '保店镇', '刘营伍乡', '张大庄镇',
         '大柳镇', '大曹镇', '相衙镇', '时集镇', '津城街道', '宁城街道']

# 网格长基准表 -> 乡镇作业中心经理名单及乡镇
base = pd.read_excel(F9, sheet_name='网格长基准表')
mgr = base[base['职位'] == '乡镇作业中心经理'].copy()
mgr['乡镇'] = mgr['所属部门'].str.replace('片区', '', regex=False)
managers = mgr[['姓名', '乡镇']].set_index('姓名')['乡镇'].to_dict()
print('=== 乡镇作业中心经理 (%d 人) ===' % len(managers))
for n, t in managers.items():
    print(n, '->', t)

def norm_town(v):
    v = str(v).strip()
    return '公司管理' if v in ('公司管理', '公司管理员') else v

def read_town(sheet, f, col):
    df = pd.read_excel(f, sheet_name=sheet)
    d = {}
    for _, r in df.iterrows():
        t = norm_town(r[col])
        d[t] = int(r['巡查记录数'] if '巡查' in sheet else r['三违记录数'])
    return d

# 巡查/三违 按乡镇
for month, f in [('8月', F8), ('9月', F9)]:
    xc = read_town('网格长巡查_按乡镇', f, '乡镇' if month == '8月' else '乡镇/片区')
    sw = read_town('三违_按乡镇', f, '乡镇' if month == '8月' else '乡镇/片区')
    print('\n=== %s 按乡镇 巡查/三违 ===' % month)
    for t in TOWNS:
        print('%-5s 巡查=%s 三违=%s' % (t, xc.get(t, 0), sw.get(t, 0)))
    print('公司管理: 巡查=%s 三违=%s' % (xc.get('公司管理', 0), sw.get('公司管理', 0)))

# 按人员/按网格长 -> 经理明细
def read_by_person(sheet, f):
    df = pd.read_excel(f, sheet_name=sheet)
    col = '巡查记录数' if '巡查' in sheet else '三违记录数'
    return dict(zip(df['姓名'].astype(str), df[col].astype(int)))

for month, f in [('8月', F8), ('9月', F9)]:
    xc = read_by_person('网格长巡查_按人员', f)
    sw = read_by_person('三违_按网格长', f)
    print('\n=== %s 经理明细 (巡查/三违) ===' % month)
    for n in managers:
        print('%s 巡查=%s 三违=%s' % (n, xc.get(n, 0), sw.get(n, 0)))