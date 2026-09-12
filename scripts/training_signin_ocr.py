#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
培训签到表 OCR（扫描件深度识别）

与 ocr_ledger.py 的分工：
  - ocr_ledger.py：通用培训记录表 / 数字 PDF 的逐人识别
  - 本脚本：扫描版「培训会议签到表」合集（一页一场），输出场次级结构：
      * 页分类：team(班组级 序号|姓名|签名) / company(公司级 序号|签名|备注) / photo(现场照片跳过)
      * 头部 6 字段(培训日期/培训地点/主持人/记录人/部门/参加人数) + 培训内容：值格「有无墨迹」检测
        —— 任一必填值格空 => 信息不完整；培训内容空 => 培训内容未填写（只打标签，不阻断）
      * 签到区：姓名格 OCR(印刷体) + 姓名格墨迹；签名格只判墨迹(手写连笔不 OCR)
  花名册匹配 / 在岗离职判定 / 班组与作业中心归属 / 应实缺计数由 Node 端连库完成。

输入：argv[1] = PDF 路径；argv[2] = 可选输出 JSON 路径
环境变量：
  SIGNIN_PAGES   只识别指定页(1-based，逗号分隔)，调试用，如 "1,4,13"
输出：单个 JSON 对象（UTF-8）
依赖：PyMuPDF(fitz)、opencv-python、numpy、pytesseract(chi_sim)
"""

import json
import os
import re
import sys

import cv2
import numpy as np

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ---------- Tesseract ----------
KNOWN_TESSERACT = [
    r"C:\Users\honey\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\app\tesseract\tesseract.exe",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
]


def resolve_tesseract_cmd():
    env = os.environ.get("TESSERACT_CMD")
    if env and os.path.exists(env):
        return env
    for p in KNOWN_TESSERACT:
        if os.path.exists(p):
            return p
    return None


_TESS = resolve_tesseract_cmd()
if _TESS:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = _TESS

SIGN_INK_TH = 0.02     # 签名格墨迹阈值（实测有签名 0.09~0.49，空格 0.00）
NAME_INK_TH = 0.02     # 姓名印刷墨迹阈值（实测有姓名 0.048~0.065，空格 0.00）
HEAD_INK_TH = 0.015    # 头部值格墨迹阈值（手写/印刷均高于此值，空格 ~0.00）
ZOOM = 3.0


# ---------- 渲染与网格 ----------
def render_page(page, zoom=ZOOM):
    import fitz
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)


def cluster(vals, gap=12):
    vals = sorted(int(v) for v in vals)
    groups = []
    for v in vals:
        if groups and v - groups[-1][-1] <= gap:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [int(round(float(np.mean(g)))) for g in groups]


def find_lines(gray):
    """全图表格线：返回 (横线ys, 竖线xs)。"""
    bw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                               cv2.THRESH_BINARY_INV, 15, 10)
    h, w = gray.shape
    hk = cv2.getStructuringElement(cv2.MORPH_RECT, (max(w // 18, 20), 1))
    horiz = cv2.morphologyEx(bw, cv2.MORPH_OPEN, hk)
    vk = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(h // 18, 20)))
    vert = cv2.morphologyEx(bw, cv2.MORPH_OPEN, vk)
    ys = cluster(np.where(horiz.sum(axis=1) > w * 0.35)[0])
    xs = cluster(np.where(vert.sum(axis=0) > h * 0.25)[0])
    return ys, xs


def find_vlines_region(gray, y0, y1, x0, x1):
    """在指定区域内检测竖线（头部表单列分隔，线短、全图检测易漏）。"""
    sub = gray[max(0, y0):y1, max(0, x0):x1]
    if sub.size == 0:
        return []
    bw = cv2.adaptiveThreshold(sub, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                               cv2.THRESH_BINARY_INV, 15, 10)
    h, w = sub.shape
    vk = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(h // 3, 15)))
    vert = cv2.morphologyEx(bw, cv2.MORPH_OPEN, vk)
    cols = np.where(vert.sum(axis=0) > h * 0.45)[0]
    return [c + max(0, x0) for c in cluster(cols)]


def find_vlines_band(gray, y0, y1, x0, x1):
    """单个头部 band 内的竖线（竖线只跨该 band ~60px，核长按 band 高度）。
    注意：手写签名的长竖笔也可能被检出，调用方需用 find_persistent_vlines 跨 band 过滤。"""
    sub = gray[max(0, y0):y1, max(0, x0):x1]
    if sub.size == 0:
        return []
    bw = cv2.adaptiveThreshold(sub, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                               cv2.THRESH_BINARY_INV, 15, 10)
    h, w = sub.shape
    vk = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(int(h * 0.65), 12)))
    vert = cv2.morphologyEx(bw, cv2.MORPH_OPEN, vk)
    cols = np.where(vert.sum(axis=0) > h * 0.55)[0]
    base = max(0, x0)
    return [c + base for c in cluster(cols)]


def find_persistent_vlines(gray, ys, s0, x_left, x_right):
    """头部字段区(ys[0]~ys[s0-1])的跨 band 持久竖线。
    真实表格列线贯穿 >=3 个 band；手写笔画（含签名长竖笔）只在 1~2 个 band 出现。
    返回排序后的列线 x 列表（含左右外框），标准布局为 5 条（标签|值|标签|值 四列）。"""
    hits = {}
    for i in range(0, max(s0 - 1, 0)):
        if i + 1 >= len(ys):
            break
        y0, y1 = ys[i], ys[i + 1]
        h = y1 - y0
        if h < 25 or h > 150:  # 排除培训内容大格（其值格无竖线）与过窄 band
            continue
        for x in find_vlines_band(gray, y0, y1, x_left, x_right):
            if x_left - 5 <= x <= x_right + 5:
                hits.setdefault(int(x), set()).add(i)
    xs_sorted = sorted(hits.keys())
    groups = []
    for x in xs_sorted:
        if groups and x - groups[-1][-1] <= 12:
            groups[-1].append(x)
        else:
            groups.append([x])
    pers = []
    for g in groups:
        bands = set()
        for x in g:
            bands |= hits[x]
        if len(bands) >= 3:
            pers.append(int(round(float(np.mean(g)))))
    return sorted(set([x_left] + pers + [x_right]))


def find_body_vlines(gray, ys, xs, s0, s1):
    """签到数据区竖线：逐数据行 band 检测后按「跨行持久性」过滤。
    真实列线贯穿几乎全部数据行；表头印刷字笔画（如"签名"表头）、手写签名长竖笔
    只在 1~2 个 band 出现。检测结果归属到最近的全图竖线 xs（±12px）计数。
    返回 10 条列线（3 栏 × 序号|姓名|签名 + 右外框）；证据不足返回 None 由调用方回退。"""
    x_left, x_right = xs[0], xs[-1]
    n_rows = s1 - s0
    hits = {int(x): 0 for x in xs}
    for i in range(s0, s1):
        for bx in find_vlines_band(gray, ys[i], ys[i + 1], x_left, x_right):
            best, bd = None, 12
            for x in xs:
                d = abs(bx - x)
                if d < bd:
                    best, bd = int(x), d
            if best is not None:
                hits[best] += 1
    th = max(4, int(n_rows * 0.35))
    kept = [x for x in xs if hits[int(x)] >= th]
    if len(kept) >= 10:
        return kept[:10]
    if len(kept) == 9:
        # 缺左/右外框（边框浅/断）时用全图边缘补
        if kept[0] - x_left > 30:
            return [x_left] + kept
        if x_right - kept[-1] > 30:
            return kept + [x_right]
    return None


def locate_signin_body(ys):
    """几何定位签到数据区：最长连续等距横线段(>=12行)。
    班组级表 17 行、公司级表人数少(12~16 行)，故阈值取 12。
    返回 (s0, s1) 数据区横线在 ys 中的下标区间（body = ys[s0:s1+1]），找不到返回 None。"""
    diffs = [ys[i + 1] - ys[i] for i in range(len(ys) - 1)]
    cand = [d for d in diffs if 60 < d < 130]
    if not cand:
        return None
    med = float(np.median(cand))
    lo, hi = med * 0.72, med * 1.3
    segs, cur = [], None
    for i, d in enumerate(diffs):
        if lo <= d <= hi:
            if cur is None:
                cur = i
        else:
            if cur is not None:
                segs.append((cur, i))
                cur = None
    if cur is not None:
        segs.append((cur, len(diffs)))
    segs = [s for s in segs if (s[1] - s[0]) >= 12]
    if not segs:
        return None
    return max(segs, key=lambda s: s[1] - s[0])


# ---------- 墨迹 / OCR ----------
def ink_ratio(cell, thresh=170, margin=8):
    """单元格墨迹占比（裁掉边线、2x 放大、二值化）。"""
    if cell is None or cell.size == 0:
        return 0.0
    g = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY) if len(cell.shape) == 3 else cell
    m = margin
    if g.shape[0] > 2 * m and g.shape[1] > 2 * m:
        g = g[m:-m, m:-m]
    g = cv2.resize(g, None, fx=2, fy=2)
    _, bw = cv2.threshold(g, thresh, 255, cv2.THRESH_BINARY_INV)
    return float((bw > 0).mean())


def ocr_text(cell, psm=7, nums=False):
    """单元格印刷体 OCR。nums=False 仅返回中文；nums=True 额外保留数字与日期符号
    （用于培训日期等手写/印刷数字格，lang 加 eng 提升数字识别）。"""
    if cell is None or cell.size == 0:
        return ""
    g = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY) if len(cell.shape) == 3 else cell
    g = cv2.resize(g, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    g = cv2.fastNlMeansDenoising(g, None, 10, 7, 21)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    try:
        # 环境仅安装 chi_sim 语言包（eng 缺失会加载失败）；数字/日期符号由白名单后处理保留
        txt = pytesseract.image_to_string(bw, lang="chi_sim", config=f"--oem 1 --psm {psm}")
    except Exception:
        return ""
    if nums:
        return re.sub(r"[^\u4e00-\u9fa50-9.\-/\u5e74\u6708\u65e5]", "", txt)
    return re.sub(r"[^\u4e00-\u9fa5]", "", txt)


def ocr_name(cell):
    """姓名格印刷体 OCR 重试：针对灰底格、红色手印/红笔侵入、签名墨迹干扰。
    默认 ocr_text 失败（<2 汉字）时调用；多种预处理 × 多 psm 投票，返回 2~4 汉字姓名。"""
    if cell is None or cell.size == 0:
        return ""
    from collections import Counter
    c = cell
    m = 4
    if c.shape[0] > 2 * m and c.shape[1] > 2 * m:
        c = c[m:-m, m:-m].copy()
    else:
        c = c.copy()
    # 去红色手印/红笔：R 显著高于 G、B 的像素置白
    if len(c.shape) == 3:
        b, g, r = cv2.split(c)
        red_mask = (r > g + 30) & (r > b + 30)
        c[red_mask] = (255, 255, 255)
        gray = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY)
    else:
        gray = c
    g3 = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    g3 = cv2.fastNlMeansDenoising(g3, None, 10, 7, 21)
    variants = []
    _, bw1 = cv2.threshold(g3, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(bw1)
    bw2 = cv2.adaptiveThreshold(g3, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY, 31, 15)
    variants.append(bw2)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    tophat = cv2.morphologyEx(g3, cv2.MORPH_TOPHAT, kernel)
    _, bw3 = cv2.threshold(tophat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(bw3)
    # 左裁 72%：姓名居左，右缘可能被相邻签名格的连笔/手印侵入，弃右保左
    w = g3.shape[1]
    left = g3[:, : int(w * 0.72)]
    _, bw4 = cv2.threshold(left, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(bw4)
    # 不降噪直接 OTSU（个别格降噪反而伤笔画）
    g_raw = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    _, bw5 = cv2.threshold(g_raw, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(bw5)
    # 任一变体首中即返回（避免 24 次 tesseract 子进程开销拖慢全量跑批/生产导入）
    for bw in variants:
        for psm in (7, 6):
            try:
                t = pytesseract.image_to_string(bw, lang="chi_sim", config=f"--oem 1 --psm {psm}")
            except Exception:
                continue
            t = re.sub(r"[^\u4e00-\u9fa5]", "", t or "")
            if 2 <= len(t) <= 4:
                return t
    return ""


def ocr_date(cell):
    """手写日期格专用：eng 模型 + 数字/日期符号白名单，多 psm 取数字段最齐全者。
    手写连笔日期用 chi_sim 易被中文模型干扰，返回原始文本由 Node 端 normalizeDate 容错解析。"""
    if cell is None or cell.size == 0:
        return ""
    g = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY) if len(cell.shape) == 3 else cell
    m = 6
    if g.shape[0] > 2 * m and g.shape[1] > 2 * m:
        g = g[m:-m, m:-m]
    g = cv2.resize(g, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    g = cv2.fastNlMeansDenoising(g, None, 10, 7, 21)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    best = ""
    best_n = -1
    for psm in (7, 8, 13, 6):
        try:
            # 环境仅装 chi_sim 语言包；白名单对中文模型输出的数字同样起过滤作用
            t = pytesseract.image_to_string(
                bw, lang="chi_sim",
                config=f"--oem 1 --psm {psm} -c tessedit_char_whitelist=0123456789./-年月日")
        except Exception:
            continue
        t = (t or "").strip()
        n = len(re.findall(r"\d+", t))
        if n > best_n:
            best, best_n = t, n
    return best


def has_ink_rows(cell, thresh=170, margin=10, min_ink_rows=6, row_density=0.015):
    """大格（培训内容/主题）有无字迹：按行投影统计墨迹行数。
    大格值常只写在上部、下方大片空白，整格墨迹均值会被稀释，故改用行投影。"""
    if cell is None or cell.size == 0:
        return False
    g = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY) if len(cell.shape) == 3 else cell
    m = margin
    if g.shape[0] > 2 * m and g.shape[1] > 2 * m:
        g = g[m:-m, m:-m]
    g = cv2.resize(g, None, fx=2, fy=2)
    _, bw = cv2.threshold(g, thresh, 255, cv2.THRESH_BINARY_INV)
    row_sum = (bw > 0).sum(axis=1)
    ink_rows = int((row_sum > bw.shape[1] * row_density).sum())
    return ink_rows >= min_ink_rows


def ocr_label_cell(cell):
    """标签格 OCR：先整块 psm=6；识别不出字段时按行投影裁出墨迹带再 psm=7。
    针对培训内容等大格标签（文字垂直居中、单行 psm=7 易漏）。"""
    t = ocr_text(cell, psm=6)
    if _field_of_label(t):
        return t
    g = cv2.cvtColor(cell, cv2.COLOR_BGR2GRAY) if len(cell.shape) == 3 else cell
    m = 6
    if g.shape[0] > 2 * m and g.shape[1] > 2 * m:
        g = g[m:-m, m:-m]
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    row_sum = (bw > 0).sum(axis=1)
    rows = np.where(row_sum > bw.shape[1] * 0.05)[0]
    if len(rows) >= 5:
        y0 = max(int(rows[0]) - 4, 0)
        y1 = min(int(rows[-1]) + 4, g.shape[0])
        band = cv2.cvtColor(g[y0:y1, :], cv2.COLOR_GRAY2BGR)
        t2 = ocr_text(band, psm=7)
        if t2:
            return t2
    return t


# ---------- 头部字段 ----------
# label 关键词（OCR 错字容忍：按优先级匹配稳定字）→ 字段 key
HEAD_FIELDS = [
    ("日期", "training_date"),
    ("地点", "location"),
    ("主持", "host"),
    ("记录", "recorder"),
    ("人数", "attendee_count"),
    ("参加", "attendee_count"),
    ("内容", "content"),
    ("主题", "topic"),
    ("部门", "dept"),
    ("单位", "dept"),
    ("部", "dept"),
]
REQUIRED_FIELDS = ["training_date", "location", "host", "recorder", "dept", "attendee_count"]


def _field_of_label(text):
    t = (text or "").replace(" ", "")
    for kw, key in HEAD_FIELDS:
        if kw in t:
            return key
    return None


def _header_label_fallback(img, gray, ys, xs, s0, set_field):
    """补漏路径：逐行 OCR 标签文字定位字段（标签印刷字识别失败时可能漏字段，
    仅作为几何定位的补充）。"""
    x_left = xs[0] if xs else 0
    x_right = xs[-1] if xs else gray.shape[1] - 1
    pv = find_persistent_vlines(gray, ys, s0, x_left, x_right)
    for i in range(0, s0):
        if i + 1 >= len(ys):
            break
        y0, y1 = ys[i], ys[i + 1]
        h = y1 - y0
        if h < 25:
            continue
        lines = sorted(set([x_left] + [x for x in pv if x_left - 5 <= x <= x_right + 5] + [x_right]))
        cells = [(lines[j], lines[j + 1]) for j in range(len(lines) - 1)
                 if lines[j + 1] - lines[j] >= 40]
        if len(cells) < 2:
            continue

        def label_at(ci):
            cx0, cx1 = cells[ci]
            return _field_of_label(ocr_label_cell(img[y0:y1, cx0:cx1]))

        if h > 150:
            key = label_at(0)
            if key:
                vx0, vx1 = cells[1][0], cells[-1][1]
                vcell = img[y0:y1, vx0:vx1]
                filled = has_ink_rows(vcell)
                text = ocr_text(vcell, psm=6) if filled else ""
                set_field(key, filled, text)
            continue

        key1 = label_at(0)
        key2 = label_at(2) if len(cells) >= 4 else None
        if key1 and key2:
            for key, ci in ((key1, 1), (key2, 3)):
                if ci >= len(cells):
                    continue
                vx0, vx1 = cells[ci]
                vcell = img[y0:y1, vx0:vx1]
                filled = ink_ratio(vcell, thresh=170, margin=8) > HEAD_INK_TH
                text = (ocr_date(vcell) if key == "training_date" else ocr_text(vcell, psm=7)) if filled else ""
                set_field(key, filled, text)
        elif key1:
            vx0, vx1 = cells[1][0], cells[-1][1]
            vcell = img[y0:y1, vx0:vx1]
            filled = ink_ratio(vcell, thresh=170, margin=8) > HEAD_INK_TH
            text = (ocr_date(vcell) if key1 == "training_date" else ocr_text(vcell, psm=6)) if filled else ""
            set_field(key1, filled, text)


def analyze_header(img, gray, ys, xs, s0):
    """头部区域字段值格墨迹检测。签到表为固定模板：
    3 个双字段行（培训日期/培训地点、主持人/记录人、部门/参加人数）+ 培训主题合并行
    + 培训内容大格。列边界取跨 band 持久竖线（A=标签|值、M=中线、B=右标签|值），
    行按 band 内竖线结构分类（含 3 条内部竖线=双字段行、1 条=合并行、h>150=内容大格），
    双字段行按自上而下固定顺序赋字段，不依赖标签 OCR，避免标签识别失败漏检字段。
    返回 {fields: {key: {filled, text}}, tags: [...], missing_fields: [...]}"""
    x_left = xs[0] if xs else 0
    x_right = xs[-1] if xs else gray.shape[1] - 1
    fields = {}

    def set_field(key, filled, text):
        prev = fields.get(key)
        if prev is None:
            fields[key] = {"filled": bool(filled), "text": text or ""}
        else:
            prev["filled"] = prev["filled"] or bool(filled)
            if text:
                prev["text"] = (prev["text"] + " " + text).strip()

    pv = find_persistent_vlines(gray, ys, s0, x_left, x_right)
    pv_inner = sorted(c for c in pv if c - x_left > 40 and x_right - c > 40)
    A = M = B = None
    if len(pv_inner) >= 3:
        A = pv_inner[0]
        B = pv_inner[-1]
        mids = pv_inner[1:-1]
        M = min(mids, key=lambda x: abs(x - (A + B) / 2.0)) if mids else (A + B) // 2

    # 收集头部 band（不含签到列头行 ys[s0-1]:ys[s0]），按内部竖线数分类
    dual, merged, big = [], [], None
    for i in range(0, max(s0 - 1, 0)):
        if i + 1 >= len(ys):
            break
        y0, y1 = ys[i], ys[i + 1]
        h = y1 - y0
        if h < 25:
            continue
        if h > 150:
            big = (y0, y1)
            continue
        raw = [x for x in find_vlines_band(gray, y0, y1, x_left, x_right)
               if x - x_left > 40 and x_right - x > 40]
        cl = []
        for x in sorted(raw):
            if not cl or x - cl[-1] > 12:
                cl.append(x)
        if len(cl) >= 3:
            dual.append((y0, y1))
        elif len(cl) == 1:
            merged.append((y0, y1, cl[0]))

    DUAL_KEYS = [("training_date", "location"), ("host", "recorder"), ("dept", "attendee_count")]
    if A is not None:
        dual.sort()
        for idx, (y0, y1) in enumerate(dual[:3]):
            k_left, k_right = DUAL_KEYS[idx]
            for key, vx0, vx1 in ((k_left, A, M), (k_right, B, x_right)):
                vcell = img[y0:y1, vx0:vx1]
                filled = ink_ratio(vcell, thresh=170, margin=8) > HEAD_INK_TH
                text = (ocr_date(vcell) if key == "training_date" else ocr_text(vcell, psm=7)) if filled else ""
                set_field(key, filled, text)
        for (y0, y1, ax) in merged:
            vcell = img[y0:y1, ax:x_right]
            filled = ink_ratio(vcell, thresh=170, margin=8) > HEAD_INK_TH
            text = ocr_text(vcell, psm=7) if filled else ""
            set_field("topic", filled, text)
        if big is not None:
            y0, y1 = big
            vcell = img[y0:y1, A:x_right]
            filled = has_ink_rows(vcell)
            text = ocr_text(vcell, psm=6) if filled else ""
            set_field("content", filled, text)

    # 补漏：几何证据不足或仍有必填字段缺失时，用标签 OCR 路径复检
    missing = [k for k in REQUIRED_FIELDS if not fields.get(k, {}).get("filled")]
    if A is None or missing or not fields.get("content", {}).get("filled"):
        _header_label_fallback(img, gray, ys, xs, s0, set_field)

    tags = []
    missing = [k for k in REQUIRED_FIELDS if not fields.get(k, {}).get("filled")]
    if missing:
        tags.append("信息不完整")
    if not fields.get("content", {}).get("filled"):
        tags.append("培训内容未填写")
    return {"fields": fields, "tags": tags, "missing_fields": missing,
            "columns": pv}


# ---------- 单页分析 ----------
def analyze_page(page, pno):
    img = render_page(page)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ys, xs = find_lines(gray)
    result = {"page": pno, "kind": "unknown", "tags": [], "persons": [], "header": {}}

    # 照片/非表格页：线太少
    if len(ys) < 8 or len(xs) < 6:
        result["kind"] = "photo"
        return result

    seg = locate_signin_body(ys)
    if not seg:
        result["kind"] = "photo"
        return result
    s0, s1 = seg
    body = ys[s0:s1 + 1]
    n_rows = len(body) - 1
    if n_rows < 12 or len(xs) < 9:
        result["kind"] = "photo"
        return result

    # ---- 班组/公司判定 ----
    kind = "company"
    # 依据1：表头行 OCR（数据区上方第一条带）
    if s0 - 1 >= 0:
        hdr_cell = img[ys[s0 - 1]:ys[s0], xs[0]:xs[-1]]
        hdr_txt = ocr_text(hdr_cell, psm=6).replace(" ", "")
        if "姓名" in hdr_txt:
            kind = "team"
        elif "备注" in hdr_txt:
            kind = "company"
        else:
            kind = None  # 待依据2
    if kind is None:
        # 依据2：姓名列(每组第2列)前5行，>=2 格 OCR 出 2~4 汉字 => 班组级
        hits = 0
        for r in range(min(5, n_rows)):
            for g in range(3):
                if g * 3 + 2 >= len(xs):
                    continue
                c = img[body[r]:body[r + 1], xs[g * 3 + 1]:xs[g * 3 + 2]]
                if ink_ratio(c, thresh=150) > NAME_INK_TH:
                    t = ocr_text(c)
                    if 2 <= len(t) <= 4:
                        hits += 1
        kind = "team" if hits >= 2 else "company"
    result["kind"] = kind

    # ---- 头部字段（两类表都做完整性检查）----
    try:
        result["header"] = analyze_header(img, gray, ys, xs, s0)
        result["tags"] = list(result["header"].get("tags", []))
    except Exception as e:
        result["header"] = {"fields": {}, "tags": [], "error": str(e)}

    # ---- 签到区竖线：数据区逐行持久性检测（过滤表头印刷字/手写长竖笔假线）----
    body_xs = find_body_vlines(gray, ys, xs, s0, s1)
    if body_xs is None:
        # 回退：表头行 band 检测 → 全图竖线
        body_xs = find_vlines_band(gray, ys[s0 - 1], ys[s0], xs[0], xs[-1])
        if len(body_xs) < 9:
            body_xs = xs
    n_groups = min(3, (len(body_xs) - 1) // 3)

    # ---- 签到区逐格 ----
    # 班组级每组 序号|姓名|签名（签名=组内第3列）；公司级每组 序号|签名|备注（签名=组内第2列，无印刷姓名）
    persons = []
    for r in range(n_rows):
        y0, y1 = body[r], body[r + 1]
        for g in range(n_groups):
            if g * 3 + 3 >= len(body_xs):
                break
            x0, x1, x2, x3 = (body_xs[g * 3], body_xs[g * 3 + 1],
                              body_xs[g * 3 + 2], body_xs[g * 3 + 3])
            if kind == "team":
                name_cell = img[y0:y1, x1:x2]
                sign_cell = img[y0:y1, x2:x3]
                name_ink = ink_ratio(name_cell, thresh=150)
                sign_ink = ink_ratio(sign_cell, thresh=170)
                has_name = name_ink > NAME_INK_TH
                signed = sign_ink > SIGN_INK_TH
                name_ocr = ocr_text(name_cell) if has_name else ""
                # 默认 OCR 失败（灰底/红印/签名墨迹干扰）时多预处理重试
                if has_name and len(re.sub(r"[^\u4e00-\u9fa5]", "", name_ocr)) < 2:
                    retry = ocr_name(name_cell)
                    if retry:
                        name_ocr = retry
                persons.append({
                    "seq": g * n_rows + r + 1,
                    "row": r + 1, "group": g + 1,
                    "name_ocr": name_ocr,
                    "name_ink": round(name_ink, 4),
                    "sign_ink": round(sign_ink, 4),
                    "has_printed_name": has_name,
                    "signed": signed,
                })
            else:
                # 公司级：只测签名格墨迹（应到/实到由 Node 端按墨迹计数，不做人员比对）
                sign_cell = img[y0:y1, x1:x2]
                sign_ink = ink_ratio(sign_cell, thresh=170)
                persons.append({
                    "seq": g * n_rows + r + 1,
                    "row": r + 1, "group": g + 1,
                    "name_ocr": "",
                    "name_ink": 0.0,
                    "sign_ink": round(sign_ink, 4),
                    "has_printed_name": False,
                    "signed": sign_ink > SIGN_INK_TH,
                })
    result["persons"] = persons
    return result


def main(argv):
    import fitz
    pdf_path = argv[1]
    out_path = argv[2] if len(argv) >= 3 else None
    only_pages = None
    if os.environ.get("SIGNIN_PAGES"):
        only_pages = {int(x) for x in os.environ["SIGNIN_PAGES"].split(",") if x.strip().isdigit()}

    doc = fitz.open(pdf_path)
    total_pages = doc.page_count

    # 探测模式：只分析前 2 页，快速判断 PDF 是否为培训签到表合集（供 Node 端选脚本）
    if os.environ.get("SIGNIN_PROBE"):
        kinds = []
        for idx in range(min(2, total_pages)):
            try:
                kinds.append(analyze_page(doc[idx], idx + 1)["kind"])
            except Exception:
                kinds.append("unknown")
        doc.close()
        is_signin = any(k in ("team", "company") for k in kinds)
        print(json.dumps({"ok": True, "mode": "signin_probe",
                          "isSignin": is_signin, "kinds": kinds}, ensure_ascii=False))
        return 0

    sessions = []
    counts = {"photo": 0, "team": 0, "company": 0, "unknown": 0}
    for idx in range(total_pages):
        pno = idx + 1
        if only_pages is not None and pno not in only_pages:
            continue
        try:
            sess = analyze_page(doc[idx], pno)
        except Exception as e:
            sess = {"page": pno, "kind": "unknown", "tags": [], "persons": [],
                    "header": {"fields": {}, "tags": [], "error": str(e)}}
        sessions.append(sess)
        counts[sess["kind"]] = counts.get(sess["kind"], 0) + 1
    doc.close()

    payload = {
        "ok": True,
        "mode": "signin_ledger",
        "sessions": sessions,
        "meta": {
            "totalPages": total_pages if not only_pages else len(sessions),
            "scannedPages": len(sessions),
            "photoPages": counts["photo"],
            "teamPages": counts["team"],
            "companyPages": counts["company"],
            "unknownPages": counts["unknown"],
        },
    }
    text = json.dumps(payload, ensure_ascii=False)
    if out_path:
        with open(out_path, "w", encoding="utf-8") as fp:
            fp.write(text)
    print(text)
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "message": "用法: training_signin_ocr.py <pdf> [out.json]"}, ensure_ascii=False))
        sys.exit(2)
    sys.exit(main(sys.argv))
