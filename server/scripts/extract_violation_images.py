"""
通用化三违图片抽取脚本（被 server/routes/import.js 的 confirmImportNative 调用）。

功能：
  解压 xlsx -> 解析 xl/drawings/drawingN.xml 的锚点(oneCell/twoCell) -> 映射 (sheet, row, col)
  到三违照片/整改后照片列 -> 把图片原图与缩略图落盘到 <out>/violations/{orig,thumb}
  -> 输出 mapping JSON（按数据行顺序，含对齐键与图片 URL）。

用法：
  python extract_violation_images.py --xlsx <file.xlsx> --out <uploads_root> --map <map.json>
                                          [--url-prefix /uploads/violations] [--thumb-w 240]

约定：
  - 自动定位含「三违照片」/「三违行为」表头的数据工作表（不硬编码 sheet 名）。
  - 文件名以「序号」列为 base（如 1_tv0.jpg），与前端既有约定一致。
  - 仅抽取，不修改数据库；失败由调用方日志处理，不影响数据导入。
  - openpyxl read_only 模式下 worksheet 只能迭代一次，故表头定位与数据读取在同一次迭代器完成。
"""
import argparse
import json
import os
import re
import io
import datetime
import zipfile
from xml.etree import ElementTree as ET

import openpyxl
from PIL import Image

NS = {
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

PHOTO_HEADERS = ("三违照片", "三违行为", "三违检查")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--xlsx", required=True)
    p.add_argument("--out", required=True)   # uploads 根目录
    p.add_argument("--map", required=True)   # mapping json 输出路径
    p.add_argument("--url-prefix", default="/uploads/violations")
    p.add_argument("--thumb-w", type=int, default=240)
    return p.parse_args()


def fmt_date(v):
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, datetime.date):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", s)
    if m:
        return "%s-%02d-%02d" % (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return s


def is_header_row(values):
    return any(
        v is not None and any(h in str(v) for h in PHOTO_HEADERS) for v in values
    )


def main():
    args = parse_args()
    xlsx = args.xlsx
    vdir = os.path.join(args.out, "violations")
    orig = os.path.join(vdir, "orig")
    thumb = os.path.join(vdir, "thumb")
    os.makedirs(orig, exist_ok=True)
    os.makedirs(thumb, exist_ok=True)

    z = zipfile.ZipFile(xlsx)
    namelist = z.namelist()

    # 1) 解析所有 drawing 的锚点 -> all_anchors = [(row0, col0, target)]
    #    （图片列仅存在于数据工作表，row/col 对齐基于已定位的数据 sheet 行号）
    all_anchors = []
    for fn in namelist:
        if not fn.startswith("xl/drawings/drawing") or not fn.endswith(".xml") or fn.endswith(".rels"):
            continue
        try:
            droot = ET.fromstring(z.read(fn))
        except Exception:
            continue
        rels_path = fn.replace("drawings/", "drawings/_rels/") + ".rels"
        try:
            rels = ET.fromstring(z.read(rels_path))
            rid_to_target = {r.get("Id"): r.get("Target") for r in rels}
        except Exception:
            rid_to_target = {}
        for tag in ("oneCellAnchor", "twoCellAnchor"):
            for anchor in droot.iter("{%s}%s" % (NS["xdr"], tag)):
                frm = anchor.find("xdr:from", NS)
                if frm is None:
                    continue
                row_el = frm.find("xdr:row", NS)
                col_el = frm.find("xdr:col", NS)
                if row_el is None or col_el is None or row_el.text is None:
                    continue
                try:
                    row0 = int(row_el.text)
                    col0 = int(col_el.text)
                except ValueError:
                    continue
                blip = anchor.find(".//a:blip", NS)
                if blip is None:
                    continue
                rid = blip.get("{%s}embed" % NS["r"])
                target = rid_to_target.get(rid)
                if target is None:
                    continue
                all_anchors.append((row0, col0, target))

    # 3) 用 openpyxl 定位数据工作表（含三违表头），流式单次迭代
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    data_sheet_title = None
    header = None
    hdr_idx = 0
    data_rows = []
    for ws in wb.worksheets:
        it = ws.iter_rows(values_only=True)
        head_rows = []
        found = False
        for _ in range(8):
            try:
                r = next(it)
            except StopIteration:
                break
            head_rows.append(r)
            if is_header_row(r):
                found = True
                break
        if not found:
            continue
        hdr_idx = len(head_rows) - 1
        header = head_rows[hdr_idx]
        rest = []
        for r in it:
            rest.append(r)
        data_rows = rest
        data_sheet_title = ws.title
        break

    if not data_sheet_title:
        print("NO_DATA_SHEET")
        with open(args.map, "w", encoding="utf-8") as f:
            json.dump([], f)
        return

    # 照片列定位
    tv_cols = []
    rec_col = None
    for j, v in enumerate(header):
        if v is None:
            continue
        s = str(v)
        if "整改后照片" in s:
            rec_col = j
        elif "三违照片" in s:
            tv_cols.append(j)
    # 合并表头「三违照片：图片1-4」仅首列有文本 -> 补齐后续 3 列
    if len(tv_cols) == 1:
        tv_cols = [tv_cols[0] + k for k in range(4)]
    tv_cols = tv_cols[:4]

    def col_of(name):
        for j, v in enumerate(header):
            if v and str(v).strip() == name:
                return j
        return None

    C = {
        "序号": col_of("序号"),
        "编号": col_of("编号"),
        "分组名称": col_of("分组名称"),
        "姓名": col_of("姓名"),
        "违章人姓名": col_of("违章人姓名"),
        "三违行为": col_of("三违行为"),
        "网格等级": col_of("网格等级"),
        "日期": col_of("日期"),
    }

    # 该数据 sheet 对应的图片集合（直接采用全量锚点；不在 row_map 的锚点自然归类为 unmapped）
    imgs_for_sheet = all_anchors

    # 行号 -> 数据索引 映射
    row_map = {}
    for idx, r in enumerate(data_rows):
        rn = r.row if hasattr(r, "row") else (hdr_idx + 2 + idx)
        row_map[rn] = idx

    def cell(row, key):
        j = C.get(key)
        if j is None or j >= len(row) or row[j] is None:
            return ""
        return str(row[j]).strip()

    rows_out = []
    for r in data_rows:
        rows_out.append(
            {
                "seq": cell(r, "序号"),
                "no": cell(r, "编号"),
                "area_team": cell(r, "分组名称"),
                "inspector_name": cell(r, "姓名"),
                "violator_name": cell(r, "违章人姓名"),
                "violation_behavior": cell(r, "三违行为"),
                "grid_level": cell(r, "网格等级"),
                "violation_date": fmt_date(r[C["日期"]]) if (C["日期"] is not None and C["日期"] < len(r) and r[C["日期"]] is not None) else "",
                "tv": [],
                "rec": [],
            }
        )

    # 图片 -> 数据行
    unmapped = 0
    for (row0, col0, target) in imgs_for_sheet:
        didx = row_map.get(row0 + 1)
        if didx is None:
            unmapped += 1
            continue
        if col0 in tv_cols:
            slot = tv_cols.index(col0)
            rows_out[didx]["tv"].append((slot, target))
        elif col0 == rec_col:
            rows_out[didx]["rec"].append(target)
        else:
            rows_out[didx]["tv"].append((99, target))

    # 落盘 + 生成缩略图 + 构建 URL
    prefix = args.url_prefix.rstrip("/")
    saved = 0
    for row in rows_out:
        seq = row["seq"] or row["no"] or ("r%d" % id(row))
        tv_sorted = sorted(row["tv"], key=lambda x: x[0])
        urls_tv = []
        for slot, target in tv_sorted:
            if not target:
                continue
            media = "xl/" + target.replace("../", "")
            try:
                data = z.read(media)
            except KeyError:
                continue
            base = "%s_tv%d" % (seq, slot)
            op = os.path.join(orig, base + ".jpg")
            tp = os.path.join(thumb, base + ".jpg")
            with open(op, "wb") as f:
                f.write(data)
            try:
                im = Image.open(io.BytesIO(data))
                im.thumbnail((args.thumb_w, args.thumb_w))
                im.convert("RGB").save(tp, "JPEG", quality=82)
            except Exception:
                with open(tp, "wb") as f:
                    f.write(data)
            urls_tv.append("%s/thumb/%s.jpg" % (prefix, base))
            saved += 1
        row["threeViolation"] = urls_tv
        urls_rec = []
        for target in row["rec"]:
            if not target:
                continue
            media = "xl/" + target.replace("../", "")
            try:
                data = z.read(media)
            except KeyError:
                continue
            base = "%s_rec" % seq
            op = os.path.join(orig, base + ".jpg")
            tp = os.path.join(thumb, base + ".jpg")
            with open(op, "wb") as f:
                f.write(data)
            try:
                im = Image.open(io.BytesIO(data))
                im.thumbnail((args.thumb_w, args.thumb_w))
                im.convert("RGB").save(tp, "JPEG", quality=82)
            except Exception:
                with open(tp, "wb") as f:
                    f.write(data)
            urls_rec.append("%s/thumb/%s.jpg" % (prefix, base))
            saved += 1
        row["rectification"] = urls_rec
        del row["tv"]
        del row["rec"]

    with open(args.map, "w", encoding="utf-8") as f:
        json.dump(rows_out, f, ensure_ascii=False)

    print("DATA_SHEET=%s" % data_sheet_title)
    print("ROWS=%d" % len(rows_out))
    print("IMAGES_SAVED=%d" % saved)
    print("ROWS_TV=%d" % sum(1 for r in rows_out if r["threeViolation"]))
    print("ROWS_REC=%d" % sum(1 for r in rows_out if r["rectification"]))
    print("UNMAPPED=%d" % unmapped)


if __name__ == "__main__":
    main()
