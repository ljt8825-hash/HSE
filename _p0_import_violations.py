# -*- coding: utf-8 -*-
"""
驾驶员五年违章记录汇总.xlsx → driver_violation 导入（P0-1）

设计要点：
1. 纯调用现有后端接口 POST /api/site-mgmt/driver-violations，不改后端代码、不改表结构。
2. Excel 只有「违章事由」没有「违章类型」列，而 P2 图表「三违类型 TopN」依赖 violationType，
   故按关键词把 56 种事由归类为若干大类（顺序敏感，特殊在前、兜底在后）。
3. 计分「记1分」→ 1；罚款「200元」→ 200；日期统一 'YYYY-MM-DD HH:mm:ss'。
4. 支持 --dry 只做归类验证不写库。
"""
import argparse
import datetime
import json
import re
import ssl
import sys
import urllib.error
import urllib.request

import openpyxl

ssl._create_default_https_context = ssl._create_unverified_context

BASE = 'http://127.0.0.1:5800'
TOKEN_FILE = r'G:/hse-dashboard/_19_admin_token.txt'
XLSX = r'G:/hse-dashboard/2026交通专项行动/公司/驾驶员五年违章记录汇总.xlsx'

# ---------- 违章事由 → 三违大类（顺序敏感） ----------
# 说明：Excel 无「违章类型」列，这里按关键词归类供「三违类型 TopN」图表聚合。
TYPE_RULES = [
    ('超速行驶', ['超过规定时速', '超速', '超过规定车速']),
    ('逆向行驶', ['逆向行驶', '逆行']),
    ('违反信号灯', ['信号灯', '抢黄灯']),
    ('违规停车', ['不按规定停车', '违反规定停放', '临时停车', '停放']),
    ('未系安全带/头盔', ['安全带', '安全头盔']),
    ('分心驾驶', ['手持电话', '接拨', '移动电话', '吸烟', '妨碍安全行车', '妨碍安全驾驶']),
    ('不按规定让行', ['未让', '不让行', '未停车让行', '未停让人行横道']),
    ('不按规定车道行驶', ['机动车道', '导向车道', '变更车道', '借道通行', '车行道右侧']),
    ('违反标志标线', ['禁令标志', '禁止标线']),
    ('违规载货载人', ['最大允许总质量', '违规载', '违反规定载']),
    ('号牌问题', ['号牌']),
    ('车况与证照', ['安全技术检验', '逾期不参加审验', '安全设施不全', '反光标识', '故障车']),
]
FALLBACK_TYPE = '其他交通违法'


def classify(desc: str) -> str:
    """违章事由 → 三违大类"""
    t = str(desc or '').replace('\n', '').strip()
    for label, kws in TYPE_RULES:
        if any(k in t for k in kws):
            return label
    return FALLBACK_TYPE


def parse_points(v) -> int:
    """'记1分' / 1 / '1分' → 1"""
    if isinstance(v, (int, float)):
        return int(v)
    m = re.search(r'\d+', str(v or ''))
    return int(m.group()) if m else 0


def parse_fine(v) -> float:
    """'200元' → 200.0"""
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r'\d+(?:\.\d+)?', str(v or ''))
    return float(m.group()) if m else 0.0


def parse_time(v) -> str:
    """datetime / '2025/1/910:36:00' 脏串 → 'YYYY-MM-DD HH:mm:ss'"""
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d %H:%M:%S')
    s = str(v or '').strip()
    if not s:
        return ''
    # 脏串抢救：'2025/1/910:36:00'（日与小时之间缺分隔符）
    m = re.match(r'^(\d{4})/(\d{1,2})/(\d+):(\d{2})(?::(\d{2}))?$', s)
    if m:
        year, month, dh = int(m.group(1)), int(m.group(2)), m.group(3)
        minute = int(m.group(4) or 0)
        second = int(m.group(5) or 0)
        for hl in (2, 1):  # 优先按 2 位小时拆
            if len(dh) < hl + 1:
                continue
            hour = int(dh[-hl:])
            day = int(dh[: len(dh) - hl])
            if hour <= 23 and 1 <= day <= 31:
                try:
                    d = datetime.datetime(year, month, day, hour, minute, second)
                    if d.day == day:
                        return d.strftime('%Y-%m-%d %H:%M:%S')
                except ValueError:
                    continue
    s2 = s.replace('/', '-').replace('.', '-')
    try:
        d = datetime.datetime.fromisoformat(s2.replace(' ', 'T'))
        return d.strftime('%Y-%m-%d %H:%M:%S')
    except ValueError:
        pass
    m2 = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', s2)
    if m2:
        try:
            d = datetime.datetime(int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
            return d.strftime('%Y-%m-%d %H:%M:%S')
        except ValueError:
            pass
    return ''


def read_rows():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['Sheet1']
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        seq, d, name, desc, fine, pts, note = (list(r) + [None] * 7)[:7]
        name = str(name or '').strip()
        if not name:
            continue
        desc_s = str(desc or '').strip()
        out.append({
            'seq': seq,
            'name': name,
            'violationTime': parse_time(d),
            'violationType': classify(desc_s),
            'violationDesc': desc_s.replace('\n', ''),
            'demeritPoints': parse_points(pts),
            'fineAmount': parse_fine(fine),
            'remark': str(note or '').strip(),
        })
    return out


def post_one(row: dict) -> tuple:
    """写入一条，返回 (ok, msg)"""
    req = urllib.request.Request(
        BASE + '/api/site-mgmt/driver-violations',
        data=json.dumps(row, ensure_ascii=False).encode('utf-8'),
        headers={
            'Authorization': 'Bearer ' + open(TOKEN_FILE).read().strip(),
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            return (body.get('success') is True or body.get('code') == 0, str(body.get('message', '')))
    except urllib.error.HTTPError as e:
        return (False, f'HTTP {e.code}: ' + e.read().decode('utf-8', 'ignore')[:200])
    except Exception as e:  # noqa: BLE001
        return (False, str(e))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='仅归类验证，不写库')
    args = ap.parse_args()

    rows = read_rows()
    print(f'解析到 {len(rows)} 条有效记录')

    import collections
    tc = collections.Counter(r['violationType'] for r in rows)
    print('\n=== 三违类型归类分布 ===')
    for k, v in tc.most_common():
        print(f'{v:5d}  {k}')

    bad_time = [r for r in rows if not r['violationTime']]
    if bad_time:
        print(f'\n[警告] {len(bad_time)} 条日期解析失败:')
        for r in bad_time[:5]:
            print('   ', r['name'], r['violationDesc'][:40])

    if args.dry:
        print('\n[dry-run] 未写库。样例：')
        for r in rows[:3]:
            print('  ', json.dumps(r, ensure_ascii=False))
        return

    ok = fail = 0
    for i, r in enumerate(rows, 1):
        good, msg = post_one(r)
        if good:
            ok += 1
        else:
            fail += 1
            if fail <= 5:
                print(f'[失败] 第{i}条 {r["name"]}: {msg}')
        if i % 50 == 0:
            print(f'  进度 {i}/{len(rows)} (成功{ok} 失败{fail})')
    print(f'\n导入完成：成功 {ok} 条，失败 {fail} 条')


if __name__ == '__main__':
    main()
