"""
把所有浮动图片嵌入对应单元格（单格贴合、等比缩放、居中），单元格行高列宽不变。

用法:
  python embed_images_in_cells.py --in <src.xlsx> --out <dest.xlsx>
可选:
  --img-cols  一个或多个，从列分组映射；内建映射:
              from-col 7/8/9/10 -> 7/8/9/10(H/I/J/K三违照片1-4)
              from-col 14/15/21 -> 15(P 整改后照片)
  --padding   单元格内边距(px, 默认2)，避免图片贴边
"""
import argparse, sys, zipfile, os, io
from xml.etree import ElementTree as ET
from collections import defaultdict, OrderedDict
from PIL import Image

# ---- 命名空间 ----
NS = {
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}
A = NS["a"]
X = NS["xdr"]
M = NS["main"]
PIC = NS["pic"]
EMU_PER_PX = 9525  # 96 DPI
DEF_COL_WIDTH = 8.43
DEF_ROW_HEIGHT = 15.0

# from-col -> 目标列(0-based 索引)，14/15/21 均归 P(15)
def target_col(c0):
    if c0 in (7, 8, 9, 10):
        return c0
    return 15


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="src", required=True)
    p.add_argument("--out", dest="dst", required=True)
    p.add_argument("--padding", type=float, default=2.0)
    return p.parse_args()


def load_dims(z):
    """从 sheet1.xml 读取列宽(1-based)与行高(1-based)及默认值。"""
    data = z.read("xl/worksheets/sheet1.xml")
    root = ET.fromstring(data)
    colw = {}
    rowh = {}
    defcol = DEF_COL_WIDTH
    defrow = DEF_ROW_HEIGHT
    sf = root.find("{%s}sheetFormatPr" % M)
    if sf is not None:
        if sf.get("defaultColWidth"):
            defcol = float(sf.get("defaultColWidth"))
        if sf.get("defaultRowHeight"):
            defrow = float(sf.get("defaultRowHeight"))
    for col in root.iter("{%s}col" % M):
        cmin = int(col.get("min", 1))
        cmax = int(col.get("max", cmin))
        w = float(col.get("width", defcol))
        for i in range(cmin, cmax + 1):
            colw[i] = w
    for row in root.iter("{%s}row" % M):
        r = int(row.get("r"))
        ht = row.get("ht")
        if ht:
            rowh[r] = float(ht)
    return colw, rowh, defcol, defrow


def px_width(chars):
    # Excel 列宽(字符) -> 像素(含左右 padding 5px)
    return chars * 7.0 + 5.0


def px_height(pts):
    return pts * 4.0 / 3.0


def main():
    args = parse_args()
    src, dst = args.src, args.dst
    pad = args.padding

    z = zipfile.ZipFile(src, "r")
    namelist = z.namelist()
    colw, rowh, defcol, defrow = load_dims(z)

    dn = "xl/drawings/drawing1.xml"
    root = ET.fromstring(z.read(dn))
    rels_path = "xl/drawings/_rels/" + os.path.basename(dn) + ".rels"
    rid_map = {}
    rr = ET.fromstring(z.read(rels_path))
    rid_map = {el.get("Id"): el.get("Target") for el in rr}
    rid_to_media = rid_map

    wsdr = root
    two_tag = "{%s}twoCellAnchor" % X
    pic_tag = "{%s}pic" % X

    children = list(wsdr)
    images = []  # (el, r0, tcol, media, rid)
    for el in children:
        pic = el.find(".//%s" % pic_tag)
        if el.tag != two_tag or pic is None:
            continue
        frm = el.find("{%s}from" % X)
        r0 = int(frm.find("{%s}row" % X).text)
        c0 = int(frm.find("{%s}col" % X).text)
        blip = pic.find(".//{%s}blip" % A)
        rid = blip.get("{%s}embed" % NS["r"]) if blip is not None else None
        media = rid_map.get(rid)
        images.append((el, r0, c0, media))

    print("IMAGE_ANCHORS=%d" % len(images))

    # 图片尺寸缓存
    size_cache = {}
    def img_size(media):
        if not media:
            return None
        if media in size_cache:
            return size_cache[media]
        w = h = None
        try:
            stream = z.open("xl/" + media.replace("../", ""))
            im = Image.open(stream)
            w, h = im.size
            stream.close()
        except Exception:
            w = h = None
        size_cache[media] = (w, h)
        return (w, h)

    UNMAPPED = {"delta": 0}
    # 统计每个目标单元格的图片数，用于多图纵排
    group = defaultdict(int)
    mapping = []
    for el, r0, c0, media in images:
        tcol = target_col(c0)
        row1 = r0 + 1
        group[(row1, tcol)] += 1
        mapping.append((el, r0, tcol, media))

    slot = defaultdict(int)

    def contain(box_w, box_h, ar):
        """在 (box_w,box_h) 内等比缩放居中，返回 (w,h,off_x,off_y)。ar 为 None 时铺满。"""
        if not ar:
            return box_w, box_h, 0.0, 0.0
        ba = box_w / box_h
        if ar >= ba:
            bw = box_w
            bh = box_w / ar
        else:
            bh = box_h
            bw = box_h * ar
        ox = (box_w - bw) / 2
        oy = (box_h - bh) / 2
        return bw, bh, ox, oy

    def build_onecell(el, r0, tcol, media, slot_k, slot_total):
        cell_w = px_width(colw.get(tcol + 1, defcol))
        cell_h = px_height(rowh.get(r0 + 1, defrow))
        avail_w = max(cell_w - 2 * pad, 4)
        avail_h = max(cell_h - 2 * pad, 4)
        img = img_size(media)
        ar = (img[0] / float(img[1])) if (img and img[0] and img[1]) else None
        if slot_total == 1:
            bw, bh, ox, oy = contain(avail_w, avail_h, ar)
            ox += pad
            oy += pad
        else:
            ch = avail_h / slot_total
            bw, bh, ox, oy = contain(avail_w, ch, ar)
            ox += pad
            oy += pad + slot_k * ch

        nc = ET.Element("{%s}oneCellAnchor" % X)
        frm = ET.SubElement(nc, "{%s}from" % X)
        c = ET.SubElement(frm, "{%s}col" % X); c.text = str(tcol)
        co = ET.SubElement(frm, "{%s}colOff" % X); co.text = str(int(round(ox * EMU_PER_PX)))
        rrel = ET.SubElement(frm, "{%s}row" % X); rrel.text = str(r0)
        ro = ET.SubElement(frm, "{%s}rowOff" % X); ro.text = str(int(round(oy * EMU_PER_PX)))
        ext = ET.SubElement(nc, "{%s}ext" % X)
        ext.set("cx", str(int(round(bw * EMU_PER_PX))))
        ext.set("cy", str(int(round(bh * EMU_PER_PX))))
        nc.append(el.find(".//%s" % pic_tag))
        ET.SubElement(nc, "{%s}clientData" % X)
        return nc

    new_children = []
    images_done = 0
    for el in children:
        pic = el.find(".//%s" % pic_tag)
        if el.tag == two_tag and pic is not None:
            item = mapping[images_done]  # mapping 与 children 同序
            el0, r0, tcol, media = item
            key = (r0 + 1, tcol)
            k = slot[key]
            total = group[key]
            new_children.append(build_onecell(el0, r0, tcol, media, k, total))
            slot[key] += 1
            images_done += 1
        else:
            new_children.append(el)
    for e in list(wsdr):
        wsdr.remove(e)
    for e in new_children:
        wsdr.append(e)

    # 控制命名空间前缀，产出干净 XML
    ET.register_namespace("xdr", NS["xdr"])
    ET.register_namespace("a", NS["a"])
    ET.register_namespace("r", NS["r"])
    ET.register_namespace("pic", NS["pic"])

    new_drawing = ET.tostring(root, encoding="UTF-8", xml_declaration=True,
                              default_namespace=None)

    # ---- 重写 zip ----
    tmp = dst + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zo:
        for item in z.infolist():
            name = item.filename
            if name == dn:
                data = new_drawing
                compress = zipfile.ZIP_DEFLATED
            else:
                data = z.read(name)
                if name.startswith("xl/media/"):
                    compress = zipfile.ZIP_STORED
                else:
                    compress = zipfile.ZIP_DEFLATED
            zo.writestr(name, data, compress_type=compress)
    z.close()

    os.replace(tmp, dst)
    print("DONE imgs=%d -> %s" % (images_done, dst))


if __name__ == "__main__":
    main()