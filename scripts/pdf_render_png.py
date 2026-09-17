#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF 渲染为 PNG 页图（PyMuPDF），供 AI 视觉模型（Ollama VL）识别。

用法: python pdf_render_png.py <input.pdf> <out_dir>
输出(stdout): {"pages": ["C:/.../page_1.png", ...]}  或 {"error": "..."}
渲染缩放：默认 2x（约 144dpi），可用环境变量 PDF_RENDER_SCALE 覆盖（1~4）。
倍率越高小字迹格子越清楚（利于数行），但视觉 token 与耗时同步上升；
qwen2.5vl 配 num_ctx=8192 时建议不超过 3x。
"""
import json
import os
import sys

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    import fitz
except ImportError:
    print(json.dumps({"error": "PyMuPDF(fitz) 未安装：pip install pymupdf"}, ensure_ascii=False))
    sys.exit(2)


def main():
    src = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    try:
        scale = float(os.environ.get("PDF_RENDER_SCALE", "2"))
    except ValueError:
        scale = 2.0
    scale = max(1.0, min(4.0, scale))

    doc = fitz.open(src)
    pages = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        p = os.path.join(out_dir, "page_%d.png" % (i + 1))
        pix.save(p)
        pages.append(p)
    print(json.dumps({"pages": pages}, ensure_ascii=False))


if __name__ == "__main__":
    main()
