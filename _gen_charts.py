# -*- coding: utf-8 -*-
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
import os

plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei']
plt.rcParams['axes.unicode_minus'] = False

OUT = r'g:\hse-dashboard\docs\8-9月网格长统计分析'
os.makedirs(OUT, exist_ok=True)

TOWNS = ['杜集镇', '柴胡店镇', '长官镇', '保店镇', '刘营伍乡', '张大庄镇',
         '大柳镇', '大曹镇', '相衙镇', '时集镇', '津城街道', '宁城街道']

# 各乡镇 巡查/三违 (8月, 9月) —— 不含公司管理
aug_xc = [275, 209, 150, 155, 122, 122, 116, 121, 117, 152, 92, 60]
aug_sw = [77, 2, 85, 6, 27, 58, 83, 50, 44, 16, 0, 31]
sep_xc = [161, 115, 88, 87, 72, 72, 72, 70, 68, 88, 55, 36]
sep_sw = [57, 0, 48, 1, 6, 9, 19, 44, 31, 0, 0, 18]

# 公司检查(公司管理)三违按乡镇 —— 8月 / 9月（2026-09-21 冻结口径）
aug_cmp = [2, 7, 5, 3, 1, 5, 3, 0, 4, 0, 0, 1]
sep_cmp = [0, 3, 4, 4, 1, 3, 4, 2, 2, 1, 0, 3]

# 经理明细 (顺序 = 基准表)
mgrs = ['张万恒', '王臣祥', '张卫新', '张华平', '靳洪刚', '谢俊章',
        '张和祥', '李振恒', '孙建栋', '杨清华', '郭志强']
mgr_town = {'张万恒': '宁城街道', '王臣祥': '柴胡店镇', '张卫新': '杜集镇', '张华平': '长官镇',
            '靳洪刚': '张大庄镇', '谢俊章': '大柳镇', '张和祥': '刘营伍乡', '李振恒': '相衙镇',
            '孙建栋': '大曹镇', '杨清华': '保店镇', '郭志强': '时集镇'}
aug_m_xc = [29, 27, 31, 31, 30, 30, 29, 26, 28, 31, 31]
aug_m_sw = [0, 0, 2, 2, 2, 0, 6, 1, 3, 0, 0]
sep_m_xc = [18, 17, 18, 18, 18, 18, 18, 15, 16, 19, 17]
sep_m_sw = [0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0]

import numpy as np

def bar_group(labels, series, title, ylabel, path, figsize=(12, 5.2), rotated=False):
    x = np.arange(len(labels))
    w = 0.38
    fig, ax = plt.subplots(figsize=figsize)
    for i, (name, s, c) in enumerate(series):
        b = ax.bar(x + (i - (len(series) - 1) / 2) * w, s, w, label=name, color=c)
        ax.bar_label(b, padding=2, fontsize=8)
    ax.set_ylabel(ylabel, fontsize=10)
    ax.set_title(title, fontsize=13, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=9)
    if rotated:
        plt.setp(ax.get_xticklabels(), rotation=40, ha='right')
    ax.legend(fontsize=9)
    ax.grid(axis='y', alpha=0.25)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)

# 1. 总计：8+9月 巡查 vs 三违
tot_xc = [a + b for a, b in zip(aug_xc, sep_xc)]
tot_sw = [a + b for a, b in zip(aug_sw, sep_sw)]
bar_group(TOWNS, [('网格巡查数量', tot_xc, '#4C78A8'), ('三违数量', tot_sw, '#E45756')],
          '8-9月各乡镇网格巡查数量与三违数量总计（作业中心经理+管理员）', '数量',
          os.path.join(OUT, 'chart1_总计.png'), rotated=True)

# 2/3. 乡镇三违 vs 公司检查三违
for mon, sw, cmp, title, fn in [
    ('8月', aug_sw, aug_cmp, '8月各乡镇三违数量与公司检查三违数量对比', 'chart2_8月三违对比.png'),
    ('9月', sep_sw, sep_cmp, '9月各乡镇三违数量与公司检查三违数量对比', 'chart3_9月三违对比.png')]:
    bar_group(TOWNS, [('乡镇三违数量', sw, '#4C78A8'), ('公司检查三违数量', cmp, '#F58518')],
              title, '三违数量（起）', os.path.join(OUT, fn), rotated=True)

# 4/5. 经理明细 8月 vs 9月
mlbl = ['%s(%s)' % (m, mgr_town[m]) for m in mgrs]
bar_group(mlbl, [('8月巡查', aug_m_xc, '#4C78A8'), ('9月巡查', sep_m_xc, '#54A24B')],
          '各乡镇作业中心经理 8月/9月网格巡查数量', '巡查数量（次）',
          os.path.join(OUT, 'chart4_经理巡查.png'), rotated=True)
bar_group(mlbl, [('8月三违', aug_m_sw, '#E45756'), ('9月三违', sep_m_sw, '#F58518')],
          '各乡镇作业中心经理 8月/9月三违数量', '三违数量（起）',
          os.path.join(OUT, 'chart5_经理三违.png'), rotated=True)

print('charts done ->', OUT)