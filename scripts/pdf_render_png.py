#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF 渲染为 PNG 页图（PyMuPDF），供 AI 视觉模型（Ollama VL）识别。

用法: python pdf_render_png.py <input.pdf> <out_dir>
输出(stdout): {"pages": ["C:/.../page_1.png", ...]}  或 {"error": "..."}
渲染缩放：2x（约 144dpi）。3x 会使视觉 token 超出 qwen2.5vl 默认上下文，故保持 2x 配合 num_ctx=8192。
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
    doc = fitz.open(src)
    pages = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        p = os.path.join(out_dir, "page_%d.png" % (i + 1))
        pix.save(p)
        pages.append(p)
    print(json.dumps({"pages": pages}, ensure_ascii=False))


if __name__ == "__main__":
    main()
