# -*- coding: utf-8 -*-
"""用真实中文字体生成表单式培训记录 PDF + 扫描件 PNG，用于验证 OCR 表单识别。"""
import pymupdf

FONT = r"C:\Windows\Fonts\msyh.ttc"

lines = [
    "培训主题：安全生产月主题教育培训",
    "培训日期：2025.11.18",
    "培训地点：东三小1会议室",
    "主持人：高新民",
    "记录人：姜振海、杨秀利",
    "部门：津三区",
    "参加人数：6",
    "培训学时：2",
    "培训类型：安全培训",
    "培训内容：冬季火灾防控、用电安全、隐患排查",
    "培训对象：全体班组人员",
    "考核成绩：90",
]

doc = pymupdf.open()
page = doc.new_page()
page.insert_font(fontname="msyh", fontfile=FONT, fontbuffer=open(FONT, "rb").read())
y = 80
for ln in lines:
    page.insert_text((60, y), ln, fontsize=14, fontname="msyh")
    y += 26
text_pdf = r"G:\hse-dashboard\scripts\_sample_form.pdf"
doc.save(text_pdf)
pix = page.get_pixmap(matrix=pymupdf.Matrix(200 / 72, 200 / 72), alpha=False)
pix.save(r"G:\hse-dashboard\scripts\_sample_form.png")
doc.close()
print("PDF_OK", text_pdf)