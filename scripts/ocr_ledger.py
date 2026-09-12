#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
培训台账 OCR 识别脚本（本地 Tesseract，中文 chi_sim）

用途：把「培训记录」导入功能收到的 PDF / 扫描件图片识别为结构化表格行，
供后端生成 Excel 或直接确认入库。

输入（命令行参数）：
  argv[1] : 待识别文件路径（.pdf / .png / .jpg / .jpeg / .bmp / .webp）
  argv[2] : 可选的 JSON 输出路径（缺省则打印到 stdout）

输出：单个 JSON 对象（UTF-8）
  {
    "ok": true|false,
    "sourceType": "pdf_text" | "pdf_scan" | "image",
    "message": "提示文字",
    "columns": ["姓名","部门",...],
    "rows": [ { "name": "张三", "dept": "运维部", ... }, ... ]
  }

识别策略：
- 数字型 PDF：优先用 PyMuPDF 直接抽取文本（准确率最高）。
- 扫描 PDF / 图片：渲染为位图后
    a) 先检测表格竖线/横线（规整表格“扫描件”常见，有网格线时识别最准）：
       按线界重建行列，词按坐标归入单元格，表头词映射到培训台账字段；
    b) 无网格线时，回退按词的 top/left 聚类重建（best-effort）。
- 字段映射表见 HEADER_ALIASES；识别结果为尽力而为，入库前请人工核对预览。

依赖：pytesseract、PyMuPDF(fitz)、Pillow；系统需装 Tesseract 且含 chi_sim。
用法：python ocr_ledger.py <file> [out.json]
"""

import json
import os
import re
import sys
import time

# Windows 下子进程 stdout 默认按本地代码页(GBK)编码，Node 按 UTF-8 读取会全部变乱码(U+FFFD)，
# 导致姓名被 cleanRowText 清空、去重塌缩成极少的"已签到数"。这里强制 stdout 用 UTF-8 输出。
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ---------- Tesseract 二进制路径解析 ----------
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


# ---------- 表头别名 → 培训台账字段 ----------
# value: (输出列名, snake 字段名)
HEADER_ALIASES = {
    "姓名": ("姓名", "name"), "培训人员": ("姓名", "name"), "受训人": ("姓名", "name"),
    "员工姓名": ("姓名", "name"), "名字": ("姓名", "name"),
    "部门": ("部门", "dept"), "所属部门": ("部门", "dept"),
    "岗位": ("岗位", "position"), "职位": ("岗位", "position"), "工种": ("岗位", "position"),
    "培训类型": ("培训类型", "training_type"), "类型": ("培训类型", "training_type"),
    "培训日期": ("培训日期", "training_date"), "日期": ("培训日期", "training_date"),
    "培训时间": ("培训日期", "training_date"),
    "时长": ("时长", "duration_minutes"), "时长(分钟)": ("时长", "duration_minutes"),
    "培训时长": ("时长", "duration_minutes"), "分钟": ("时长", "duration_minutes"),
    "培训内容": ("培训内容", "content"), "内容": ("培训内容", "content"), "课时": ("培训内容", "content"),
    "成绩": ("成绩", "score"), "分数": ("成绩", "score"), "考核成绩": ("成绩", "score"),
    "结果": ("结果", "result"), "培训结果": ("结果", "result"), "考核结果": ("结果", "result"),
    "结论": ("结果", "result"), "是否合格": ("结果", "result"),
    "备注": ("备注", "remark"), "说明": ("备注", "remark"),
    "培训人": ("培训人", "trainer"), "讲师": ("培训人", "trainer"), "教师": ("培训人", "trainer"),
}


def norm_key(s):
    return re.sub(r"\s+", "", (s or ""))


def header_field(s):
    key = norm_key(s)
    if key in HEADER_ALIASES:
        return HEADER_ALIASES[key]
    return None


def collapse_spaces(s):
    if not s:
        return s
    out = re.sub(r"\s+", " ", s)
    out = re.sub(
        r"(?<=[\u4e00-\u9fff，。；：（）]) (?=[\u4e00-\u9fff，。；：（）])",
        "", out)
    return out.strip()


def is_cjk(text):
    return any("\u4e00" <= ch <= "\u9fff" for ch in (text or ""))


# ---------- 图像预处理与格子线检测 ----------
def _scaled_img(img):
    img = img.convert("RGB")
    w, h = img.size
    if max(w, h) < 1600:
        scale = 2.2 if max(w, h) < 800 else 1.6
        img = img.resize((int(w * scale), int(h * scale)))
    return img


def _gray(img):
    return img.convert("L")


def _line_positions(gray, axis, band_fraction=0.6, ratio=0.6, min_gap=12):
    """检测表格格子线位置（竖线 axis='v' / 横线 axis='h'）。
    返回排序去重后的线坐标列表（含外边框）。"""
    w, h = gray.size
    if axis == "v":
        length, thickness = h, w
        start = int(h * (1 - band_fraction) / 2)
        end = h - start
    else:
        length, thickness = w, h
        start = int(w * (1 - band_fraction) / 2)
        end = w - start

    px = gray.load()
    dark_thresh = 130
    positions = []
    for i in range(thickness):
        cnt = 0
        if axis == "v":
            for j in range(start, end):
                if px[i, j] < dark_thresh:
                    cnt += 1
        else:
            for j in range(start, end):
                if px[j, i] < dark_thresh:
                    cnt += 1
        if cnt >= (end - start) * ratio:
            positions.append(i)
    # 聚合成线（连片位置取中位）
    lines = []
    if not positions:
        return lines
    run = [positions[0]]
    for p in positions[1:]:
        if p - run[-1] <= min_gap:
            run.append(p)
        else:
            lines.append(run[len(run) // 2])
            run = [p]
    lines.append(run[len(run) // 2])
    # 去掉过密（同一格线）、保留足够间距的线
    uniq = []
    for x in lines:
        if not uniq or x - uniq[-1] >= 30:
            uniq.append(x)
        else:
            # 取两条可能同格线的中间值：若间隔很小(<30)视为同一格线，取均值
            uniq[-1] = (uniq[-1] + x) // 2
    return uniq


def _remove_lines(rgb_img, vlines, hlines, tol=3):
    """把检测到的表格线在原图上擦白（仅影响 OCR 的文本识别，坐标不变）。"""
    from PIL import ImageDraw
    out = rgb_img.copy()
    d = ImageDraw.Draw(out)
    w, h = out.size
    white = (255, 255, 255)
    for x in vlines:
        d.line([(max(0, x - tol), 0), (max(0, x - tol), h)], fill=white, width=2 * tol + 1)
    for y in hlines:
        d.line([(0, max(0, y - tol)), (w, max(0, y - tol))], fill=white, width=2 * tol + 1)
    return out


def _dominant_lines(lines, ratio_lo=0.5, ratio_hi=2.0, min_cnt=3):
    """从候选线坐标中挑出“近似等距的主导均匀簇”（表格真线）。

    照片/插图的伪线往往间距不均、与主导间距明显不一致，会被此处的贪心
    “均匀子序列”排除；返回 True 表示 successfully 收敛（得到可用外框）。
    返回 (result_lines, ok)。
    """
    lines = sorted(lines)
    n = len(lines)
    if n < min_cnt:
        return lines, False
    best = None
    # 以每个起点尝试向后贪心扩展，使相邻线间距落在已累积平均间距的区间内
    for start in range(n - 1):
        seq = [lines[start]]
        last = lines[start]
        for j in range(start + 1, n):
            d = lines[j] - last
            if len(seq) == 1:
                # 尚无比对基线，直接接纳（仅需比最小格距宽）
                if d >= 12:
                    seq.append(lines[j])
                    last = lines[j]
                continue
            avg = (last - seq[0]) / (len(seq) - 1)
            if ratio_lo * avg <= d <= ratio_hi * avg:
                seq.append(lines[j])
                last = lines[j]
        if best is None or len(seq) > len(best):
            best = seq
    if best is None:
        return lines, False
    # 保底①：收敛后若剩余线太少（不成表格），回退原始
    if len(best) < 2:
        return lines, False
    return best, True


def _table_bbox(vlines, hlines, w, h, pad=0):
    """由检测到的格子线计算表格外框 (left, top, right, bottom)。
    先做主导均匀簇收敛，剔除照片/插图导致的孤立伪线，使外框贴合真实表格；
    收敛后若线过少或跨度萎缩明显则回退原始线避免误裁。
    pad 为外扩像素，避免切掉表头贴线的文字。返回 None 表示无法确定表格范围。"""
    if not vlines or not hlines:
        return None
    cv, v_ok = _dominant_lines(vlines, ratio_lo=0.7)
    ch, h_ok = _dominant_lines(hlines, ratio_lo=0.5)
    span_v_orig = max(vlines) - min(vlines)
    span_h_orig = max(hlines) - min(hlines)
    if not v_ok or not h_ok or not cv or not ch:
        return None
    # 保底②：收敛导致跨度显著萎缩（< 原始 55%），说明照片线与真线混叠，回退原始线
    span_v_new = max(cv) - min(cv)
    span_h_new = max(ch) - min(ch)
    if span_v_new < span_v_orig * 0.55 or span_h_new < span_h_orig * 0.55:
        cv, ch = vlines, hlines
    left = max(0, min(cv) - pad)
    right = min(w - 1, max(cv) + pad)
    top = max(0, min(ch) - pad)
    bottom = min(h - 1, max(ch) + pad)
    if right - left < 20 or bottom - top < 20:
        return None
    return (left, top, right, bottom)


def _extract_table(img):
    """检测表格外框并按外框裁剪，剔除表格外的照片/插图。
    返回 (working_img, vlines, hlines)；坐标在裁剪后重新检测，保持一致。"""
    gray = _gray(img)
    vlines = _line_positions(gray, "v")
    hlines = _line_positions(gray, "h")
    w, h = gray.size
    box = _table_bbox(vlines, hlines, w, h)
    if box is None:
        return img, vlines, hlines
    crop = img.crop(box)
    if crop.size[0] < 40 or crop.size[1] < 40:
        return img, vlines, hlines
    g2 = _gray(crop)
    v2, _ = _dominant_lines(_line_positions(g2, "v"), ratio_lo=0.7)
    h2, _ = _dominant_lines(_line_positions(g2, "h"), ratio_lo=0.5)
    return crop, v2, h2


# ---------- OCR 词级输出 ----------
def ocr_words(img):
    import pytesseract
    tcmd = resolve_tesseract_cmd()
    if tcmd:
        pytesseract.pytesseract.tesseract_cmd = tcmd
    data = pytesseract.image_to_data(
        img, lang="chi_sim", config="--oem 1 --psm 6",
        output_type=pytesseract.Output.DICT,
    )
    words = []
    n = len(data.get("text", []))
    for i in range(n):
        text = (data["text"][i] or "").strip()
        if not text:
            continue
        try:
            conf = float(data.get("conf", [0] * n)[i])
        except (TypeError, ValueError):
            conf = 0
        if conf < 20:
            continue
        words.append({
            "text": text,
            "left": int(data["left"][i]),
            "top": int(data["top"][i]),
            "width": int(data["width"][i]),
            "height": int(data["height"][i]),
        })
    return words


def _word_center(w):
    return w["left"] + w["width"] / 2


def _word_vcenter(w):
    return w["top"] + w["height"] / 2


# ---------- 有网格线的表格重建 ----------
def build_grid_table(words, vlines, hlines):
    """按竖线/横线把词归入单元格，重建表头与数据行。"""
    cols = []
    for i in range(len(vlines) - 1):
        a, b = vlines[i], vlines[i + 1]
        if b - a >= 30:
            cols.append({"lo": a, "hi": b, "mid": (a + b) / 2})
    rows_b = []
    for i in range(len(hlines) - 1):
        a, b = hlines[i], hlines[i + 1]
        if b - a >= 20:
            rows_b.append({"lo": a, "hi": b, "mid": (a + b) / 2})

    def cell_of(w):
        # 找到词所在的 (行带, 列带)
        ci = None
        for idx, c in enumerate(cols):
            if c["lo"] - 4 <= _word_center(w) <= c["hi"] + 4:
                ci = idx
                break
        ri = None
        for idx, rb in enumerate(rows_b):
            if rb["lo"] - 4 <= _word_vcenter(w) <= rb["hi"] + 4:
                ri = idx
                break
        return (ri, ci)

    # 聚合：collections.defaultdict by (ri, ci)
    cells = {}
    for w in words:
        ri, ci = cell_of(w)
        if ri is None or ci is None:
            continue
        cells.setdefault((ri, ci), []).append(w)
    cell_text = {}
    for k, ws in cells.items():
        ws_sorted = sorted(ws, key=lambda x: (x["top"], x["left"]))
        cell_text[k] = collapse_spaces(" ".join(w["text"] for w in ws_sorted))

    # 表头行：取最靠顶且含已知表头的行带
    header_ri = None
    for (ri, ci) in cell_text:
        if header_field(cell_text[(ri, ci)]):
            if header_ri is None or ri < header_ri:
                header_ri = ri
    if header_ri is None:
        header_ri = min(rows_b[0]["lo"], *(k[0] for k in cell_text)) if cell_text else 0

    # 列定义：遍历该表头行每个列带
    col_defs = []  # list of (col_idx, field, label)
    for ci, c in enumerate(cols):
        txt = collapse_spaces(cell_text.get((header_ri, ci), ""))
        m = header_field(txt)
        if m:
            col_defs.append({"ci": ci, "field": m[1], "label": m[0]})

    # 数据行：表头行以下的每个行带且排除表头；无横线时退化为对行带处理
    data = []
    ris = sorted({k[0] for k in cell_text if k[0] is not None})
    for ri in ris:
        if ri == header_ri:
            continue
        row_obj = {}
        for cd in col_defs:
            v = collapse_spaces(cell_text.get((ri, cd["ci"]), ""))
            if v:
                row_obj[cd["field"]] = v
        if row_obj:
            data.append(row_obj)

    columns = [cd["label"] for cd in col_defs]
    return columns, data


# ---------- 按格 OCR（有网格线时精度最高） ----------
def _band_cols(vlines):
    cols = []
    for i in range(len(vlines) - 1):
        a, b = vlines[i], vlines[i + 1]
        if b - a >= 24:
            cols.append({"lo": a, "hi": b})
    return cols


def _band_rows(hlines):
    rows = []
    for i in range(len(hlines) - 1):
        a, b = hlines[i], hlines[i + 1]
        if b - a >= 16:
            rows.append({"lo": a, "hi": b})
    return rows


def ocr_single_line(img, box, pad=2):
    """裁剪单元格并用 psm 7（单行）识别，返回清洗后文本或 ''。"""
    import pytesseract
    w, h = img.size
    l = max(0, box["lo"] + pad)
    r = min(w, box["hi"] - pad)
    t = max(0, box["lo_y"] + pad)
    b = min(h, box["hi_y"] - pad)
    if r - l < 4 or b - t < 4:
        return ""
    cell = img.crop((l, t, r, b)).convert("L")
    # 单行文本若太窄小则放大
    cw, ch = cell.size
    if cw < 60 or ch < 24:
        scale = max(1.5, 80.0 / max(1, cw))
        cell = cell.resize((int(cw * scale), int(ch * scale)))
    tcmd = resolve_tesseract_cmd()
    if tcmd:
        pytesseract.pytesseract.tesseract_cmd = tcmd
    try:
        txt = pytesseract.image_to_string(
            cell, lang="chi_sim", config="--oem 1 --psm 7")
    except Exception:
        return ""
    return collapse_spaces(txt)


def ocr_cells_to_table(img, vlines, hlines):
    """按格子线逐单元格识别，重建表头与数据行。"""
    cols = _band_cols(vlines)
    rows_b = _band_rows(hlines)
    if len(cols) < 2 or len(rows_b) < 2:
        return [], []
    cell_text = {}
    for ri, rb in enumerate(rows_b):
        for ci, c in enumerate(cols):
            txt = ocr_single_line(img, {"lo": c["lo"], "hi": c["hi"],
                                        "lo_y": rb["lo"], "hi_y": rb["hi"]})
            if txt.strip():
                cell_text[(ri, ci)] = txt

    # 表头行：含已知表头单元格最多的行带
    header_ri = None
    header_score = -1
    for ri, rb in enumerate(rows_b):
        score = sum(1 for ci in range(len(cols)) if header_field(cell_text.get((ri, ci), "")))
        if score > header_score:
            header_score = score
            header_ri = ri
    if header_ri is None or header_score <= 0:
        return [], []

    col_defs = []
    for ci in range(len(cols)):
        m = header_field(cell_text.get((header_ri, ci), ""))
        if m:
            col_defs.append({"ci": ci, "field": m[1], "label": m[0]})
    if not col_defs:
        return [], []

    data = []
    for ri, rb in enumerate(rows_b):
        if ri == header_ri:
            continue
        obj = {}
        for cd in col_defs:
            txt = collapse_spaces(cell_text.get((ri, cd["ci"]), "")).strip("| ")
            if txt:
                obj[cd["field"]] = txt
        if obj:
            data.append(obj)
    return [cd["label"] for cd in col_defs], data


# ---------- 无网格线：按词聚类（best-effort） ----------
def cluster_rows(words, top_tol=12):
    words = sorted(words, key=lambda w: (w["top"], w["left"]))
    rows = []
    cur = []
    cur_top = None
    for w in words:
        if cur_top is None or abs(w["top"] - cur_top) <= top_tol:
            cur.append(w)
            if cur_top is None:
                cur_top = w["top"]
            else:
                cur_top = min(cur_top, w["top"])
        else:
            rows.append(sorted(cur, key=lambda x: x["left"]))
            cur = [w]
            cur_top = w["top"]
    if cur:
        rows.append(sorted(cur, key=lambda x: x["left"]))
    return rows


def merge_into_cells(words):
    if not words:
        return []
    words = sorted(words, key=lambda w: w["left"])
    cells = []
    for w in words:
        if cells and w["left"] - cells[-1]["right"] <= 14:
            cells[-1]["text"] += (" " if cells[-1]["text"] else "") + w["text"]
            cells[-1]["right"] = w["left"] + w["width"]
            cells[-1]["cx"] = (cells[-1]["left"] + cells[-1]["right"]) / 2
        else:
            cells.append({"text": w["text"], "left": w["left"],
                          "right": w["left"] + w["width"],
                          "cx": w["left"] + w["width"] / 2})
    return cells


def build_anchor_table(words):
    rows = cluster_rows(words)
    header_row = None
    header_score = 0
    for r in rows:
        merged = merge_into_cells(r)
        score = sum(1 for c in merged if header_field(c["text"]))
        if score > header_score:
            header_score = score
            header_row = merged
    if not header_row or header_score == 0:
        return [], []
    anchors = []
    for c in header_row:
        m = header_field(c["text"])
        if m:
            anchors.append({"field": m[1], "label": m[0], "cx": c["cx"]})
    anchors.sort(key=lambda a: a["cx"])
    data = []
    for r in rows:
        merged = merge_into_cells(r)
        if any(header_field(c["text"]) for c in merged) and \
           sum(1 for c in merged if header_field(c["text"])) / max(1, len(merged)) > 0.5:
            continue
        obj = {}
        for c in merged:
            anchor = min(anchors, key=lambda a: abs(a["cx"] - c["cx"]))
            if abs(anchor["cx"] - c["cx"]) > 90:
                continue  # 离所有列锚点太远，可能是表外文字，跳过
            obj[anchor["field"]] = collapse_spaces(obj.get(anchor["field"], "") + " " + c["text"]) if anchor["field"] in obj else collapse_spaces(c["text"])
        if obj:
            data.append(obj)
    return [a["label"] for a in anchors], data


def _form_from_words(words):
    """把 OCR 词流按行聚类成文本行，尝试按「表单式 label:value」解析。"""
    lines = []
    for r in cluster_rows(words):
        cells = merge_into_cells(r)
        line = collapse_spaces(" ".join(c["text"] for c in cells))
        if line.strip():
            lines.append(line)
    return _try_form_table(lines)


def _word_lines(words):
    """把 OCR 词流按行聚类成清洗后的文本行列表（供签到表头部解析复用）。"""
    lines = []
    for r in cluster_rows(words):
        cells = merge_into_cells(r)
        line = collapse_spaces(" ".join(c["text"] for c in cells))
        if line.strip():
            lines.append(line)
    return lines


def _try_signin(words):
    """签到表判定：头部解析出 ≥3 个字段且有人名时可识别为签到表。"""
    header = _parse_signin_header(_word_lines(words))
    if not header or len(header) < 3:
        return None
    attendees = _extract_signin_attendees(words)
    if not attendees:
        return None
    return header, attendees


# ---------- 文件级处理 ----------
def handle_image(image_path):
    from PIL import Image
    img = Image.open(image_path)
    img = _scaled_img(img)
    # 照片跳过：检测表格外框并按外框裁剪，表格外的照片/插图不参与识别
    img, vlines, hlines = _extract_table(img)

    words = ocr_words(_remove_lines(img, vlines, hlines) if len(vlines) >= 2 else img)
    # 签到表优先判定（表单头 + 姓名签到区）
    signin = _try_signin(words)
    if signin:
        header, attendees = signin
        return _signin_result(header, attendees, "image")

    if len(vlines) >= 2 and len(hlines) >= 1:
        cols, rows = ocr_cells_to_table(img, vlines, hlines)
        if cols and rows:
            return {"sourceType": "image", "columns": cols, "rows": rows,
                    "mode": "grid"}
    cols, rows = build_anchor_table(words)
    if not rows:
        # 无网格线且非表头式 → 回退表单式（label:value）识别
        cols, rows = _form_from_words(words)
        if rows:
            return {"sourceType": "image", "columns": cols, "rows": rows,
                    "mode": "form"}
    return {"sourceType": "image", "columns": cols, "rows": rows, "mode": "anchor"}


# 扫描 PDF 页分类：横向/超长手机截图/高密度图均为「照片页」，OCR 无意义 → 跳过。
# 返回 'photo'（跳过）或 'signin'（签到表候选，继续识别）。
def _classify_scan_page(page, _fitz):
    from PIL import Image as _PILImage
    w, h = page.rect.width, page.rect.height
    if w > h * 1.05:          # 横向现场照片
        return "photo"
    if w / h < 0.55:          # 超长竖版手机截图（打卡照片）
        return "photo"
    pix = page.get_pixmap(matrix=_fitz.Matrix(30 / 72, 30 / 72), alpha=False)
    img = _PILImage.open(_pil_bytesio(pix)).convert("L")
    W, H = img.size
    if W < 6 or H < 6:
        return "photo"
    px = img.load()
    step = 4
    dark = 0
    for y in range(0, H, step):
        for x in range(0, W, step):
            if px[x, y] < 120:
                dark += 1
    total = ((H // step) + 1) * ((W // step) + 1)
    if dark / total > 0.15:   # 高密度（密集文档照/打卡照）
        return "photo"
    return "signin"


def handle_pdf(file_path):
    # 优先 import pymupdf：import fitz 会在 stdout 打印弃用警告，
    # 污染输出导致后端 JSON 解析失败。
    try:
        import pymupdf as fitz
    except Exception:
        import fitz
    from PIL import Image as _PILImage
    doc = fitz.open(file_path)
    total_pages = doc.page_count
    source_type = "pdf_text"
    all_rows = []
    all_cols = []
    signin_headers = None
    signin_attendees = []
    signin_page_count = 0
    signin_source = None
    photo_skipped = 0
    # 扫描件整体识别时间预算（秒）：照片页会先被快速跳过，此预算主要约束签到表页的逐格 OCR，
    # 超过预算则停止处理剩余页并上报「未识别页数」，避免超大归档无限拖慢后端。
    scan_budget = float(os.environ.get("OCR_SCAN_BUDGET", "1800"))
    scan_deadline = time.time() + scan_budget
    skipped_tail = 0
    for page in doc:
        text = (page.get_text("text") or "").strip()
        if is_cjk(text) and len(re.sub(r"\s+", "", text)) > 20:
            # 数字型 PDF：优先判定签到表（表头 label:value 分行 + 姓名/签名签到区）
            st = _try_signin_text(text)
            if st:
                header, attendees = st
                if signin_headers is None:
                    signin_headers = header
                signin_page_count += 1
                if signin_source is None:
                    signin_source = "pdf_signin_text"
                for n in attendees:
                    if n not in signin_attendees:
                        signin_attendees.append(n)
                continue
            # 非签到表 → 按行解析（每行空格分隔，映射其余列）
            cols, rows = _parse_text_table(text)
            source_type = "pdf_text"
        else:
            # 扫描页：先低分辨率快速分类，跳过照片/打卡页
            if _classify_scan_page(page, fitz) == "photo":
                photo_skipped += 1
                continue
            if time.time() > scan_deadline:
                skipped_tail += 1
                continue
            pix = page.get_pixmap(matrix=fitz.Matrix(300 / 72, 300 / 72), alpha=False)
            img = _PILImage.open(_pil_bytesio(pix))
            img = _scaled_img(img)
            # 照片跳过：检测表格外框并按外框裁剪，表格外的照片/插图不参与识别
            img, vlines, hlines = _extract_table(img)
            words = ocr_words(_remove_lines(img, vlines, hlines) if len(vlines) >= 2 else img)
            # 签到表优先判定：跨页聚合（不再“遇首张即返回”而丢弃其余页面）
            signin = _try_signin(words)
            if signin:
                header, attendees = signin
                if signin_headers is None:
                    signin_headers = header
                signin_page_count += 1
                if signin_source is None:
                    signin_source = "pdf_scan"
                for n in attendees:
                    if n not in signin_attendees:
                        signin_attendees.append(n)
                continue
            if len(vlines) >= 2:
                cols, rows = ocr_cells_to_table(img, vlines, hlines)
            else:
                rows = []
                cols = []
            if not rows:
                cols, rows = build_anchor_table(words)
                if not rows:
                    cols, rows = _form_from_words(words)
            source_type = "pdf_scan"
        if cols:
            all_cols = cols
        all_rows.extend(rows)
    doc.close()
    # 整份 PDF 为签到表合集（≥1 页签到表头 + 聚合签到名单）→ 进入签到表模式
    signin_mode = False
    if signin_headers is not None and signin_attendees:
        res = _signin_result(signin_headers, signin_attendees,
                             signin_source or "pdf_signin_text")
        signin_mode = True
    else:
        res = {"sourceType": source_type, "columns": all_cols, "rows": all_rows}
    # 透传归档元信息：供前端判断「照片型/超大归档」并提示改用 Excel 模板
    res["meta"] = {
        "totalPages": total_pages,
        "photoSkipped": photo_skipped,
        "untouchedTail": skipped_tail,
        "signinPages": signin_page_count,
    }
    if signin_mode:
        res["meta"]["signedTotal"] = len(signin_attendees)
    return res


def _pil_bytesio(pix):
    import io
    buf = io.BytesIO()
    buf.write(pix.tobytes("png"))
    buf.seek(0)
    return buf


def _parse_text_table(text):
    """数字型 PDF 文本解析：优先识别「培训记录表」表单式版式（label:value），
    未匹配到表单时按多列表格（空白分组）解析。"""
    lines = [l for l in text.split("\n") if l.strip()]

    cols, rows = _try_form_table(lines)
    if cols and rows:
        return cols, rows

    # ---- 多列表格回退 ----
    header_idx = 0
    hscore = 0
    for idx, ln in enumerate(lines[:6]):
        s = sum(1 for tok in re.split(r"\s{2,}", ln.strip()) if header_field(tok))
        if s > hscore:
            hscore = s
            header_idx = idx
    hdr_toks = [t for t in re.split(r"\s{2,}", lines[header_idx].strip()) if t.strip()]
    anchors = []
    for t in hdr_toks:
        m = header_field(t)
        if m:
            anchors.append({"field": m[1], "label": m[0]})
    if not anchors:
        return [], []
    pad_left = sum(1 for t in hdr_toks if not header_field(t))
    rows = []
    for ln in lines[header_idx + 1:]:
        toks = [t for t in re.split(r"\s{2,}", ln.strip()) if t.strip()]
        if not toks:
            continue
        obj = {}
        for k, a in enumerate(anchors):
            v = toks[pad_left + k] if pad_left + k < len(toks) else ""
            if v:
                obj[a["field"]] = collapse_spaces(v)
        if obj:
            rows.append(obj)
    return [a["label"] for a in anchors], rows


# 「培训记录表」表单样式 label：value 的字段映射
FORM_LABELS = [
    ("培训内容", "content"), ("培训主题", "content"), ("课题", "content"),
    ("培训对象", "content"), ("培训课题", "content"), ("培训目的", "content"),
    ("培训日期", "training_date"), ("培训时间", "training_date"), ("日期", "training_date"),
    ("培训地点", "remark"), ("地点", "remark"),
    ("培训讲师", "trainer"), ("主持人", "trainer"), ("主讲人", "trainer"),
    ("授课人", "trainer"), ("培训人", "trainer"),
    ("记录人", "remark"),
    ("所属部门", "dept"), ("部门", "dept"), ("单位", "dept"),
    ("参加人数", "remark"), ("人数", "remark"),
    ("培训学时", "duration_minutes"), ("学时", "duration_minutes"),
    ("培训时长", "duration_minutes"), ("时长", "duration_minutes"),
    ("培训类型", "training_type"), ("类型", "training_type"),
    ("培训方式", "remark"),
    ("姓名", "name"), ("受训人", "name"), ("培训人员", "name"),
    ("成绩", "score"), ("考核成绩", "score"), ("分数", "score"),
    ("考核结果", "result"), ("培训结果", "result"), ("结果", "result"),
    ("结论", "result"),
]

# 归一化日期：2025.11.18 / 2025-11-18 / 25.11.18 → YYYY-MM-DD
# PDF 字体缺 ToUnicode 映射时会产生 U+FFFD 或方块/菱形替换字符，统一清洗为可读文本
_NOISE_CHARS = set("\ufffd\u25a0\u25a1\u25c6\u25cf\ufffc")


def _clean_noise(s):
    if not s:
        return s
    return "".join(ch for ch in s if ch not in _NOISE_CHARS)


def _normalize_date(s):
    raw = _clean_noise(s or "")
    if not raw:
        return ""
    # 兼容完整年(2025)、两位年(25)、截断年(025)、以及尾部带时间(如 "18 19:00")
    m = re.search(r"(?:^|[^\d])(\d{2,4})[^\d](\d{1,2})[^\d](\d{1,2})(?:[^\d]|$)", raw)
    if not m:
        return ""
    y, mo, d = m.group(1), m.group(2), m.group(3)
    if len(y) == 2:
        y = "20" + y
    elif len(y) == 3 and y.startswith("0"):
        # "025" 这类由 "2025" 截断最高位导致 → 补全为 20xx（20 + 后两位）
        y = "20" + y[1:]
    try:
        if len(y) != 4 or not (1 <= int(mo) <= 12) or not (1 <= int(d) <= 31):
            return ""
        return "%s-%02d-%02d" % (y, int(mo), int(d))
    except ValueError:
        return ""


def _looks_like_label_line(text):
    for label, _f in FORM_LABELS:
        if norm_key(text) == norm_key(label):
            return label
        if text.startswith(label) and (":：" in text[len(label):len(label)+2] or re.match(r"^%s[：:\s]" % re.escape(label), text)):
            return label
    return None


def _try_form_table(lines):
    """表单式版式：把 label  与 value 配对成一条培训记录。返回 (columns, [record])。"""
    # 第一步：抽 label:value 配对
    pairs = []          # (label, value)
    pending = None      # 上一行出现的孤立 label
    for raw in lines:
        ln = collapse_spaces(raw)
        label = _looks_like_label_line(ln)
        # 同行的 label：value
        if label and re.search(r"[：:]", ln):
            val = re.split(r"[：:]\s*", ln, maxsplit=1)[-1].strip()
            pairs.append((label, val))
            pending = None
            continue
        if label:
            pending = label
            continue
        if pending is not None and ln:
            pairs.append((pending, ln))
            pending = None

    if len(set(l for l, _v in pairs)) < 3 or sum(1 for _l, v in pairs if v) < 3:
        return [], []

    record = {}
    seen = []
    for label, value in pairs:
        value = re.sub(
            r"^[^\u4e00-\u9fffA-Za-z0-9]+|[^\u4e00-\u9fffA-Za-z0-9]+$", "",
            collapse_spaces(value))
        if not value:
            continue
        field = dict(FORM_LABELS).get(norm_key(label))
        if not field:
            continue
        if field == "training_date":
            value = _normalize_date(value)
        elif field == "duration_minutes":
            m = re.search(r"\d+", value)
            value = m.group(0) if m else value
        elif field == "score":
            m = re.search(r"\d+(\.\d+)?", value)
            value = m.group(0) if m else value
        if field in record and field != "remark":
            record[field] = record.get(field, "") + " " + value
        else:
            record[field] = value
        if field not in seen:
            seen.append(field)

    if "result" not in record:
        record["result"] = "合格"

    col_map = {}
    for label, field in FORM_LABELS:
        if field not in col_map:
            col_map[field] = label
    columns = [col_map[f] for f in seen if f in col_map]
    return columns, [record]


# =====================================================================
# 签到表专属解析（mode='signin'）
# 实际「培训签到表」版式：上方 label:value 表单头 + 下方「序号|姓名|签名」多栏签到区，
# 姓名列仅列出实际到场(已签名)人员。据此提取：
#   - headers：training_date/location/host/recorder/dept/attendee/content（逐字段，不合并）
#   - attendees：签到区「姓名」列下的人名清单
# =====================================================================
SIGNIN_LABELS = [
    ("培训日期", "training_date"), ("日期", "training_date"), ("培训时间", "training_date"),
    ("培训地点", "location"), ("地点", "location"),
    ("主持人", "host"), ("讲解人", "host"), ("主讲人", "host"),
    ("记录人", "recorder"),
    ("参加人员", "attendee"), ("参加人数", "attendee"), ("人数", "attendee"),
    ("培训内容", "content"), ("内容", "content"), ("培训课题", "content"), ("培训主题", "content"),
    ("培训方式", "remark"), ("学时", "remark"),
    ("部门", "dept"), ("单位", "dept"), ("所属部门", "dept"),
]

_SIGNIN_LABEL_MAP = {norm_key(label): key for label, key in SIGNIN_LABELS}


def _looks_like_signin_label(text):
    for label, _k in SIGNIN_LABELS:
        nk = norm_key(label)
        if norm_key(text) == nk:
            return label
        if text.startswith(label) and re.match(r"^%s[：:\s]" % re.escape(label), text):
            return label
    return None


def _parse_signin_header(lines):
    """把 label:value 行解析为签到表头部字段。支持多行培训内容累积。"""
    pairs = []
    pending = None
    for raw in lines:
        ln = collapse_spaces(raw)
        label = _looks_like_signin_label(ln)
        if label is not None and re.search(r"[：:]", ln):
            val = re.split(r"[：:]\s*", ln, maxsplit=1)[-1].strip()
            pairs.append((label, val))
            pending = None
            continue
        if label is not None:
            pending = label
            continue
        if pending is not None and ln:
            pairs.append((pending, ln))
            pending = None

    header = {}
    for label, value in pairs:
        key = _SIGNIN_LABEL_MAP.get(norm_key(label))
        if not key:
            continue
        value = re.sub(
            r"^[^\u4e00-\u9fffA-Za-z0-9]+|[^\u4e00-\u9fffA-Za-z0-9]+$", "",
            collapse_spaces(value))
        if not value:
            continue
        if key == "training_date":
            value = _normalize_date(value)
        elif key == "content":
            # 培训内容多行：同一 key 持续累积
            header[key] = (header.get(key, "") + " " + value).strip()
            continue
        elif key in header:
            continue  # 其余字段取首个非空
        header[key] = value
    return header


def _extract_signin_attendees(words):
    """提取签到区「姓名」列下的人名。复用 build_anchor_table 的 姓名 锚点列。"""
    attendees = []
    _cols, rows = build_anchor_table(words)
    for r in rows or []:
        nm = norm_key(r.get("name", "")).strip()
        if len(nm) >= 2 and re.search(r"[\u4e00-\u9fff]", nm):
            if nm not in attendees:
                attendees.append(nm)
    return attendees


# 签到区专用标记词：从文本层识别“姓名/签名”列头
_SIGNIN_TAB_KEY = ("姓名", "签名", "序号")


def _clean_name_token(tok):
    """清洗签到区姓名 token：仅保留中文（含 · 、 `/．），剔除数字/标点/表头词，
    并剥离「姓名+签名」重叠段（如 '高玉胜高玉胜'→'高玉胜'、'姜春成姜成'→'姜春成'）。"""
    t = _clean_noise(str(tok or "")).strip()
    if not t:
        return ""
    if any(k in t for k in _SIGNIN_TAB_KEY):
        return ""
    # 去掉数字与符号，仅保留中文字段（姓名可能含 · 间隔）
    keep = re.sub(r"[^\u4e00-\u9fff·|]", "", t)
    keep = keep.strip("·|").strip()
    if len(keep) < 2 or len(keep) > 12:
        return ""
    if not re.search(r"[\u4e00-\u9fff]", keep):
        return ""
    # 姓名(2-4字) + 其手写签名重复段：当总长=2×姓名且前段曾出现，裁为前段
    for half in range(2, 5):
        if len(keep) == half * 2 and keep[:half] == keep[half:]:
            return keep[:half]
    if len(keep) <= 4:
        return keep
    # 5-12 字：多数为「姓名+签名(简写)」，姓名以姓开头，签名简写也以姓开头。
    # 第 1 字与第 4 字相同 → 取前 3 字姓名（如 姜春成姜成→姜春成、卓银义卓义→卓银义）。
    if keep[0] == keep[3]:
        return keep[:3]
    return keep[:3]


def _extract_signin_attendees_text(lines):
    """从文本层签到区提取姓名清单。
    版式：签到区为「序号 姓名 签名」三栏，姓名(常含手写签名)紧跟在数字序号之后。
    逐 token 扫描，取紧跟数字后的 2-12 字中文姓名，去重。"""
    attendees = []
    seen = set()
    tokens = []
    for ln in lines:
        for t in re.split(r"[\s]+", collapse_spaces(ln)):
            if t:
                tokens.append(t)
    # 定位签到区起点：连续出现“序号/姓名/签名”表头 或 首个“签名”token
    start = 0
    for i in range(len(tokens) - 2):
        if tokens[i] == "姓名" and tokens[i + 1] == "签名":
            start = i + 2
            break
        if tokens[i] == "签名":
            start = i + 1
            break
    # 数字后紧跟中文姓名 → 登记；维持出现顺序
    prev_is_num = False
    for t in tokens[start:]:
        nm = _clean_name_token(t)
        if re.match(r"^\d+$", t):
            prev_is_num = True
            continue
        if not prev_is_num:
            continue
        prev_is_num = False  # 非数字后：仅当其本身为姓名才消耗，否则保持等待下一数字
        if nm and nm not in seen:
            seen.add(nm)
            attendees.append(nm)
    return attendees


# 文本层签到表判定（数字型 PDF）：表头 ≥3 字段 + 出现签到姓名清单
def _try_signin_text(text):
    lines = [collapse_spaces(l).strip() for l in text.split("\n") if l.strip()]
    header = _parse_signin_header(lines)
    if not header or len(header) < 3:
        return None
    # 需出现“姓名/签名”签到区表头，且能提取到签到名单
    if not any(k in text for k in _SIGNIN_TAB_KEY):
        return None
    attendees = _extract_signin_attendees_text(lines)
    if len(attendees) < 2:
        return None
    return header, attendees


def _signin_result(header, attendees, source_type):
    rows = [{"name": n} for n in attendees]
    return {
        "sourceType": source_type,
        "mode": "signin",
        "columns": ["姓名"],
        "rows": rows,
        "signin": {"headers": header, "attendees": attendees},
    }


# ---------- 主流程 ----------
def main(argv):
    def emit(result, code=0):
        try:
            print(json.dumps(result, ensure_ascii=False))
        except BrokenPipeError:
            pass
        return code

    if len(argv) < 2:
        return emit({"ok": False, "message": "缺少输入文件路径"}, 2)
    file_path = argv[1]
    if not os.path.exists(file_path):
        return emit({"ok": False, "message": f"文件不存在: {file_path}"}, 2)

    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext == ".pdf":
            res = handle_pdf(file_path)
        else:
            res = handle_image(file_path)
    except Exception as e:
        return emit({"ok": False, "message": f"识别失败：{e}"}, 1)

    # 出口统一清洗：去掉字体缺映射产生的替换字符，避免乱码透传到前台表头/预览
    payload_cols = [_clean_noise(str(c)) for c in (res["columns"] or [])]
    payload_rows = []
    for r in (res["rows"] or []):
        if not isinstance(r, dict):
            continue
        clean = {k: _clean_noise(v) if isinstance(v, str) else v for k, v in r.items()}
        # 「姓名」列常为手写签名占位（OCR 成"签名 签名"、纯数字/无实际人名）。
        # 此时取「培训讲师」列作为入库姓名，保证真正落到 training_records 的是培训人员而非占位文字。
        nm = str(clean.get("name") or "").strip()
        trainer = str(clean.get("trainer") or "").strip()
        if re.search(r"签名", nm) and len(trainer) >= 2 and re.search(r"[\u4e00-\u9fff]", trainer):
            clean["name"] = trainer
        # 日期字段在出口再归一化一次，确保解析失败留下空串而非污染串
        if "training_date" in clean:
            clean["training_date"] = _normalize_date(clean["training_date"])
        payload_rows.append(clean)

    message = f"识别到 {len(payload_rows)} 行"
    if res.get("mode") == "signin":
        signed = len(payload_rows)
        message = f"签到表识别完成，已签到 {signed} 人"

    payload = {"ok": True, "sourceType": res["sourceType"],
               "mode": res.get("mode"), "columns": payload_cols, "rows": payload_rows,
               "message": message}
    # 扫描归档元信息（总页数/跳过的照片页/未识别尾页等），供前端提示改用 Excel 模板
    if isinstance(res.get("meta"), dict):
        payload["meta"] = res["meta"]
    # 签到表：透传头部字段与人名清单（供前端调用 /ledger/signin/recognize）
    if res.get("mode") == "signin" and isinstance(res.get("signin"), dict):
        headers = {k: _clean_noise(v) if isinstance(v, str) else v
                   for k, v in res["signin"].get("headers", {}).items()}
        attendees = [_clean_noise(str(n)) for n in res["signin"].get("attendees", [])]
        payload["signin"] = {"headers": headers, "attendees": attendees}
    if not payload_rows and res.get("mode") != "signin":
        payload["message"] = ("识别到 0 行：请确认文件为规整表格（含表头行）或表单式记录"
                              "（如“培训日期：2025.11.18”），或图片足够清晰。")
    if len(argv) >= 3 and argv[2]:
        with open(argv[2], "w", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False)
    return emit(payload)


if __name__ == "__main__":
    sys.exit(main(sys.argv))