#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WPS 单元格图片 → 标准 Excel drawings 锚点 转换器
=================================================
背景：WPS 保存的「单元格内嵌图片」使用私有格式：
  - xl/cellimages.xml            （etc:cellImage 列表，无坐标锚点）
  - xl/_rels/cellimages.xml.rels （rId -> xl/media/imageN.jpeg）
  - 工作表单元格写 _xlfn.DISPIMG("ID_xxx",1) 公式引用图片
而标准 Excel / 本仓库 extract_embedded_images.py 要求：
  - xl/drawings/drawingN.xml（oneCellAnchor 锚点 from 的 col/row）
  - xl/drawings/_rels/drawingN.xml.rels（rId -> media）
  - 工作表 <drawing r:id="..."/> 引用 + 去掉 DISPIMG 公式

本脚本把 WPS cellimages 转成标准 drawings：
  1) 解析每个工作表里 DISPIMG 公式单元格 → (col0, row0, 图片ID)
  2) 解析 cellimages.xml → 图片ID -> r:embed rId；cellimages.xml.rels → rId -> media 文件
  3) 为含图片的工作表生成 drawing XML（from 锚点 = 单元格坐标，ext = cellimages 中原始尺寸）
  4) 改写工作表：移除 DISPIMG 公式单元格、加入 <drawing/> 引用
  5) 更新 [Content_Types].xml、删除 cellimages.xml 及其 rels
  6) 重新打包为 .xlsx

用法：
  python convert_wps_cellimages_to_drawings.py --xlsx <input.xlsx> [--out <output.xlsx>]
仅使用标准库。
"""
import argparse
import os
import re
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"


def local(tag):
    if isinstance(tag, str) and tag.startswith('{'):
        return tag.split('}', 1)[1]
    return tag


def col_letters_to_idx(col):
    idx = 0
    for ch in col:
        idx = idx * 26 + (ord(ch.upper()) - ord('A') + 1)
    return idx - 1


def col_idx_to_letters(n):
    s = ''
    n += 1
    while n:
        n, rem = divmod(n - 1, 26)
        s = chr(ord('A') + rem) + s
    return s


# ---------- 1) 解析工作表 DISPIMG 单元格 ----------
DISPIMG_RE = re.compile(
    r'<c r="([A-Z]+)(\d+)"([^>]*)>'
    r'<f>[^<]*DISPIMG\(&quot;([^&]+)&quot;,(\d+)\)</f>'
    r'<v>=DISPIMG\(&quot;([^&]+)&quot;,(\d+)\)</v>'
    r'</c>'
)


def parse_sheet_dispimg(sheet_xml):
    """返回 { (row0, col0): img_id }"""
    out = {}
    for m in DISPIMG_RE.finditer(sheet_xml):
        col_letters, row_1, attrs, img_id = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        out[(row_1 - 1, col_letters_to_idx(col_letters))] = img_id
    return out


# ---------- 2) 解析 cellimages.xml ----------
def parse_cellimages(cellimages_xml):
    """返回 { img_id: (r_embed, ext_cx, ext_cy) }"""
    out = {}
    root = ET.fromstring(cellimages_xml)
    for ci in root:
        if local(ci.tag) != 'cellImage':
            continue
        img_id = r_embed = None
        ext_cx = ext_cy = None
        for pic in ci.iter():
            if local(pic.tag) == 'cNvPr':
                img_id = pic.get('name') or pic.get('descr')
            if local(pic.tag) == 'blip':
                r_embed = pic.get('{%s}embed' % NS_R) or pic.get('r:embed')
            if local(pic.tag) == 'ext' and pic.get('cx') and pic.get('cy'):
                ext_cx, ext_cy = pic.get('cx'), pic.get('cy')
        if img_id and r_embed:
            out[img_id] = (r_embed, ext_cx, ext_cy)
    return out


def read_rels(zipped, relpath):
    """返回 { rId: target }（target 归一化为 zip 内路径）"""
    rels = {}
    if relpath not in zipped.namelist():
        return rels
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
        if not rid or not tgt:
            continue
        if tgt.startswith('/'):
            full = tgt.lstrip('/')
        else:
            full = os.path.normpath(os.path.join(base, tgt)).replace('\\', '/')
        rels[rid] = full
    return rels


def write_rels(entries, relpath, zout):
    """entries: [(rId, Type, Target)]"""
    body = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="%s">' % NS_RELS]
    for rid, typ, tgt in entries:
        body.append('<Relationship Id="%s" Type="%s" Target="%s"/>' % (rid, typ, tgt))
    body.append('</Relationships>')
    zout.writestr(relpath, ''.join(body))


# ---------- 3) 生成 drawing XML ----------
def build_drawing(anchors, media_map):
    """
    anchors: [(row0, col0, img_id, ext_cx, ext_cy)] 按 (row0,col0) 升序
    media_map: { img_id: media_path }
    返回 (drawing_xml, [(rId, media_path)])
    """
    parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<xdr:wsDr xmlns:xdr="%s" xmlns:a="%s" xmlns:r="%s">' % (NS_DRAW, NS_A, NS_R),
    ]
    rels = []
    for i, (row0, col0, img_id, ext_cx, ext_cy) in enumerate(anchors, start=1):
        rid = 'rId%d' % i
        media_path = media_map.get(img_id)
        if not media_path:
            continue
        ext_name = os.path.splitext(media_path)[1] or '.jpeg'
        cx = ext_cx or '1000000'
        cy = ext_cy or '1000000'
        parts.append(
            '<xdr:oneCellAnchor>'
            '<xdr:from><xdr:col>%d</xdr:col><xdr:colOff>0</xdr:colOff>'
            '<xdr:row>%d</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
            '<xdr:ext cx="%s" cy="%s"/>'
            '<xdr:pic>'
            '<xdr:nvPicPr><xdr:cNvPr id="%d" name="%s" descr="%s"/>'
            '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
            '<xdr:blipFill><a:blip r:embed="%s"/>'
            '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
            '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%s" cy="%s"/></a:xfrm>'
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
            '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor>'
            % (col0, row0, cx, cy, 1000 + i, img_id, img_id, rid, cx, cy)
        )
        rels.append((rid, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', '../media/' + os.path.basename(media_path)))
    parts.append('</xdr:wsDr>')
    return ''.join(parts), rels


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--xlsx', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    src = args.xlsx
    dst = args.out
    if not os.path.isfile(src):
        sys.exit('input not found: ' + src)
    if os.path.abspath(src) == os.path.abspath(dst):
        sys.exit('--out must differ from --xlsx')

    zin = zipfile.ZipFile(src, 'r')
    names = zin.namelist()

    # 读取 cellimages 信息
    cellimages_xml = zin.read('xl/cellimages.xml') if 'xl/cellimages.xml' in names else None
    if not cellimages_xml:
        sys.exit('no xl/cellimages.xml (not a WPS cellimage file)')
    img_info = parse_cellimages(cellimages_xml)  # img_id -> (r_embed, cx, cy)
    cellimg_rels = read_rels(zin, 'xl/_rels/cellimages.xml.rels')  # rId -> media path
    media_map = {}  # img_id -> media path
    for img_id, (rid, cx, cy) in img_info.items():
        if rid in cellimg_rels:
            media_map[img_id] = cellimg_rels[rid]
    print('cellImage 数:', len(img_info), '| 可映射到 media 的图片数:', len(media_map))

    # 遍历所有 sheet，找含 DISPIMG 的工作表
    sheet_paths = [n for n in names if re.match(r'^xl/worksheets/sheet\d+\.xml$', n)]
    drawings = {}  # sheet_path -> drawing_xml
    drawing_rels = {}  # sheet_path -> [(rId,type,target)]
    sheet_xmls = {}
    for sp in sheet_paths:
        xml = zin.read(sp).decode('utf-8')
        sheet_xmls[sp] = xml
        disp = parse_sheet_dispimg(xml)
        if not disp:
            continue
        anchors = []
        for (row0, col0), img_id in sorted(disp.items()):
            info = img_info.get(img_id)
            if not info:
                continue
            _, cx, cy = info
            anchors.append((row0, col0, img_id, cx, cy))
        if not anchors:
            continue
        dxml, rels = build_drawing(anchors, media_map)
        drawings[sp] = dxml
        drawing_rels[sp] = rels
        print('  %s: DISPIMG=%d → drawing anchors=%d' % (sp, len(disp), len(rels)))

    if not drawings:
        sys.exit('no sheet has DISPIMG cells — nothing to convert')

    # 写回新 zip
    if os.path.exists(dst):
        os.remove(dst)
    zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)

    # 解析 sheet 对应的 drawing 文件名（sheet1 -> drawing1）
    def sheet_drawing_names(sp):
        m = re.match(r'^xl/worksheets/sheet(\d+)\.xml$', sp)
        return 'xl/drawings/drawing%s.xml' % m.group(1)

    # [Content_Types].xml 处理
    ct = zin.read('[Content_Types].xml').decode('utf-8')
    # 移除 cellimages override
    ct = re.sub(r'<Override PartName="/xl/cellimages\.xml"[^>]*/>', '', ct)
    # 添加 drawing overrides（在 </Types> 前）
    add = ''
    for sp in drawings:
        dn = sheet_drawing_names(sp)
        add += '<Override PartName="%s" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' % dn
    ct = ct.replace('</Types>', add + '</Types>')

    # workbook.xml.rels：移除指向已删除 cellimages.xml 的关系
    wb_rels = read_rels(zin, 'xl/_rels/workbook.xml.rels')
    wb_rels_xml = zin.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    for rid, tgt in wb_rels.items():
        if 'cellimages' in tgt.lower():
            # 删除对应 <Relationship ...> 节点
            wb_rels_xml = re.sub(r'<Relationship[^>]*Id="%s"[^>]*/>' % re.escape(rid), '', wb_rels_xml)
    wb_rels_updated = True if wb_rels_xml != zin.read('xl/_rels/workbook.xml.rels').decode('utf-8') else False

    for item in zin.infolist():
        name = item.filename
        # 跳过要删除的部件
        if name == 'xl/cellimages.xml' or name == 'xl/_rels/cellimages.xml.rels':
            continue
        if name == '[Content_Types].xml':
            zout.writestr(item, ct.encode('utf-8'))
            continue
        if name == 'xl/_rels/workbook.xml.rels' and wb_rels_updated:
            zout.writestr(item, wb_rels_xml.encode('utf-8'))
            continue
        if name in sheet_xmls:
            xml = sheet_xmls[name]
            # 移除 DISPIMG 公式单元格（保留样式属性）
            def replace_dispimg(m):
                return '<c r="%s%s"%s/>' % (m.group(1), m.group(2), m.group(3))
            xml = DISPIMG_RE.sub(replace_dispimg, xml)
            # 插入 <drawing r:id="rId1"/>（在 </sheetData> 后）
            if name in drawings:
                if '</sheetData>' in xml:
                    xml = xml.replace('</sheetData>', '</sheetData><drawing r:id="rId1"/>', 1)
                else:
                    xml = xml.replace('<extLst>', '<drawing r:id="rId1"/><extLst>', 1)
            zout.writestr(item, xml.encode('utf-8'))
            continue
        # 新增 drawing 与 rels（在循环后统一写）
        zout.writestr(item, zin.read(name))

    # 写 drawings 与 rels
    for sp, dxml in drawings.items():
        dn = sheet_drawing_names(sp)
        zout.writestr(dn, dxml)
        base = os.path.dirname(dn)
        dr = os.path.join(base, '_rels', os.path.basename(dn) + '.rels').replace('\\', '/')
        write_rels(drawing_rels[sp], dr, zout)
        # sheet 的 rels：原可能不存在，新建（只含 drawing 关系）
        sbase = os.path.dirname(sp)
        srel = os.path.join(sbase, '_rels', os.path.basename(sp) + '.rels').replace('\\', '/')
        write_rels([('rId1', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
                     '../drawings/' + os.path.basename(dn))], srel, zout)

    zin.close()
    zout.close()
    print('OK →', dst)


if __name__ == '__main__':
    main()
