#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复「洪永刚」→「洪永钢」姓名笔误（刚/钢 一字之差）。

背景：违章 Excel 把名字录成 洪永刚，但系统真名为 洪永钢（已有驾驶证评估档案 DA-2026-0011，
部门=刘营伍乡片区）。导致 7 条违章 + 1 条三违评估档案挂在错名下、部门为空。

修复：
1) driver_violation 中 name==洪永刚 的 7 条 → 改名 洪永钢
2) 洪永刚 的「三违评估」档案 → 改名 洪永钢，部门补成 洪永钢 驾驶证档案的部门
3) 顺带：傅连路 三违档案部门若空且其驾驶证档案有部门，一并补上
"""
import json
import sys
import urllib.request
import ssl

ssl._create_default_https_context = ssl._create_unverified_context
BASE = "http://127.0.0.1:5800"
TOK = open("_19_admin_token.txt").read().strip()


def get(url):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + TOK})
    return json.load(urllib.request.urlopen(req, timeout=30))


def put(url, data):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={
            "Authorization": "Bearer " + TOK,
            "Content-Type": "application/json",
        }, method="PUT")
    return json.load(urllib.request.urlopen(req, timeout=30))


DRY = "--dry" in sys.argv

BAD, GOOD = "洪永刚", "洪永钢"

# 拉全量
vios = get(f"{BASE}/api/site-mgmt/driver-violations?pageSize=9999")["data"]["list"]
asses = get(f"{BASE}/api/site-mgmt/driver-assessments?pageSize=9999")["data"]["list"]

# 洪永钢 驾驶证档案部门（作为真部门基准）
good_lic = [a for a in asses
            if (a.get("name") or "").strip() == GOOD
            and (a.get("assessmentType") or "驾驶证评估") == "驾驶证评估"]
good_dept = good_lic[0].get("department") if good_lic else ""
print(f"[基准] 洪永钢 驾驶证评估档案部门 = {good_dept!r}")

# 待改名违章
bad_vios = [v for v in vios if (v.get("name") or "").strip() == BAD]
print(f"\n[违章] 需改名 {len(bad_vios)} 条: ids={[v['id'] for v in bad_vios]}")

# 待改名三违档案
bad_sw = [a for a in asses
          if (a.get("name") or "").strip() == BAD
          and (a.get("assessmentType") or "驾驶证评估") == "三违评估"]
print(f"[三违档案] 需改名 {len(bad_sw)} 条:")
for a in bad_sw:
    print(f"   id={a['id']} archiveNo={a.get('archiveNo')} level={a.get('assessmentLevel')} dept={a.get('department')!r}")

# 傅连路 部门补齐检查
fl_sw = [a for a in asses
         if (a.get("name") or "").strip() == "傅连路"
         and (a.get("assessmentType") or "驾驶证评估") == "三违评估"]
fl_lic = [a for a in asses
          if (a.get("name") or "").strip() == "傅连路"
          and (a.get("assessmentType") or "驾驶证评估") == "驾驶证评估"]
fl_plan = []
if fl_sw:
    sw_dept = fl_sw[0].get("department") or ""
    lic_dept = fl_lic[0].get("department") if fl_lic else ""
    print(f"\n[傅连路] 三违档案 dept={sw_dept!r}  驾驶证档案 dept={lic_dept!r}")
    if not sw_dept and lic_dept:
        fl_plan = [(fl_sw[0]["id"], lic_dept)]

if DRY:
    print("\n*** DRY-RUN：以下为将执行的改动（不写库）***")
    for v in bad_vios:
        print(f"  PUT driver-violations/{v['id']}  name: {BAD} -> {GOOD}")
    for a in bad_sw:
        print(f"  PUT driver-assessments/{a['id']}  name: {BAD} -> {GOOD}  dept: '' -> {good_dept!r}")
    for aid, dept in fl_plan:
        print(f"  PUT driver-assessments/{aid}  dept: '' -> {dept!r}")
    sys.exit(0)

# ---- 执行 ----
ok = 0
for v in bad_vios:
    put(f"{BASE}/api/site-mgmt/driver-violations/{v['id']}", {"name": GOOD})
    ok += 1
    print(f"  renamed violation id={v['id']}")
for a in bad_sw:
    put(f"{BASE}/api/site-mgmt/driver-assessments/{a['id']}",
        {"name": GOOD, "department": good_dept})
    ok += 1
    print(f"  renamed+dept 三违档案 id={a['id']} -> {GOOD} / {good_dept}")
for aid, dept in fl_plan:
    put(f"{BASE}/api/site-mgmt/driver-assessments/{aid}", {"department": dept})
    ok += 1
    print(f"  filled 傅连路 三违档案 id={aid} dept={dept}")

print(f"\n完成：共更新 {ok} 条")
