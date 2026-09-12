# -*- coding: utf-8 -*-
"""
三违评估扣分口径对比（只读分析，不改数据）

背景：三违评估等级阈值原本按企业三违「公司查处计5分/次」设计为 15/30/50，
但本模块实际数据源是交通违章记分（单次 0~12 分），两者量纲不匹配。
本脚本用库内真实数据，对比多套「累计方式 × 阈值」的等级分布，供口径决策。
"""
import collections
import datetime
import json
import re
import ssl
import urllib.request

import openpyxl

ssl._create_default_https_context = ssl._create_unverified_context
TOKEN_FILE = r'G:/hse-dashboard/_19_admin_token.txt'
XLSX = r'G:/hse-dashboard/2026交通专项行动/公司/驾驶员五年违章记录汇总.xlsx'
BASE = 'http://127.0.0.1:5800'


def load():
    """优先用库内数据，拿不到则回退 Excel"""
    try:
        tok = open(TOKEN_FILE).read().strip()
        req = urllib.request.Request(
            BASE + '/api/site-mgmt/driver-violations?pageSize=9999',
            headers={'Authorization': 'Bearer ' + tok},
        )
        d = json.load(urllib.request.urlopen(req, timeout=30))
        lst = (d.get('data') or {}).get('list') or []
        if lst:
            return [
                {
                    'name': x.get('name') or '',
                    'time': x.get('violationTime'),
                    'points': x.get('demeritPoints') or 0,
                    'type': x.get('violationType') or '',
                }
                for x in lst
            ], '库内 driver_violation'
    except Exception as e:  # noqa: BLE001
        print('[提示] 库内读取失败，回退 Excel：', e)

    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['Sheet1']
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        _, d, name, _, _, pts, _ = (list(r) + [None] * 7)[:7]
        if not name:
            continue
        t = d.strftime('%Y-%m-%d %H:%M:%S') if isinstance(d, datetime.datetime) else str(d or '')
        m = re.search(r'\d+', str(pts or ''))
        out.append({'name': str(name).strip(), 'time': t, 'points': int(m.group()) if m else 0, 'type': ''})
    return out, 'Excel'


def year_of(s):
    """'2025-05-09 07:42:00' → 2025"""
    m = re.match(r'.*?(\d{4})', str(s or ''))
    return int(m.group(1)) if m else None


def yearly_max(rows):
    """每人：按自然年度累计扣分，取最高年"""
    ny = collections.defaultdict(lambda: collections.defaultdict(int))
    cnt = collections.Counter()
    for r in rows:
        y = year_of(r['time'])
        if y is None:
            continue
        ny[r['name']][y] += r['points']
        cnt[r['name']] += 1
    return {n: max(yds.values()) for n, yds in ny.items()}, cnt


def total_sum(rows):
    s = collections.Counter()
    for r in rows:
        s[r['name']] += r['points']
    return s


def make_lvl(ths):
    """ths = (一般下限, 较大下限, 重大下限)"""
    def f(p):
        if p > ths[2]:
            return '重大'
        if p >= ths[1]:
            return '较大'
        if p >= ths[0]:
            return '一般'
        return '较低'
    return f


def report(title, scores, lvl):
    d = collections.Counter(lvl(p) for p in scores.values())
    order = ['重大', '较大', '一般', '较低']
    print(f'\n{title}')
    print('   ' + '  '.join(f'{k} {d[k]}人' for k in order if d[k]) + f'   (共{len(scores)}人)')
    return d


def main():
    rows, src = load()
    print(f'数据源：{src}，{len(rows)} 条记录，{len({r["name"] for r in rows})} 名驾驶员')

    ymax, cnt = yearly_max(rows)
    tsum = total_sum(rows)

    report('① 五年全量累计 + 原阈值(较低≤15/一般16-30/较大31-50/重大>50)',
           tsum, make_lvl((16, 31, 50)))
    report('② 自然年度累计 + 原阈值(较低≤15/一般16-30/较大31-50/重大>50)',
           ymax, make_lvl((16, 31, 50)))
    report('③ 自然年度累计 + 《附件1表1》记分口径(较低≤3/一般4-6/较大7-11/重大≥12)',
           ymax, make_lvl((4, 7, 11)))
    report('④ 自然年度累计 + 下调阈值(较低≤5/一般6-9/较大10-14/重大>14)',
           ymax, make_lvl((6, 10, 14)))

    print('\n=== 自然年度累计扣分明细（降序）===')
    for n, p in sorted(ymax.items(), key=lambda x: -x[1]):
        print(f'  {p:3d} 分  {n}  ({cnt[n]}条/五年累计{tsum[n]}分)')


if __name__ == '__main__':
    main()
