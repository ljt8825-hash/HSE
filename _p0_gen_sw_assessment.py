# -*- coding: utf-8 -*-
"""
P0 端到端实测：模拟前端「生成三违评估」按钮的完整流程并落库校验。

判定逻辑与 apps/web-naive/src/views/site/driver/assessment/index.vue 严格对齐：
  1. 读 /api/site-mgmt/driver-violations 全量违章
  2. 按姓名聚合 → 按「自然年度」累计扣分 → 取最高的那一年
  3. swLevelByPoints：>50 重大 / >=31 较大 / >=16 一般 / 其余 较低
  4. 已有三违评估档案 → PUT 更新；无档案 → POST 新建（部门从花名册带出）

用法：
  python _p0_gen_sw_assessment.py --dry   只算不写，用于核对
  python _p0_gen_sw_assessment.py         实际生成并落库
"""
import argparse
import collections
import json
import re
import ssl
import urllib.error
import urllib.request

ssl._create_default_https_context = ssl._create_unverified_context

BASE = 'http://127.0.0.1:5800'
TOKEN_FILE = r'G:/hse-dashboard/_19_admin_token.txt'

# 与前端 SW_LEVEL_THRESHOLDS 保持一致：驾驶证记分口径
# 较低 0-3 / 一般 4-6 / 较大 7-11 / 重大 ≥12
TH_一般 = 4
TH_较大 = 7
TH_重大 = 11


def api(method, path, body=None, params=None):
    tok = open(TOKEN_FILE).read().strip()
    url = BASE + path
    if params:
        url += '?' + '&'.join(f'{k}={v}' for k, v in params.items())
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            'Authorization': 'Bearer ' + tok,
            'Content-Type': 'application/json',
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def year_of(s):
    m = re.match(r'.*?(\d{4})', str(s or ''))
    return int(m.group(1)) if m else None


def sw_level(points):
    if points > TH_重大:
        return '重大'
    if points >= TH_较大:
        return '较大'
    if points >= TH_一般:
        return '一般'
    return '较低'


def risk_content(level):
    """与 riskRules.ts RISK_RULES[level].content 一致"""
    return {
        '较低': '近5年无严重交通违法，本年度单次或年度累计记分≤3分，违章频次低，情节轻微，无酒驾、超速50%以上、闯红灯、逆行等高危违法行为。',
        '一般': '近3年无严重交通违法，本年度累计记分4~6分（不含），违章频次较低，存在一般性违章，如违停、轻微超速（警告/记分≤3分）、不按规定行驶等，无重大违法记录。',
        '较大': '近2年无严重交通违法，年度累计记分≥9分或单次记分≥6分，违章频次较高，存在闯红灯、超速（记6分）、不按规定让行、违规载货/载人等较严重违法行为；有简易事故责任记录。',
        '重大': '近2年有严重交通违法，年度记分满12分或单次记分12分，存在超速（记12分）、酒驾、醉驾、毒驾、肇事逃逸、无证驾驶；涉可拘留、可吊销驾驶证、刑责等严重交通违法行为。',
    }[level]


def risk_measures(level):
    """与 riskRules.ts RISK_RULES[level].measures 一致"""
    return {
        '较低': '常态化管理，定期开展交通安全警示教育和实操考核，正常安排驾驶作业。',
        '一般': '1.列为一般关注人员，开展一对一安全约谈；限期签订安全行车承诺书，设定不少于3个月的规范提升期；\n2.开展交通安全专项培训（≥8学时），增加安全培训频次，不含班前会，持续周期≤4周；\n3.阶段性限制（≥2周）垃圾转运、收运等远途、夜间（凌晨）及高风险路段驾驶。',
        '较大': '1.纳入重点监管名单，专项建档管理；\n2.暂停驾驶任务，强制参加交通安全专项培训和实操考核（≥16学时），持续周期≤2周；\n3.复工整改期：复工后每2周复盘1次行车违法记录，动态跟踪整改，持续周期≥3个月；\n4.复工整改期间出现同级风险行为的，升级管控措施。',
        '重大': '1.立即暂停驾驶岗位工作，停工教育；\n2.按本单位规章制度，停工教育有成效的调离驾驶岗位；不接受教育或改正的，解除聘用关系或予以辞退。',
    }[level]


def today_str():
    import datetime
    return datetime.date.today().strftime('%Y-%m-%d')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='只计算不落库')
    args = ap.parse_args()

    # 1) 违章数据
    vio = api('GET', '/api/site-mgmt/driver-violations', params={'pageSize': 9999})['data']['list']
    print(f'违章记录：{len(vio)} 条')

    # 2) 花名册驾驶员（用于带出部门）
    dept_of = {}
    try:
        prof = api('GET', '/api/hse/employee/employees/profile/list',
                   params={'is_driver': 'true', 'pageSize': 9999})['data']['list']
        dept_of = {(p.get('name') or '').strip(): (p.get('dept_name') or '') for p in prof}
        print(f'花名册驾驶员：{len(dept_of)} 人')
    except Exception as e:  # noqa: BLE001
        print('[警告] 花名册读取失败，部门将留空：', e)

    # 3) 聚合判定
    ny = collections.defaultdict(lambda: collections.defaultdict(int))
    cnt = collections.Counter()
    tpts = collections.Counter()
    types = collections.defaultdict(collections.Counter)
    for v in vio:
        n = (v.get('name') or '').strip()
        y = year_of(v.get('violationTime'))
        if not n:
            continue
        p = v.get('demeritPoints') or 0
        cnt[n] += 1
        tpts[n] += p
        types[n][(v.get('violationType') or '').strip() or '未分类'] += 1
        if y is not None:
            ny[n][y] += p

    rows = []
    for n in ny:
        best_year, best_pts = max(ny[n].items(), key=lambda kv: (kv[1], kv[0])) if ny[n] else (None, 0)
        rows.append({
            'name': n,
            'level': sw_level(best_pts),
            'bestYear': best_year,
            'bestPoints': best_pts,
            'totalCount': cnt[n],
            'totalPoints': tpts[n],
            'topType': types[n].most_common(1)[0][0] if types[n] else '-',
        })
    order = {'重大': 0, '较大': 1, '一般': 2, '较低': 3}
    rows.sort(key=lambda r: (order[r['level']], -r['bestPoints']))

    dist = collections.Counter(r['level'] for r in rows)
    print(f'\n判定人数：{len(rows)}   等级分布：' +
          '  '.join(f'{k} {dist[k]}人' for k in ['重大', '较大', '一般', '较低'] if dist[k]))
    print('\n=== 判定明细（前10）===')
    for r in rows[:10]:
        print(f"  {r['level']}  {r['name']}  最高年{r['bestYear']}={r['bestPoints']}分  "
              f"{r['totalCount']}条/累计{r['totalPoints']}分  {r['topType']}")

    if args.dry:
        print('\n[dry-run] 未落库')
        return

    # 4) 已存在的三违评估档案
    arcs = api('GET', '/api/site-mgmt/driver-assessments', params={'pageSize': 9999})['data']['list']
    exist = {(a.get('name') or '').strip(): a
             for a in arcs if (a.get('assessmentType') or '驾驶证评估') == '三违评估'}
    print(f'\n已有三违评估档案：{len(exist)} 条')

    year = 2026
    import datetime
    year = datetime.date.today().year
    max_no = 0
    for a in arcs:
        m = re.match(rf'^DA-{year}-(\d+)$', a.get('archiveNo') or '')
        if m:
            max_no = max(max_no, int(m.group(1)))

    created = updated = failed = 0
    for r in rows:
        thr = f'(较低≤{TH_一般 - 1} / 一般{TH_一般}~{TH_较大 - 1} / 较大{TH_较大}~{TH_重大} / 重大>{TH_重大})'
        payload = {
            'assessmentLevel': r['level'],
            'assessmentResult': (
                f"{risk_content(r['level'])}\n【判定依据】按自然年度累计扣分，"
                f"{r['bestYear'] or '-'} 年累计 {r['bestPoints']} 分为历年最高，按三违评估阈值{thr}定为「{r['level']}」。\n"
                f"【数据】违章 {r['totalCount']} 条，五年累计扣分 {r['totalPoints']} 分，主要三违类型：{r['topType']}。"
            ),
            'controlMeasures': risk_measures(r['level']),
            'assessmentType': '三违评估',
            'assessmentDate': today_str(),
            'status': '完成',
        }
        try:
            if r['name'] in exist:
                api('PUT', f"/api/site-mgmt/driver-assessments/{exist[r['name']]['id']}", payload)
                updated += 1
            else:
                max_no += 1
                api('POST', '/api/site-mgmt/driver-assessments', {
                    **payload,
                    'archiveNo': f'DA-{year}-{max_no:04d}',
                    'name': r['name'],
                    'department': dept_of.get(r['name'], ''),
                })
                created += 1
        except urllib.error.HTTPError as e:
            failed += 1
            print(f"[失败] {r['name']}: HTTP {e.code} {e.read().decode('utf-8', 'ignore')[:150]}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"[失败] {r['name']}: {e}")

    print(f'\n生成完成：新建 {created} 条、更新 {updated} 条、失败 {failed} 条')

    # 5) 落库校验
    arcs2 = api('GET', '/api/site-mgmt/driver-assessments', params={'pageSize': 9999})['data']['list']
    c = collections.Counter((a.get('assessmentType') or '驾驶证评估') for a in arcs2)
    sw = [a for a in arcs2 if (a.get('assessmentType') or '') == '三违评估']
    lv = collections.Counter(a.get('assessmentLevel') for a in sw)
    print(f"\n落库校验：档案总数 {len(arcs2)}  {dict(c)}")
    print(f"三违评估等级分布：{dict(lv)}")
    print(f"三违评估带部门：{sum(1 for a in sw if a.get('department'))}/{len(sw)}")


if __name__ == '__main__':
    main()
