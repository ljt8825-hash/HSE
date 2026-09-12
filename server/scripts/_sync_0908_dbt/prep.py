import openpyxl, json, os

SRC = "Y:/月度考核/三违/9月/2026-09-1-6新版-按日期排序.xlsx"
OUT = "G:/hse-dashboard/server/scripts/_sync_0908_dbt"
os.makedirs(os.path.join(OUT, "sub"), exist_ok=True)

# row2 = header
HDR = ['序号','昵称','分组名称','姓名','所属岗位','网格等级','日期','三违照片：图片1','三违照片：图片2','三违照片：图片3','三违行为','违章人姓名','违章人性别','违章人年龄','整改后照片：图片1','当日是否报名','标记','是否补交','提交时间','编号','来源日期']
ci = {n:i for i,n in enumerate(HDR)}

# canonical field map (file col -> dbt field)
MAP = {
    '序号':'当日序号','昵称':'昵称','分组名称':'分组名称','姓名':'姓名','所属岗位':'所属岗位',
    '网格等级':'网格等级','日期':'检查日期','三违行为':'三违行为','违章人姓名':'违章人姓名',
    '违章人性别':'违章人性别','违章人年龄':'违章人年龄','当日是否报名':'当日是否报名',
    '标记':'标记','是否补交':'是否补交','提交时间':'提交时间','编号':'编号','来源日期':'来源日期',
}
FIELDS = list(MAP.values())  # 17 fields

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb["2026-09详细数据"]

records = []
skipped_blank = 0
for r in ws.iter_rows(min_row=3, values_only=True):
    if r is None:
        skipped_blank += 1; continue
    # fully blank?
    if all(v is None for v in r):
        skipped_blank += 1; continue
    # name empty -> skip junk
    name = r[ci['姓名']]
    if not name:
        skipped_blank += 1; continue
    fields = {}
    for col, fld in MAP.items():
        v = r[ci[col]]
        if v is None: continue
        s = str(v).strip()
        if s == '': continue
        fields[fld] = s
    if not fields:
        skipped_blank += 1; continue
    records.append({"fields": fields})

print("TOTAL real records:", len(records), " skipped blank/junk:", skipped_blank)

# write full
with open(os.path.join(OUT, "_dbt_records.json"), "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=1)

# write fields
with open(os.path.join(OUT, "dbt_fields.json"), "w", encoding="utf-8") as f:
    json.dump([{"name": n, "type": "text"} for n in FIELDS], f, ensure_ascii=False, indent=1)

# NDJSON sub-batches of 15
B = 50
n = 0
for i in range(0, len(records), B):
    chunk = records[i:i+B]
    fn = os.path.join(OUT, "sub", f"sub_{i//B:02d}.jsonl")
    with open(fn, "w", encoding="utf-8") as f:
        for rec in chunk:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    n += 1
print("sub-batches:", n)
# verify max line length
maxlen = 0
for i in range(n):
    with open(os.path.join(OUT,"sub",f"sub_{i:02d}.jsonl"), encoding="utf-8") as f:
        for line in f:
            maxlen = max(maxlen, len(line.rstrip("\n")))
print("max NDJSON line length:", maxlen)
