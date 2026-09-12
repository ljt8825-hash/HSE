# -*- coding: utf-8 -*-
"""Generate a synthetic training-record table PNG for OCR testing."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 360
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)

FONT = None
for cand in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simsun.ttc", r"C:\Windows\Fonts\simhei.ttf"]:
    try:
        FONT = ImageFont.truetype(cand, 22)
        break
    except Exception:
        continue

headers = ["姓名", "部门", "岗位", "培训类型", "培训日期", "培训内容", "成绩", "结果"]
rows = [
    ["张三", "运维部", "安全员", "安全培训", "2026-08-01", "消防知识培训", "96", "合格"],
    ["李四", "机务部", "机修工", "岗位技能", "2026-08-05", "设备操作规程", "88", "合格"],
    ["王五", "生产部", "班组长", "应急演练", "2026-08-10", "应急逃生演练", "75", "合格"],
]
ncols = len(headers)
nrows = len(rows) + 1  # + header row
cell_w = W // ncols
cell_h = 50
margin = 10
x0, y0 = 0, 0

# grid
for i in range(ncols + 1):
    x = x0 + i * cell_w
    d.line([(x, y0), (x, y0 + nrows * cell_h)], fill="black", width=2)
for j in range(nrows + 1):
    y = y0 + j * cell_h
    d.line([(x0, y), (x0 + ncols * cell_w, y)], fill="black", width=2)

def center(txt, cx, cy, w_, h_):
    bbox = d.textbbox((0, 0), txt, font=FONT)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx + (w_ - tw) / 2 - bbox[0], cy + (h_ - th) / 2 - bbox[1]), txt, fill="black", font=FONT)

for ci, h in enumerate(headers):
    center(h, x0 + ci * cell_w + margin, y0 + margin, cell_w - 2 * margin, cell_h - 2 * margin)
for ri, row in enumerate(rows, start=1):
    for ci, val in enumerate(row):
        center(val, x0 + ci * cell_w + margin, y0 + ri * cell_h + margin, cell_w - 2 * margin, cell_h - 2 * margin)

img.save(r"G:\hse-dashboard\scripts\_sample_training.png")
print("saved", img.size)