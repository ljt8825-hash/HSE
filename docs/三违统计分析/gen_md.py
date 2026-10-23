# -*- coding: utf-8 -*-
import os, json

OUT = r'g:\hse-dashboard\docs\三违统计分析'
with open(os.path.join(OUT, '_data.json'), encoding='utf-8') as f:
    D = json.load(f)

patrol, viol, cv = D['patrol'], D['viol'], D['company_viol']
tp, tv = D['total_patrol'], D['total_viol']
MONTHS = ['7月', '8月', '9月']
TOWNSHIPS = ['杜集镇', '柴胡店镇', '保店镇', '时集镇', '长官镇', '刘营伍乡',
             '大曹镇', '张大庄镇', '大柳镇', '相衙镇', '津城街道', '宁城街道']

def sumv(data, key):
    return sum(data[m][key] for m in MONTHS)

L = []
L.append('# 2026年7–9月三违统计分析（各乡镇作业中心）')
L.append('')
L.append('> 数据来源：`2026年7/8/9月三违统计分析（按花名册）` 三份工作簿。统计口径见文末「附录」。')
L.append('')

L.append('## 口径说明')
L.append('')
L.append('- **网格长岗位**（仅限四类）：总经理、部门经理、**乡镇作业中心经理**、**管理员**。')
L.append('- **等级映射**（《网格长花名册》权威口径）：')
L.append('  - 总网格长（1人，总经理 黄殿兴）＋一级网格长（5人，部门经理） → **「公司管理」＝「公司检查」**，不按乡镇拆分巡查，仅按违章人所属乡镇统计三违。')
L.append('  - 二级网格长（17人）＝**乡镇作业中心经理**；三级网格长（45人）＝**管理员** → 二者合并为各乡镇「作业中心」自查/上报口径，按片区（乡镇）统计。')
L.append('- 因此，下表「乡镇」行均为 **作业中心经理＋管理员**（二级＋三级网格长）之和，不含公司管理。')
L.append('- 9月数据仅覆盖 2026-09-01 ~ 09-18（18 天，未满月）。')
L.append('')

# ============ 一、总计 ============
L.append('## 一、7–9月总计（各乡镇作业中心经理+管理员）')
L.append('')
L.append('| 乡镇 | 巡查数量合计（次） | 三违数量合计（起） |')
L.append('|------|------:|------:|')
for t in sorted(TOWNSHIPS, key=lambda x: -tp[x]):
    L.append(f'| {t} | {tp[t]} | {tv[t]} |')
L.append(f'| **合计** | **{sum(tp.values())}** | **{sum(tv.values())}** |')
L.append('')
L.append('![总计巡查](charts/chart_01_total_patrol.png)')
L.append('')
L.append('![总计三违](charts/chart_02_total_violation.png)')
L.append('')

# ============ 二、对比 ============
L.append('## 二、各乡镇三违数量对比（乡镇自查 vs 公司检查）')
L.append('')
L.append('| 乡镇 | 7月乡镇 | 7月公司 | 8月乡镇 | 8月公司 | 9月乡镇 | 9月公司 | 合计乡镇 | 合计公司 |')
L.append('|------|------:|------:|------:|------:|------:|------:|------:|------:|')
for t in TOWNSHIPS:
    ctot = sumv(cv, t)
    L.append(f'| {t} | {viol["7月"][t]} | {cv["7月"][t]} | {viol["8月"][t]} | {cv["8月"][t]} | {viol["9月"][t]} | {cv["9月"][t]} | {tv[t]} | {ctot} |')
c7, c8, c9 = sum(cv['7月'].values()), sum(cv['8月'].values()), sum(cv['9月'].values())
v7, v8, v9 = sum(viol['7月'].values()), sum(viol['8月'].values()), sum(viol['9月'].values())
L.append(f'| **合计** | **{v7}** | **{c7}** | **{v8}** | **{c8}** | **{v9}** | **{c9}** | **{sum(tv.values())}** | **{c7+c8+c9}** |')
L.append('')
L.append('> 注：7月公司检查三违另含「车队」1起、「未匹配」2起（非乡镇，未计入上表）；8/9月无此类项。')
L.append('')
L.append('![月度对比](charts/chart_05_compare.png)')
L.append('')

# ============ 三、每月明细 ============
L.append('## 三、各乡镇每月巡查与三违统计')
L.append('')
L.append('| 乡镇 | 7月巡查 | 7月三违 | 8月巡查 | 8月三违 | 9月巡查 | 9月三违 |')
L.append('|------|------:|------:|------:|------:|------:|------:|')
for t in TOWNSHIPS:
    L.append(f'| {t} | {patrol["7月"][t]} | {viol["7月"][t]} | {patrol["8月"][t]} | {viol["8月"][t]} | {patrol["9月"][t]} | {viol["9月"][t]} |')
p7, p8, p9 = sum(patrol['7月'].values()), sum(patrol['8月'].values()), sum(patrol['9月'].values())
L.append(f'| **合计** | **{p7}** | **{v7}** | **{p8}** | **{v8}** | **{p9}** | **{v9}** |')
L.append('')
L.append('![每月巡查](charts/chart_03_monthly_patrol.png)')
L.append('')
L.append('![每月三违](charts/chart_04_monthly_violation.png)')
L.append('')

# ============ 附录 ============
L.append('## 附录：口径与数据来源')
L.append('')
L.append('- 巡查次数 = 有效记录行数（每行一次网格长巡查/上报）；三违数量 = 「违章人姓名」非空的记录行数。')
L.append('- 7月有效巡查 1676 行、三违 609 起；8月 1725 行、三违 512 起；9月 1011 行、三违 260 起。')
L.append('- 其中乡镇作业中心（经理+管理员）巡查 1654 / 1691 / 984，公司管理巡查 22 / 34 / 27；三违乡镇 589 / 479 / 233，公司管理 20 / 33 / 27。')
L.append('- 公司检查（公司管理）三违按乡镇：违章人所属乡镇按员工花名册「所属部门」去班组后缀归属。')
L.append('- 所有数字已与对应月份工作簿「说明」页总体汇总交叉核验一致。')
L.append('')

final = '\n'.join(L)
out_path = os.path.join(OUT, '三违统计分析_2026年7-9月.md')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(final)
print('MD written:', out_path)
print(final)