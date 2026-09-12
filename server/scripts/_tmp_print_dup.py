import json
with open(r'G:/hse-dashboard/server/scripts/_store_dump.json', encoding='utf-8') as f:
    rows = json.load(f)
rigang = [r for r in rows if r['name']=='洪永刚']
gang  = [r for r in rows if r['name']=='洪永钢']
print('=== 洪永刚 vs 洪永钢 同一驾驶员错字重复 ===')
print(f'{"洪永刚id":>8} {"时间":12} {"事由":40} {"罚款":>6} {"计分":>4} {"==":>4} {"时间":12} {"事由":40} {"罚款":>6} {"计分":>4}  {"洪永钢id":>8}')
for a,b in zip(rigang, gang):
    aDesc = (a.get('violationDesc','') or '').strip()[:35]
    bDesc = (b.get('violationDesc','') or '').strip()[:35]
    sameT = a['violationTime']==b['violationTime']
    sameD = aDesc==bDesc
    print(f"{a['id']:>8} {a['violationTime']:12} {aDesc:40} {a.get('fineAmount','-'):>6} {a.get('demeritPoints','-'):>4} {('==' if (sameT and sameD) else '!='):>4} {b['violationTime']:12} {bDesc:40} {b.get('fineAmount','-'):>6} {b.get('demeritPoints','-'):>4}  {b['id']:>8}")
