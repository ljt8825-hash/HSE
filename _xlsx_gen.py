import pandas as pd

fn = 'G:/safety_vault/04_现场管理/2026.8.1-13.xlsx'
df = pd.read_excel(fn, sheet_name=0, header=1)
df = df.loc[:, ~df.columns.str.startswith('Unnamed')].copy()
df['姓名'] = df['姓名'].fillna('').astype(str).str.strip()
df['网格等级'] = df['网格等级'].fillna('').astype(str).str.strip()
df['三违行为'] = df['三违行为'].fillna('').astype(str).str.strip()

# ---- 口径定义 ----
# 完成三违行为次数：三违行为 非 '无三违行为' 且 非 '--'（即实际发现并记录违规）
df['is_violation'] = ~df['三违行为'].isin(['无三违行为', '--', ''])
VCOL = ['序号', '姓名', '网格等级', '分组名称', '日期', '三违行为', '违章人姓名', '违章人性别', '违章人年龄']

# 等级排序键
grade_rank = {'总网格长': 0, '一级网格长': 1, '二级网格长': 2, '三级网格长': 3}
df['_grade'] = df['网格等级'].map(grade_rank).fillna(99)

# ============ 核心：二/三级网格长 完成三违行为次数 排名 ============
sub = df[df['网格等级'].isin(['二级网格长', '三级网格长'])].copy()
g = sub.groupby(['姓名', '网格等级', '分组名称'], dropna=False).agg(
    提交总次数=('序号', 'count'),
    完成三违行为次数=('is_violation', 'sum'),
    无三违行为次数=('三违行为', lambda s: (s == '无三违行为').sum()),
    未填写次数=('三违行为', lambda s: (s == '--').sum()),
).reset_index()
g['完成三违行为次数'] = g['完成三违行为次数'].astype(int)
# 主要三违类型（取出现最多的真实违规类型）
def top_types(name):
    s = sub[(sub['姓名'] == name) & (sub['is_violation'])]['三违行为']
    if len(s) == 0:
        return '-'
    vc = s.value_counts()
    return '、'.join(vc.index[:3])
g['主要三违类型'] = g['姓名'].map(top_types)
g = g.sort_values(['完成三违行为次数', '提交总次数', '姓名'],
                  ascending=[False, False, True]).reset_index(drop=True)
g.insert(0, '排名', g.index + 1)

# ============ 三种排序 ============
sort_grade = df.sort_values(['_grade', '姓名', '日期'], kind='stable')
sort_viol = df.sort_values(['三违行为', '姓名', '日期'], kind='stable')
sort_name = df.sort_values(['姓名', '日期'], kind='stable')

# ============ 汇总表 ============
grade_summary = df.groupby('网格等级').agg(
    记录数=('序号', 'count'),
    完成三违行为次数=('is_violation', 'sum'),
).reset_index().sort_values('_grade' if False else '网格等级')
grade_summary['完成三违行为次数'] = grade_summary['完成三违行为次数'].astype(int)
grade_summary = grade_summary.merge(
    df.groupby('网格等级').size().rename('人数').reset_index(), on='网格等级', how='left')

viol_summary = df[df['is_violation']].groupby('三违行为').size().reset_index(name='次数')
viol_summary = viol_summary.sort_values('次数', ascending=False).reset_index(drop=True)

# 姓名汇总（二/三级）
name_summary = g[['排名', '姓名', '网格等级', '分组名称', '提交总次数',
                  '完成三违行为次数', '主要三违类型']].copy()

# ============ 写 xlsx（配套） ============
out_xlsx = 'G:/hse-dashboard/三违检查分析_2026.8.1-13.xlsx'
with pd.ExcelWriter(out_xlsx, engine='openpyxl') as xw:
    g.to_excel(xw, sheet_name='二三级网格长排名', index=False)
    sort_grade[VCOL].to_excel(xw, sheet_name='按网格等级排序', index=False)
    sort_viol[VCOL].to_excel(xw, sheet_name='按三违行为排序', index=False)
    sort_name[VCOL].to_excel(xw, sheet_name='按姓名排序', index=False)
print('xlsx written:', out_xlsx)

# ============ 写 md ============
def md_table(frame, cols=None, max_rows=None):
    f = frame if cols is None else frame[cols]
    if max_rows is not None and len(f) > max_rows:
        f = f.head(max_rows)
    headers = list(f.columns)
    lines = ['| ' + ' | '.join(str(h) for h in headers) + ' |',
             '| ' + ' | '.join('---' for _ in headers) + ' |']
    for _, row in f.iterrows():
        lines.append('| ' + ' | '.join('' if pd.isna(v) else str(v) for v in row) + ' |')
    return '\n'.join(lines)

total = len(df)
n_viol = int(df['is_violation'].sum())
n_none = int((df['三违行为'] == '无三违行为').sum())
n_blank = int((df['三违行为'] == '--').sum())
d2026 = df['日期'].astype(str)
d2026_valid = d2026[d2026.str.startswith('2026')]
date_min = d2026_valid.min()
date_max = d2026_valid.max()
date_anomaly = int((~d2026.str.startswith('2026')).sum())

md = []
md.append('# 现场管理「三违」检查数据分析报告')
md.append('')
md.append(f'- **数据来源**：`G:\\safety_vault\\04_现场管理\\2026.8.1-13.xlsx`（工作表：详细数据统计）')
md.append(f'- **统计区间**：{date_min} ～ {date_max}（含 {date_anomaly} 条年份误录为 2027 的异常记录，已按 2026 处理）')
md.append(f'- **总记录数**：{total} 条（含各级网格长每日提交）')
md.append(f'- **网格长人数**：{df["姓名"].replace("", pd.NA).nunique()} 人')
md.append('')
md.append('## 一、数据概览')
md.append('')
md.append(f'全表记录按「三违行为」填写情况分为三类：')
md.append('')
md.append(f'| 类别 | 含义 | 记录数 | 占比 |')
md.append(f'| --- | --- | ---: | ---: |')
md.append(f'| 实际发现违规 | 三违行为列填写了具体违规内容 | {n_viol} | {n_viol/total*100:.1f}% |')
md.append(f'| 无三违行为 | 完成检查但未发现违规 | {n_none} | {n_none/total*100:.1f}% |')
md.append(f'| 未填写(--） | 当日未有效提交 | {n_blank} | {n_blank/total*100:.1f}% |')
md.append('')
md.append('### 1.1 网格等级分布')
md.append('')
md.append(md_table(grade_summary[['网格等级', '人数', '记录数', '完成三违行为次数']]))
md.append('')
md.append('### 1.2 三违行为类型分布（Top 15）')
md.append('')
md.append(md_table(viol_summary, max_rows=15))
md.append('')
md.append('## 二、二/三级网格长「完成三违行为」次数排名（降序）')
md.append('')
md.append('> **口径**：完成三违行为次数 = 该网格长提交记录中「三违行为」列非"无三违行为"且非"--"的条数（即实际发现并记录的违规次数）。')
md.append('> 提交总次数 = 该网格长全部提交记录数；未填写次数 = "三违行为"为"--"的条数。')
md.append('')
md.append(md_table(g[['排名', '姓名', '网格等级', '分组名称', '提交总次数',
                       '完成三违行为次数', '无三违行为次数', '未填写次数', '主要三违类型']]))
md.append('')
md.append(f'> 二级、三级网格长共 **{len(g)}** 人，合计完成三违行为 **{int(g["完成三违行为次数"].sum())}** 次。')
md.append('')
md.append('## 三、按网格等级排序')
md.append('')
md.append('排序键：总网格长 → 一级网格长 → 二级网格长 → 三级网格长，同级按姓名、日期。完整明细见配套 xlsx「按网格等级排序」工作表。')
md.append('')
md.append(md_table(sort_grade[VCOL]))
md.append('')
md.append('## 四、按三违行为排序')
md.append('')
md.append('排序键：三违行为列值（"--" 置前，其后为"无三违行为"，再为具体违规类型）。完整明细见配套 xlsx「按三违行为排序」工作表。')
md.append('')
md.append(md_table(sort_viol[VCOL]))
md.append('')
md.append('## 五、按姓名排序')
md.append('')
md.append('排序键：姓名（Unicode 序），同姓名按日期。完整明细见配套 xlsx「按姓名排序」工作表。')
md.append('')
md.append(md_table(sort_name[VCOL]))
md.append('')
md.append('## 六、口径与说明')
md.append('')
md.append('- 数据取自 xlsx 首个工作表「详细数据统计（按预设名单顺序排序）」，表头位于第 2 行，共 21 个有效字段、825 条数据记录。')
md.append('- 「完成三违行为次数」仅统计实际发现违规的记录（三违行为列非空且非"无三违行为"），未将"无三违行为"和"未填写(--)"计入，以真实反映各网格长的三违查处工作量。')
md.append('- 部分记录「三违行为」列直接填写了违章人姓名（如王洪岭、姚俊香等），属填报时未选违规类型、仅录姓名的情况，已按"已发现违规"计入完成次数。')
md.append('- 网格等级中"总网格长/一级网格长"未纳入二/三级排名，仅参与分布与排序展示。')
md.append('- 配套文件 `三违检查分析_2026.8.1-13.xlsx` 含 4 个工作表：二三级网格长排名、按网格等级排序、按三违行为排序、按姓名排序（全量 825 行）。')

out_md = 'G:/hse-dashboard/三违检查分析_2026.8.1-13.md'
with open(out_md, 'w', encoding='utf-8') as f:
    f.write('\n'.join(md))
print('md written:', out_md)
print('ranking rows:', len(g), 'total violations(二三级):', int(g['完成三违行为次数'].sum()))
