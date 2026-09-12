import openpyxl, json, datetime

XLSX = r"G:/safety_vault/04_现场管理/2026.8.1-13.xlsx"
SHEET = "详细数据统计（按预设名单顺序排序）"
MAP = r"G:/hse-dashboard/_violation_image_map.json"
OUT = r"G:/hse-dashboard/_violation_full_rows.json"

wbk = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
ws = wbk[SHEET]
rows = list(ws.iter_rows(values_only=True))
hdr_idx = next(i for i, r in enumerate(rows[:5]) if r and "三违行为" in r)
header = rows[hdr_idx]
def col_of(name):
    for j, v in enumerate(header):
        if v and str(v).strip() == name:
            return j
    return None
C = {k: col_of(k) for k in ["序号","昵称","分组名称","姓名","所属岗位","网格等级","日期","三违行为","违章人姓名","违章人性别","违章人年龄","当日是否报名","标记","是否补交","提交时间","编号"]}

def to_date(v):
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, datetime.date):
        return v.strftime("%Y-%m-%d")
    if v is None:
        return None
    s = str(v).strip().replace("/", "-")
    if " " in s:
        s = s[:10]
    return s or None

def norm_ts(v):
    if v is None:
        return None
    s = str(v).strip().replace("/", "-")
    return s or None

def to_int(v):
    try:
        return int(float(str(v).strip()))
    except Exception:
        return None

def to_bool(v):
    s = (v or "")
    return str(s).strip() == "是"

# attach images by seq
imgmap = {m["seq"]: m for m in json.load(open(MAP, encoding="utf-8"))}

out = []
data = rows[hdr_idx + 1:]
for r in data:
    seq = str(r[C["序号"]]).strip() if r[C["序号"]] is not None else ""
    m = imgmap.get(seq, {})
    out.append({
        "no": str(r[C["编号"]]).strip() if r[C["编号"]] is not None else None,
        "nickname": str(r[C["昵称"]]).strip() if r[C["昵称"]] is not None else None,
        "area_team": str(r[C["分组名称"]]).strip() if r[C["分组名称"]] is not None else None,
        "inspector_name": str(r[C["姓名"]]).strip() if r[C["姓名"]] is not None else None,
        "position": str(r[C["所属岗位"]]).strip() if r[C["所属岗位"]] is not None else None,
        "grid_level": str(r[C["网格等级"]]).strip() if r[C["网格等级"]] is not None else None,
        "violation_date": to_date(r[C["日期"]]),
        "upload_time": norm_ts(r[C["提交时间"]]),
        "violation_behavior": str(r[C["三违行为"]]).strip() if r[C["三违行为"]] is not None else None,
        "description": str(r[C["三违行为"]]).strip() if r[C["三违行为"]] is not None else None,
        "violator_name": str(r[C["违章人姓名"]]).strip() if r[C["违章人姓名"]] is not None else None,
        "violator_gender": str(r[C["违章人性别"]]).strip() if r[C["违章人性别"]] is not None else None,
        "violator_age": to_int(r[C["违章人年龄"]]),
        "report_status": str(r[C["当日是否报名"]]).strip() if r[C["当日是否报名"]] is not None else None,
        "mark": str(r[C["标记"]]).strip() if r[C["标记"]] is not None else None,
        "is_supplementary": to_bool(r[C["是否补交"]]),
        "image_content": ",".join(m.get("threeViolation", [])) if m else None,
        "rectification_photos": ",".join(m.get("rectification", [])) if m else None,
        "status": "待处理",
        "mark": "EXCEL-2026.8.1-13",
    })

json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("dumped rows:", len(out))
print("sample[0]:", json.dumps(out[0], ensure_ascii=False)[:400])
wbk.close()
