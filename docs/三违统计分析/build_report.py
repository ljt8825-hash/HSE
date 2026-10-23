# -*- coding: utf-8 -*-
import os, json
import openpyxl
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager

# 中文字体
for f in ['Microsoft YaHei', 'SimHei']:
    if any(x.name == f for x in font_manager.fontManager.ttflist):
        plt.rcParams['font.sans-serif'] = [f]
        break
plt.rcParams['axes.unicode_minus'] = False

BASE = r'c:\Users\honey\.trae-cn\attachments\6ab1430e5da3fb036f33cd1f'
OUT = r'g:\hse-dashboard\docs\三违统计分析'
CHART_DIR = os.path.join(OUT, 'charts')
os.makedirs(CHART_DIR, exist_ok=True)

MONTHS = ['7月', '8月', '9月']
FILES = {
    '7月': 'b8c25bd9-d77a-4f30-9263-a0e1d6b88ae0_188c5320-d492-4090-8976-8a0e659b9a72_2026年7月三违统计分析（按花名册）.xlsx',
    '8月': '6a2abd77-4d53-486d-8a39-578f62757978_26b85181-4109-4f63-886e-9c5093067557_2026年8月三违统计分析（按花名册）.xlsx',
    '9月': 'e878d815-9d59-4cbd-ae83-cc9eb60a4434_89c74a1f-83f0-4c84-8bf6-520ee186c8ac_2026年9月三违统计分析（按花名册）.xlsx',
}

TOWNSHIPS = ['杜集镇', '柴胡店镇', '保店镇', '时集镇', '长官镇', '刘营伍乡',
             '大曹镇', '张大庄镇', '大柳镇', '相衙镇', '津城街道', '宁城街道']

def load_sheet(month, sheet_name):
    wb = openpyxl.load_workbook(os.path.join(BASE, FILES[month]), data_only=True)
    ws = wb[sheet_name]
    rows = [r for r in ws.iter_rows(values_only=True)]
    return rows

def parse_kv(rows, value_idx, skip_kw=()):
    """把(乡镇,值)行解析成 dict；跳过标题行和含 skip 关键字的行。"""
    d = {}
    for r in rows:
        if len(r) < value_idx + 1:
            continue
        name, val = r[1] if value_idx >= 1 else r[0], r[value_idx]
        if not isinstance(name, str):
            continue
        name = name.strip()
        if not name or name.startswith('片区') or name.startswith('排名') \
           or name.startswith('网格长') or name.startswith('乡镇') and name == '乡镇' \
           or name.startswith('口径') or name.startswith('公司管理'):
            continue
        if any(k in name for k in skip_kw):
            continue
        if val is None:
            continue
        # 数值转换
        try:
            v = int(val)
        except (TypeError, ValueError):
            continue
        d[name] = v
    return d

# 解析三张关键表
patrol = {}      # 网格巡查数量（乡镇作业中心经理+管理员 = 片区，不含公司管理）
viol   = {}      # 乡镇三违数量（同上）
company_viol = {}  # 公司检查三违按乡镇（公司管理）
company_extra = {}

for m in MONTHS:
    # sheet 1: 片区巡查次数（列：排名,片区/班组,巡查次数 value_idx=2）
    p = parse_kv(load_sheet(m, '1-片区巡查次数'), 2)
    # sheet 3: 片区三违数量（列：排名,片区/班组,三违数量 value_idx=2）
    v = parse_kv(load_sheet(m, '3-片区三违数量'), 2)
    # sheet 5: 公司管理三违按乡镇（列：乡镇,三违数量 value_idx=1；7月有备注列）
    cv_rows = load_sheet(m, '5-公司管理三违按乡镇')
    cv = {}
    extra = {}
    for r in cv_rows:
        if len(r) < 2:
            continue
        name, val = r[0], r[1]
        if not isinstance(name, str):
            continue
        name = name.strip()
        if not name or name in ('乡镇',) or name.startswith('公司管理') or name.startswith('口径'):
            continue
        if name == '合计':
            continue
        if name in ('车队', '未匹配'):
            # 记录非乡镇项
            try:
                extra[name] = int(val)
            except (TypeError, ValueError):
                pass
            continue
        try:
            cv[name] = int(val)
        except (TypeError, ValueError):
            continue
    patrol[m] = p
    viol[m] = v
    company_viol[m] = cv
    company_extra[m] = extra

# 补齐缺失乡镇为 0
for m in MONTHS:
    for t in TOWNSHIPS:
        patrol[m].setdefault(t, 0)
        viol[m].setdefault(t, 0)
        company_viol[m].setdefault(t, 0)

# 校验：各月片区巡查总和
for m in MONTHS:
    sp = sum(patrol[m].values())
    sv = sum(viol[m].values())
    sc = sum(company_viol[m].values()) + sum(company_extra[m].values())
    print(f"{m}: 乡镇巡查合计={sp}, 乡镇三违合计={sv}, 公司检查三违合计={sc}")

# 总计表（7+8+9）
total_patrol = {t: sum(patrol[m][t] for m in MONTHS) for t in TOWNSHIPS}
total_viol   = {t: sum(viol[m][t] for m in MONTHS) for t in TOWNSHIPS}

# 保存中间结果供核对
data = {
    'patrol': patrol, 'viol': viol, 'company_viol': company_viol,
    'company_extra': company_extra, 'total_patrol': total_patrol, 'total_viol': total_viol,
}
with open(os.path.join(OUT, '_data.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# ============ 生成柱状图 ============
COLORS = {'7月': '#5B8FF9', '8月': '#5AD8A6', '9月': '#F6BD16'}

def style_ax(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.grid(axis='y', color='#E5E6EB', linewidth=0.8)
    ax.set_axisbelow(True)

def annotate(ax, rects):
    for r in rects:
        h = r.get_height()
        if h > 0:
            ax.annotate(f'{int(h)}', (r.get_x()+r.get_width()/2, h),
                        xytext=(0, 2), textcoords='offset points',
                        ha='center', va='bottom', fontsize=8, color='#333')

# chart 1: 各乡镇 7-9月 巡查数量合计（降序）
order = sorted(TOWNSHIPS, key=lambda t: -total_patrol[t])
fig, ax = plt.subplots(figsize=(11, 5.2))
vals = [total_patrol[t] for t in order]
rects = ax.bar(order, vals, color='#5B8FF9', width=0.62)
annotate(ax, rects)
ax.set_title('各乡镇作业中心经理、管理员 网格巡查数量（7–9月合计）', fontsize=13, pad=12)
ax.set_ylabel('巡查数量（次）')
plt.xticks(rotation=30, ha='right', fontsize=10)
style_ax(ax)
plt.tight_layout()
plt.savefig(os.path.join(CHART_DIR, 'chart_01_total_patrol.png'), dpi=130)
plt.close()

# chart 2: 各乡镇 7-9月 三违数量合计（降序）
order = sorted(TOWNSHIPS, key=lambda t: -total_viol[t])
fig, ax = plt.subplots(figsize=(11, 5.2))
vals = [total_viol[t] for t in order]
rects = ax.bar(order, vals, color='#E8684A', width=0.62)
annotate(ax, rects)
ax.set_title('各乡镇作业中心经理、管理员 三违数量（7–9月合计）', fontsize=13, pad=12)
ax.set_ylabel('三违数量（起）')
plt.xticks(rotation=30, ha='right', fontsize=10)
style_ax(ax)
plt.tight_layout()
plt.savefig(os.path.join(CHART_DIR, 'chart_02_total_violation.png'), dpi=130)
plt.close()

# chart 3: 各乡镇 各月巡查数量（分组柱状）
x = range(len(TOWNSHIPS))
w = 0.27
fig, ax = plt.subplots(figsize=(13, 5.6))
for i, m in enumerate(MONTHS):
    vals = [patrol[m][t] for t in TOWNSHIPS]
    rects = ax.bar([xi + (i-1)*w for xi in x], vals, w, label=m, color=COLORS[m])
    annotate(ax, rects)
ax.set_xticks(list(x))
ax.set_xticklabels(TOWNSHIPS, rotation=30, ha='right', fontsize=10)
ax.set_title('各乡镇作业中心经理、管理员 网格巡查数量（7/8/9月）', fontsize=13, pad=12)
ax.set_ylabel('巡查数量（次）')
ax.legend()
style_ax(ax)
plt.tight_layout()
plt.savefig(os.path.join(CHART_DIR, 'chart_03_monthly_patrol.png'), dpi=130)
plt.close()

# chart 4: 各乡镇 各月三违数量（分组柱状）
fig, ax = plt.subplots(figsize=(13, 5.6))
for i, m in enumerate(MONTHS):
    vals = [viol[m][t] for t in TOWNSHIPS]
    rects = ax.bar([xi + (i-1)*w for xi in x], vals, w, label=m, color=COLORS[m])
    annotate(ax, rects)
ax.set_xticks(list(x))
ax.set_xticklabels(TOWNSHIPS, rotation=30, ha='right', fontsize=10)
ax.set_title('各乡镇作业中心经理、管理员 三违数量（7/8/9月）', fontsize=13, pad=12)
ax.set_ylabel('三违数量（起）')
ax.legend()
style_ax(ax)
plt.tight_layout()
plt.savefig(os.path.join(CHART_DIR, 'chart_04_monthly_violation.png'), dpi=130)
plt.close()

# chart 5: 乡镇自查三违 vs 公司检查三违（每月，3 子图）
fig, axes = plt.subplots(1, 3, figsize=(17, 5.2))
for idx, m in enumerate(MONTHS):
    ax = axes[idx]
    x = range(len(TOWNSHIPS))
    w = 0.38
    g = [viol[m][t] for t in TOWNSHIPS]
    c = [company_viol[m][t] for t in TOWNSHIPS]
    r1 = ax.bar([xi - w/2 for xi in x], g, w, label='乡镇自查三违', color='#5B8FF9')
    r2 = ax.bar([xi + w/2 for xi in x], c, w, label='公司检查三违', color='#E8684A')
    ax.set_xticks(list(x))
    ax.set_xticklabels(TOWNSHIPS, rotation=45, ha='right', fontsize=8)
    ax.set_title(f'{m} 乡镇自查 vs 公司检查 三违', fontsize=12, pad=10)
    ax.set_ylabel('三违数量（起）')
    style_ax(ax)
    if idx == 0:
        ax.legend(fontsize=9)
fig.suptitle('各乡镇三违数量：乡镇自查（作业中心经理/管理员） vs 公司检查（公司管理）', fontsize=13, y=1.02)
plt.tight_layout()
plt.savefig(os.path.join(CHART_DIR, 'chart_05_compare.png'), dpi=130)
plt.close()

print('图表已生成：', os.listdir(CHART_DIR))