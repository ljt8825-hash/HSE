# -*- coding: utf-8 -*-
# 1) 提取 4 Excel 宁津行（完整描述） 2) 与系统记录匹配 3) 按严格规则生成 类别/性质/三级 目标值
import openpyxl, sys, io, json, re, difflib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = r"G:/hse-dashboard/server/scripts/_accidents/"
JOBS = [
    ("2023", r"G:/safety_vault/07_事故事件管理/宁津项目--北控城市资源集团事故统计报表（2023版）.xlsx", "表1 事故统计", "F", "H", "I", 5),
    ("2024", r"G:/safety_vault/07_事故事件管理/宁津项目--北控城市资源集团事故统计报表（2024）.xlsx", "2024年", "F", "H", "I", 5),
    ("2025", r"G:/safety_vault/07_事故事件管理/宁津项目-北控城市资源集团事故统计报表（2025版）.xlsx", "表1 事故统计", "F", "H", "G", 5),
    ("2026", r"G:/safety_vault/07_事故事件管理/宁津项目-北控城市资源集团事故统计报表（2026版） .xlsx", "表1 事故统计", "F", "H", "G", 5),
]
def col_idx(letter):
    n = 0
    for ch in letter:
        n = n * 26 + (ord(ch) - 64)
    return n - 1

# ---- 读取 Excel 宁津行 ----
nj = {}
for tag, f, sheet, ccol, hcol, icol, start in JOBS:
    wb = openpyxl.load_workbook(f, data_only=True, read_only=True)
    ws = wb[sheet]
    ci, hi, ii = col_idx(ccol), col_idx(hcol), col_idx(icol)
    rows = []
    for row in ws.iter_rows(min_row=start, values_only=True):
        if len(row) < 5: continue
        proj = (row[2] or '').strip() if len(row) > 2 else ''
        if proj != '宁津': continue
        desc = (row[4] or '').strip() if len(row) > 4 else ''
        if '无事故' in desc: continue
        rows.append({
            "cat": (row[ci] or '').strip() if ci < len(row) else '',
            "conseq": (row[hi] or '').strip() if hi < len(row) else '',
            "nat": (row[ii] or '').strip() if ii < len(row) else '',
            "desc": desc,
        })
    nj[tag] = rows
    wb.close()

# ---- 系统记录 ----
with open(BASE + "_db_full.json", encoding="utf-8") as fp:
    db = json.load(fp)

# ---- 系统权威枚举（与后端 routes/accidents.js 完全一致） ----
CAT_MAP = {
    '交通事故': '交通', '交通': '交通',
    '生产安全': '生产安全',
    '意外伤害': '意外', '意外': '意外', '意外事故': '意外',
    '突发疾病': '突发疾病',
    '公众': '公众', '公众责任': '公众', '公共责任': '公众',
    '职业病': '职业病',
    '其它': '其它', '刑事案件': '其它', '治安事件': '其它',
}
SYS_NATURE = {
    '交通': ['全部责任', '主要责任', '同等责任', '次要责任', '无责任', '待认定'],
    '生产安全': ['责任', '非责任'],
    '意外': ['意外'],
    '公众': ['责任', '非责任'],
    '突发疾病': ['岗位发病', '非岗位发病'],
    '职业病': ['中暑', '热射病', '其它', '尘肺病', '职业性传染病', '职业性化学中毒', '职业性眼病', '职业性皮肤病', '其他呼吸系统疾病', '职业性肿瘤'],
    '其它': ['刑事', '治安'],
}
L3_MAP = {
    '交通全部责任': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '交通主要责任': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '交通同等责任': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '交通次要责任': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '交通无责任': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '交通待认定': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '生产安全责任': ['物体打击', '机械伤害', '车辆伤害', '高处坠落', '触电', '火灾', '灼烫', '坍塌', '淹溺', '起重伤害', '中毒', '窒息', '爆炸-容器', '爆炸-锅炉', '爆炸-其它', '其它'],
    '生产安全非责任': ['物体打击', '机械伤害', '车辆伤害', '高处坠落', '触电', '火灾', '灼烫', '坍塌', '淹溺', '起重伤害', '中毒', '窒息', '爆炸-容器', '爆炸-锅炉', '爆炸-其它', '其它'],
    '意外': ['滑倒', '绊倒', '踩空', '动物咬', '蜂虫叮', '划/割伤', '其它'],
    '公众责任': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '公众非责任': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '突发疾病岗位发病': ['48h内死亡', '48h外死亡', '未死亡'],
    '突发疾病非岗位发病': ['死亡', '未死亡'],
    '职业病中暑': ['工时损失', '死亡'],
    '职业病热射病': ['工时损失', '死亡'],
    '职业病其它': ['工时损失', '死亡'],
    '其它刑事': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '其它治安': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
}
L3_FALLBACK = {
    '交通': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '公众': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '其它': ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
    '生产安全': L3_MAP['生产安全责任'],
    '职业病': ['工时损失', '死亡'],
    '意外': L3_MAP['意外'],
    '突发疾病': [],
}
def l3_options(cat, nat):
    if cat == '意外':
        return L3_MAP['意外']
    return L3_MAP.get(cat + nat, L3_FALLBACK.get(cat, []))

def norm(s):
    return re.sub(r'[\s\u3000，。：；、（）()【】"'':：·\-—–]', '', s or '')

def match_excel(year, dbrow):
    """返回 (excel行, 相似度)；优先描述相似，其次系统短描述是 Excel 描述前缀，最后姓名唯一命中"""
    nd = norm(dbrow['desc'][:150])
    rows = nj.get(year, [])
    best, best_r = 0.0, None
    for x in rows:
        r = difflib.SequenceMatcher(None, nd, norm(x['desc'][:150])).ratio()
        if r > best:
            best, best_r = r, x
    if best_r and best >= 0.6:
        return best_r, best
    # 系统描述是 Excel 描述的前缀（如系统只有"2025年8月11日7:30分左右"）
    if nd and len(nd) >= 8:
        for x in rows:
            if norm(x['desc']).startswith(nd):
                return x, 1.0
    # 姓名唯一命中兜底
    p = (dbrow['person'] or '').strip()
    if p and p != '/':
        hits = [x for x in rows if p in x['desc']]
        if len(hits) == 1:
            return hits[0], 1.0
    return best_r, best

# ---- 逐条匹配 + 映射 ----
mapping = []
unmatched = []
print(f"{'系统记录':<18}{'Excel类别':<10}{'Excel性质':<10}{'Excel后果':<16}{'→类别':<8}{'→性质':<10}{'→三级':<12}匹配")
for d in db:
    x, score = match_excel(d['year'], d)
    if not x or score < 0.5:
        unmatched.append(d)
        print(f"{d['no']}/{d['person']:<6}  <未匹配 score={score:.2f}>")
        continue
    cat_sys = CAT_MAP.get(x['cat'], '')
    nat_sys = ''
    l3_sys = ''
    if cat_sys and x['nat'] and x['nat'] != '——':
        if x['nat'] in SYS_NATURE.get(cat_sys, []):
            nat_sys = x['nat']
            if x['conseq'] and x['conseq'] in l3_options(cat_sys, nat_sys):
                l3_sys = x['conseq']
    mapping.append({
        "id": d['id'], "no": d['no'], "year": d['year'], "person": d['person'],
        "excelCat": x['cat'], "excelNat": x['nat'], "excelConseq": x['conseq'],
        "cat": cat_sys, "nat": nat_sys, "l3": l3_sys,
    })
    print(f"{d['no']}/{d['person']:<6} {x['cat']:<9} {x['nat']:<9} {x['conseq']:<15} {cat_sys or '-':<7} {nat_sys or '-':<9} {l3_sys or '-':<11} {score:.2f}")

print(f"\n匹配成功 {len(mapping)} 条，未匹配 {len(unmatched)} 条")
for d in unmatched:
    print("  unmatched:", d['no'], d['person'], d['year'], d['desc'][:30])

with open(BASE + "_mapping.json", "w", encoding="utf-8") as fp:
    json.dump(mapping, fp, ensure_ascii=False, indent=1)
print("saved _mapping.json")
