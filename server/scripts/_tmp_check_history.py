import json
with open(r"G:/hse-dashboard/server/scripts/_store_dump.json", encoding="utf-8") as f:
    rows = json.load(f)

# 列出洪永刚、傅连振、洪永钢、傅连路 全部行的 (id, name, violationTime, violationDesc)
for nm in ["洪永刚", "傅连振", "洪永钢", "傅连路"]:
    matched = [r for r in rows if r['name']==nm]
    print(f"=== {nm} 共 {len(matched)} 条 ===")
    for r in matched:
        print(f"  id={r['id']:>3} time={str(r.get('violationTime','')):20} desc={(r.get('violationDesc','') or '')[:30]}")

# 一并看 store 里 31 个姓名是否都在花名册 (43 个 is_driver) 中
import requests
login = requests.post('http://127.0.0.1:5800/api/auth/login', json={'username':'admin','password':'admin123'}).json()
token = login['data']['token']
profiles = requests.get('http://127.0.0.1:5800/api/hse/employee/employees/profile/list?is_driver=true&pageSize=9999',
                       headers={'Authorization':'Bearer '+token}).json()
roster = {p['name'] for p in (profiles.get('data',{}).get('list') or profiles.get('list') or [])}
print(f"\n花名册 is_driver 人数: {len(roster)}")
print(f"store 31 姓名示例: {[r['name'] for r in rows][:5]} ...")

store_names = sorted({r['name'] for r in rows})
extra = sorted(n for n in store_names if n not in roster)
in_roster = sorted(n for n in store_names if n in roster)
print(f"\nstore 姓名不在花名册 ({len(extra)}): {extra}")
print(f"store 姓名在花名册 ({len(in_roster)}): 匹配 {len(in_roster)} 个 → {in_roster[:5]} ...")
