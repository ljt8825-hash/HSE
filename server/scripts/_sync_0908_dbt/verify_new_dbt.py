import json, re, os, sys

P = r"C:\Users\honey\.workbuddy\projects\g-hse-dashboard\f9e55b6d-41ed-476c-be7f-aa4f82671f73\tool-results\mcp-kdocs-dbsheet_list_records-1788841239029-6c15b0.txt"
HERE = os.path.dirname(os.path.abspath(__file__))

s = open(P, encoding='utf-8').read()
m = re.search(r'"records":(\[.*?\])\s*,\s*"result"', s, re.S)
recs = json.loads(m.group(1)) if m else None
if recs is None:
    d = json.loads(s)
    recs = d['data']['detail']['records']
print("total records:", len(recs))
f1 = sum(1 for r in recs if r['fields'].get('三违照片：图片1'))
f4 = sum(1 for r in recs if r['fields'].get('整改后照片：图片1'))
print("dbt 三违照片图片1 non-empty:", f1)
print("dbt 整改后照片图片1 non-empty:", f4)

img = json.load(open(os.path.join(HERE, 'img_map.json'), encoding='utf-8'))
exp1 = sum(1 for r in img if '三违照片图片1' in r['imgs'])
exp4 = sum(1 for r in img if '整改后照片图片1' in r['imgs'])
print("expected: f1", exp1, "| f4", exp4)

have = {r['fields'].get('编号') for r in recs if r['fields'].get('三违照片：图片1')}
exp_set = {r['bianhao'] for r in img if '三违照片图片1' in r['imgs']}
print("missing f1 (expected but not in dbt):", sorted(exp_set - have))
extra = sorted(x for x in (have - exp_set) if x)
print("extra f1 (in dbt but not expected):", extra)
print("extra f1 records detail:")
for r in recs:
    if r['fields'].get('三违照片：图片1') and r['fields'].get('编号') not in exp_set:
        print("  id=", r['id'], "编号=", r['fields'].get('编号'))
