#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通用 Excel 内嵌图片提取器（网格长巡查台账等导入场景）
=====================================================
背景：SheetJS（Node 侧 xlsx 解析）只能读单元格文本，读不到 Excel 里
"锚定在单元格上的浮动图片"（存放于 xl/media/*.jpeg + xl/drawings/*.xml）。
本脚本用 python 标准库 zipfile + xml.etree 直接拆解 .xlsx：
  1) 解析 workbook/worksheets/sharedStrings，定位"带照片表头"的工作表与照片列；
  2) 解析该工作表的 drawing（锚点 from 的 col/row → rId → media 文件），
     得到每张图属于哪一行的哪一列；
  3) 把图片字节落盘到 {out}/grid-inspection/{run}/...，并输出
     row(Excel 1 基行号) → {threeViolation:[webpath], rectification:[webpath]} 的 JSON 映射。
仅使用标准库，无需 openpyxl/pandas。

用法：
  python extract_embedded_images.py --xlsx <file.xlsx> --out <uploadsRoot>
      [--map <map.json>] [--run <runId>]
输出：
  --map 指向的 JSON： [ {"row": 3, "threeViolation": ["/uploads/..."], "rectification": ["/uploads/..."]} ]
"""
import argparse
import io
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"


def local(tag):
    # 去掉命名空间前缀，返回元素本地名
    if isinstance(tag, str) and tag.startswith('{'):
        return tag.split('}', 1)[1]
    return tag


def children(el):
    return [c for c in el if isinstance(c.tag, str)]


def find_choices(root):
    """返回父命名空间未定义时逐子元素本地名匹配的查找结果；简单起见提供通用子遍历"""
    return list(root)


def read_rels(zipped, relpath):
    """读取关系文件，返回 {rId: (type, target)}，target 相对该目录归一化为 zip 内路径"""
    rels = {}
    if relpath not in zipped.namelist():
        return rels
    # rels 文件位于 <部件目录>/_rels/<名>.rels，其 Target 相对「源部件所在目录」解析，
    # 故先去掉结尾的 "/_rels/<名>.rels"（连同目录里的 _rels）得到源部件目录。
    base = os.path.dirname(relpath).replace('/_rels', '')
    try:
        tree = ET.fromstring(zipped.read(relpath))
    except Exception:
        return rels
    for rel in tree:
        if local(rel.tag) != 'Relationship':
            continue
        rid = rel.get('Id')
        tgt = rel.get('Target')
        typ = rel.get('Type', '')
        if not rid or not tgt:
            continue
        # 归一化相对路径到 zip 根
        if tgt.startswith('/'):
            full = tgt.lstrip('/')
        else:
            full = os.path.normpath(os.path.join(base, tgt)).replace('\\', '/')
        rels[rid] = (typ, full)
    return rels


def norm_text(s):
    if s is None:
        return ''
    return re.sub(r'\s+', ' ', str(s)).strip()


class XlsxExtractor:
    def __init__(self, xlsx_path):
        self.zip = zipfile.ZipFile(xlsx_path, 'r')
        self.shared_strings = self._load_shared_strings()
        # workbook.xml.rels: rId -> (type, worksheets/sheetN.xml)
        self.workbook_rels = read_rels(self.zip, 'xl/_rels/workbook.xml.rels')
        # workbook.xml: 工作表顺序与名称
        self.sheet_name_by_path = self._load_sheet_names()

    def _load_shared_strings(self):
        if 'xl/sharedStrings.xml' not in self.zip.namelist():
            return []
        try:
            root = ET.fromstring(self.zip.read('xl/sharedStrings.xml'))
        except Exception:
            return []
        out = []
        for si in root:
            if local(si.tag) != 'si':
                continue
            parts = []
            for node in si.iter():
                if local(node.tag) == 't' and node.text:
                    parts.append(node.text)
            out.append(''.join(parts))
        return out

    def _load_sheet_names(self):
        """workbook.xml 中 sheet 的 r:id -> sheet name；再结合 workbook_rels 得 path->name"""
        name_by_path = {}
        if 'xl/workbook.xml' not in self.zip.namelist():
            return name_by_path
        try:
            root = ET.fromstring(self.zip.read('xl/workbook.xml'))
        except Exception:
            return name_by_path
        for sheet_el in root.iter():
            if local(sheet_el.tag) != 'sheet':
                continue
            rid = sheet_el.get('{%s}id' % NS_R)
            name = sheet_el.get('name')
            if rid and name and rid in self.workbook_rels:
                _, path = self.workbook_rels[rid]
                name_by_path[path] = name
        return name_by_path

    def _row_cells(self, sheet_root, row_num):
        """返回该行 {col_index(0-based): cellvalue(str)}，值为 sharedString 文本或内联串"""
        cells = {}
        row_name = str(row_num)
        for row_el in sheet_root.iter():
            if local(row_el.tag) != 'row':
                continue
            if row_el.get('r') != row_name:
                continue
            for c in row_el:
                if local(c.tag) != 'c':
                    continue
                ref = c.get('r')  # 如 A3
                if not ref:
                    continue
                col = col_to_idx(re.search(r'[A-Z]+', ref).group(0))
                t = c.get('t')
                v = c.find('{%s}v' % NS_MAIN)
                val = ''
                if t == 's' and v is not None and v.text is not None:
                    idx = int(v.text)
                    val = self.shared_strings[idx] if idx < len(self.shared_strings) else ''
                elif t == 'inlineStr':
                    for is_t in c.iter():
                        if local(is_t.tag) == 't' and is_t.text:
                            val += is_t.text
                elif v is not None and v.text is not None:
                    val = v.text
                cells[col] = norm_text(val)
            break
        return cells

    def _find_photo_sheet(self):
        """
        遍历带有 drawing 的工作表，返回 (sheet_path, header_cells_map)：
        header_cells_map = {col_idx: header_text}，来自带『照片/三违』关键词的表头所在行。
        """
        for _, (typ, sheet_path) in self.workbook_rels.items():
            if not ('/worksheet' in typ or sheet_path.startswith('worksheets/')):
                continue
            # 该表是否有 drawing
            sbase = os.path.dirname(sheet_path)
            sheet_rels_path = os.path.join(sbase, '_rels', os.path.basename(sheet_path) + '.rels').replace('\\', '/')
            draws = read_rels(self.zip, sheet_rels_path)
            has_draw = any('/drawing' in t for t, _ in draws.values())
            if sheet_path not in self.zip.namelist():
                continue
            try:
                root = ET.fromstring(self.zip.read(sheet_path))
            except Exception:
                continue
            # 找表头行：含『照片/三违』关键字的行
            header_cells = {}
            for row_el in root.iter():
                if local(row_el.tag) != 'row':
                    continue
                rn = row_el.get('r')
                if not rn:
                    continue
                cells = self._row_cells(root, int(rn))
                joined = ''.join(cells.values())
                # 照片表头行必然含「照片」（如 三违照片：图片1 / 整改后照片：图片1）；
                # 仅含「三违」的标题行（如 每日“三违”检查汇总）不得误判为表头
                if '照片' in joined:
                    header_cells = cells
                    if has_draw:
                        return sheet_path, sheet_path.replace('sheets/', ''), header_cells, draws
            if header_cells and has_draw:
                return sheet_path, sheet_path.replace('sheets/', ''), header_cells, draws
        return None, None, {}, {}

    def extract(self, out_root, run_id):
        sheet_path, sheet_tag, header_cells, draws = self._find_photo_sheet()
        if not sheet_path:
            return []
        # 照片列分类
        field_by_col = {}
        for col, txt in header_cells.items():
            if not txt:
                continue
            if '三违照片' in txt or ('三违' in txt and '照片' in txt):
                field_by_col[col] = 'threeViolation'
            elif '整改后照片' in txt or ('整改' in txt and '照片' in txt):
                field_by_col[col] = 'rectification'
        if not field_by_col:
            return []
        # 该表对应的 drawing
        draw_target = None
        for t, path in draws.values():
            if '/drawing' in t and path in self.zip.namelist():
                draw_target = path
                break
        if not draw_target:
            return []
        draw_dir = os.path.dirname(draw_target)
        draw_rels = read_rels(self.zip, os.path.join(draw_dir, '_rels', os.path.basename(draw_target) + '.rels').replace('\\', '/'))
        base_dir = os.path.join(out_root, 'grid-inspection', run_id)
        os.makedirs(base_dir, exist_ok=True)
        media_ext_by_rid = {}
        for rid, (t, target) in draw_rels.items():
            if '/image' in t:
                fname = os.path.basename(target)
                ext = os.path.splitext(fname)[1] or '.jpeg'
                media_ext_by_rid[rid] = (target, ext)
        try:
            draw_root = ET.fromstring(self.zip.read(draw_target))
        except Exception:
            return []
        # 按行聚合
        row_map = {}
        for anchor in draw_root.iter():
            if local(anchor.tag) not in ('oneCellAnchor', 'twoCellAnchor', 'absoluteAnchor'):
                continue
            from_el = None
            embed_rid = None
            for child in anchor:
                if local(child.tag) == 'from':
                    from_el = child
                if local(child.tag) == 'pic':
                    blip = child.find('{%s}blipFill/{%s}blip' % (NS_DRAW, NS_DRAW))
                    if blip is None:
                        # 兼容命名空间差异
                        for b in child.iter():
                            if local(b.tag) == 'blip':
                                blip = b
                                break
                    if blip is not None:
                        embed_rid = blip.get('{%s}embed' % NS_R) or blip.get('r:embed') or blip.get('embed')
            if from_el is None or embed_rid is None:
                continue
            if embed_rid not in media_ext_by_rid:
                continue
            coln = rown = None
            for node in from_el:
                if local(node.tag) == 'col' and node.text is not None:
                    coln = int(node.text)
                if local(node.tag) == 'row' and node.text is not None:
                    rown = int(node.text)
            if coln is None or rown is None:
                continue
            field = field_by_col.get(coln)
            if field is None:
                continue
            ex_row = rown + 1  # 转 Excel 1 基行号
            if ex_row not in row_map:
                row_map[ex_row] = {'row': ex_row, 'threeViolation': [], 'rectification': []}
            target, ext = media_ext_by_rid[embed_rid]
            fname = 'row%d_c%d_%d%s' % (ex_row, coln + 1, len(row_map[ex_row][field]) + 1, ext)
            fpath = os.path.join(base_dir, fname)
            try:
                with open(fpath, 'wb') as f:
                    f.write(self.zip.read(target))
            except Exception:
                continue
            web = '/uploads/grid-inspection/%s/%s' % (run_id, fname)
            row_map[ex_row][field].append(web)
        result = [row_map[k] for k in sorted(row_map.keys()) if row_map[k]['threeViolation'] or row_map[k]['rectification']]
        return result


def col_to_idx(col_letters):
    idx = 0
    for ch in col_letters:
        idx = idx * 26 + (ord(ch.upper()) - ord('A') + 1)
    return idx - 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xlsx', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--map', required=True)
    ap.add_argument('--run', required=True)
    args = ap.parse_args()
    if not os.path.isfile(args.xlsx):
        sys.exit('xlsx not found: ' + args.xlsx)
    top = XlsxExtractor(args.xlsx)
    result = top.extract(args.out, args.run)
    with open(args.map, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False)
    print('attached rows=%d' % len(result))


if __name__ == '__main__':
    main()