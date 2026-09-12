"""精确核对真实唯一数（与后端 normalize 对齐）。"""
from openpyxl import load_workbook

def norm(v):
    if v is None: return ""
    if hasattr(v, 'strftime'):
        # 后端 fixDateValue 转成 'YYYY-MM-DD HH:MM:SS' 或 'YYYY-MM-DD'
        return v.strftime("%Y-%m-%d %H:%M:%S")
    return str(v).strip()

wb = load_workbook(r"G:/safety_vault/04_现场管理/2026交通专项行动/公司/驾驶员五年违章记录汇总.xlsx", data_only=True, read_only=True)
ws = wb.active
all_rows = list(ws.iter_rows(min_row=2, values_only=True))
print("total rows (含空):", len(all_rows))

# 与后端一致：只看 parseViolationTime 能解析的日期 + 姓名非空
valid = []
for i, r in enumerate(all_rows, start=2):
    name = (r[2] or "").strip()
    vt = r[1]
    if not name:
        continue
    if not vt:
        continue
    valid.append((i, name, norm(vt)))

print("non-empty (name+vt) rows:", len(valid))
seen = {}
dups = []
for idx, name, vt in valid:
    k = (name, vt)
    if k in seen:
        dups.append((idx, name, vt, "first_row="+str(seen[k])))
    else:
        seen[k] = idx

print(f"unique by (name, vt) among non-empty: {len(seen)}")
print("real duplicates (non-empty):", len(dups))
for d in dups:
    print(" ", d)

# 检查'洪永刚'/'洪永钢'/'傅连路'/'傅连振'
for nm in ["洪永刚","洪永钢","傅连路","傅连振","麻新军"]:
    n = sum(1 for _,name,_ in valid if name==nm)
    print(f"  {nm}: {n} rows")

# 全部 31 个姓名
names = sorted(set(name for _,name,_ in valid))
print("31 names:")
for n in names:
    print(" ", n)
