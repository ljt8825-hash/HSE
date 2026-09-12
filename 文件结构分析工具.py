#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文件结构分析工具 (Folder Structure Analyzer)
============================================
递归遍历指定文件夹及其子文件夹，收集每个文件的关键信息，
并基于分析结果给出目录结构、命名、重复清理、存储与分类的
合理化建议。

本工具为「只读分析」，不会修改、移动或删除任何文件。

用法:
    python folder_analyzer.py <目标文件夹> [选项]

选项:
    --max-depth N    目录嵌套深度超过 N 视为过深 (默认 6)
    --large-mb N     文件大于 N MB 视为过大文件 (默认 50)
    --report PATH    将 Markdown 报告写入指定文件
    --json PATH      将原始分析数据导出为 JSON
    --no-overview    不打印文件清单概览(仅打印问题分组)

示例:
    python folder_analyzer.py "D:/项目资料"
    python folder_analyzer.py . --max-depth 5 --large-mb 100 --report report.md
"""

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

# ------------------------- 配置 -------------------------
DEFAULT_MAX_DEPTH = 6            # 目录嵌套深度阈值
DEFAULT_LARGE_FILE_MB = 50       # 大文件阈值(MB)

# 临时 / 冗余文件扩展名
TEMP_EXTS = {
    '.tmp', '.bak', '.swp', '.old', '.part', '.crdownload',
    '.download', '.log', '.cache', '.temp', '.~',
}
# 临时 / 冗余文件名(不区分大小写, 部分匹配)
TEMP_NAME_PATTERNS = [
    '.ds_store', 'thumbs.db', 'desktop.ini', 'ehthumbs.db',
    '~$', '.dropbox', 'albumart', 'icon\r',
]
# 通常可忽略的构建/依赖目录(视为冗余产物)
REDUNDANT_DIRS = {
    'node_modules', '__pycache__', '.git', '.svn', '.hg',
    'dist', 'build', '.cache', '.idea', '.vscode', 'bin', 'obj',
    'target', 'vendor',
}

# 命名规范允许的字符: 字母/数字/中文/点/下划线/连字符
def _is_standard_char(c: str) -> bool:
    return c.isalnum() or c in '._-'

# 可读性较好的文件类型归类
def classify_ext(ext: str) -> str:
    ext = ext.lower()
    mapping = {
        # 文档
        '.pdf': '文档', '.doc': '文档', '.docx': '文档', '.xls': '文档',
        '.xlsx': '文档', '.ppt': '文档', '.pptx': '文档', '.txt': '文档',
        '.md': '文档', '.rtf': '文档', '.csv': '文档', '.odt': '文档',
        # 图片
        '.png': '图片', '.jpg': '图片', '.jpeg': '图片', '.gif': '图片',
        '.bmp': '图片', '.svg': '图片', '.webp': '图片', '.tiff': '图片',
        # 音视频
        '.mp4': '音视频', '.mov': '音视频', '.avi': '音视频', '.mkv': '音视频',
        '.mp3': '音视频', '.wav': '音视频', '.flac': '音视频', '.aac': '音视频',
        # 压缩
        '.zip': '压缩包', '.rar': '压缩包', '.7z': '压缩包', '.tar': '压缩包',
        '.gz': '压缩包', '.tgz': '压缩包',
        # 代码
        '.py': '代码', '.js': '代码', '.ts': '代码', '.tsx': '代码',
        '.vue': '代码', '.java': '代码', '.c': '代码', '.cpp': '代码',
        '.go': '代码', '.rs': '代码', '.html': '代码', '.css': '代码',
        '.json': '代码', '.xml': '代码', '.sql': '代码', '.sh': '代码',
        '.bat': '代码', '.ps1': '代码',
        # 数据
        '.db': '数据库', '.sqlite': '数据库', '.sqlitedb': '数据库',
        # 可执行
        '.exe': '可执行', '.msi': '可执行', '.dll': '可执行', '.app': '可执行',
    }
    if not ext:
        return '无扩展名'
    return mapping.get(ext, '其他')


def human_size(nbytes: int) -> str:
    size = float(nbytes)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024 or unit == 'TB':
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{nbytes} B"


def sha256_of_file(path: str, chunk=65536) -> str:
    h = hashlib.sha256()
    try:
        with open(path, 'rb') as f:
            for block in iter(lambda: f.read(chunk), b''):
                h.update(block)
    except (OSError, PermissionError):
        return ''
    return h.hexdigest()


def scan(root: str):
    """递归扫描, 返回文件记录列表与目录深度信息。"""
    files = []
    root_path = Path(root).resolve()
    root_parts_len = len(root_path.parts)

    for dirpath, dirnames, filenames in os.walk(root_path):
        # 不深入 node_modules / .git 等纯产物目录以提速(仍记录其存在)
        dirnames[:] = [d for d in dirnames if d.lower() not in REDUNDANT_DIRS]

        cur = Path(dirpath)
        rel_depth = len(cur.parts) - root_parts_len

        for fn in filenames:
            full = cur / fn
            try:
                st = full.stat()
            except (OSError, PermissionError):
                continue
            ext = full.suffix.lower()
            files.append({
                'name': fn,
                'ext': ext,
                'type': classify_ext(ext),
                'size': st.st_size,
                'mtime': st.st_mtime,
                'path': str(full),
                'depth': rel_depth,
                'parent': str(cur),
            })
    return files, root_path


def analyze(files, root_path, max_depth, large_mb):
    """执行各项问题分析, 返回结构化结果。"""
    result = {}

    # ---- 1. 总览统计 ----
    total_files = len(files)
    total_size = sum(f['size'] for f in files)
    ext_counter = Counter(f['ext'] or '(无扩展名)' for f in files)
    type_counter = Counter(f['type'] for f in files)
    type_size = defaultdict(int)
    for f in files:
        type_size[f['type']] += f['size']

    # 目录占用(含子文件大小之和)
    dir_size = defaultdict(int)
    dir_count = defaultdict(int)
    for f in files:
        p = Path(f['parent'])
        # 向上累计到 root
        try:
            rel = p.relative_to(root_path)
        except ValueError:
            rel = Path()
        for i in range(len(rel.parts) + 1):
            key = root_path / Path(*rel.parts[:i])
            dir_size[str(key)] += f['size']
            if i == len(rel.parts):
                dir_count[str(key)] += 1

    result['overview'] = {
        'total_files': total_files,
        'total_size': total_size,
        'ext_counter': dict(ext_counter.most_common()),
        'type_counter': dict(type_counter.most_common()),
        'type_size': dict(type_size),
        'top_dirs': sorted(
            [(d, s, dir_count.get(d, 0)) for d, s in dir_size.items() if d != str(root_path)],
            key=lambda x: x[1], reverse=True)[:10],
    }

    # ---- 2. 重复文件 (按内容哈希) ----
    # 先按大小分组, 只对同大小的文件做哈希, 提速
    size_groups = defaultdict(list)
    for f in files:
        size_groups[f['size']].append(f)
    dup_groups = []
    for size, group in size_groups.items():
        if size == 0:
            # 空文件视为潜在冗余, 单独标注
            if len(group) > 1:
                dup_groups.append({
                    'hash': 'EMPTY', 'size': 0,
                    'files': [g['path'] for g in group],
                })
            continue
        if len(group) < 2:
            continue
        hash_map = defaultdict(list)
        for g in group:
            h = sha256_of_file(g['path'])
            if h:
                hash_map[h].append(g['path'])
        for h, paths in hash_map.items():
            if len(paths) > 1:
                dup_groups.append({'hash': h, 'size': size, 'files': paths})
    result['duplicates'] = dup_groups

    # ---- 3. 深层嵌套目录 ----
    deep_files = [f for f in files if f['depth'] > max_depth]
    result['deep_nested'] = sorted(deep_files, key=lambda x: x['depth'], reverse=True)

    # ---- 4. 命名不规范 ----
    naming_issues = []
    for f in files:
        name = f['name']
        reasons = []
        if ' ' in name:
            reasons.append('含空格')
        bad = [c for c in name if not _is_standard_char(c)]
        if bad:
            uniq = ''.join(sorted(set(bad)))
            reasons.append(f'含特殊字符({uniq})')
        if reasons:
            naming_issues.append({'path': f['path'], 'reasons': reasons})
    result['naming'] = naming_issues

    # ---- 5. 临时 / 冗余文件 ----
    temp_files = []
    for f in files:
        ext = f['ext']
        nm = f['name'].lower()
        flag = None
        if ext in TEMP_EXTS:
            flag = f'临时扩展名 {ext}'
        else:
            for pat in TEMP_NAME_PATTERNS:
                if pat in nm:
                    flag = f'临时/系统文件 ({pat})'
                    break
        if flag:
            temp_files.append({'path': f['path'], 'reason': flag, 'size': f['size']})
    result['temp'] = temp_files

    # ---- 6. 未分类杂散文件 (直接散落在根目录下的文件) ----
    stray_files = [f for f in files if f['depth'] == 0]
    result['stray'] = stray_files

    # ---- 7. 过大文件 ----
    threshold = large_mb * 1024 * 1024
    large_files = sorted(
        [f for f in files if f['size'] > threshold],
        key=lambda x: x['size'], reverse=True)
    result['large'] = large_files
    result['large_threshold'] = large_mb

    return result


# ------------------------- 报告生成 -------------------------
def build_overview_md(ov, root_path):
    lines = []
    lines.append(f"# 文件结构分析报告")
    lines.append("")
    lines.append(f"- **扫描路径**: `{root_path}`")
    lines.append(f"- **扫描时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"- **文件总数**: {ov['total_files']}")
    lines.append(f"- **占用总空间**: {human_size(ov['total_size'])}")
    lines.append("")
    lines.append("## 一、文件清单概览")
    lines.append("")
    lines.append("### 按类型分布")
    lines.append("")
    lines.append("| 类型 | 文件数 | 总大小 | 占比 |")
    lines.append("|------|-------:|-------:|-----:|")
    total = ov['total_size'] or 1
    for t, cnt in ov['type_counter'].items():
        sz = ov['type_size'].get(t, 0)
        pct = sz / total * 100
        lines.append(f"| {t} | {cnt} | {human_size(sz)} | {pct:.1f}% |")
    lines.append("")
    lines.append("### 按扩展名 Top 15")
    lines.append("")
    lines.append("| 扩展名 | 数量 |")
    lines.append("|--------|------:|")
    for ext, cnt in list(ov['ext_counter'].items())[:15]:
        lines.append(f"| `{ext}` | {cnt} |")
    lines.append("")
    lines.append("### 空间占用最大的目录 Top 10")
    lines.append("")
    lines.append("| 目录 | 文件数 | 占用空间 |")
    lines.append("|------|------:|---------:|")
    for d, sz, cnt in ov['top_dirs']:
        lines.append(f"| `{d}` | {cnt} | {human_size(sz)} |")
    lines.append("")
    return "\n".join(lines)


def build_problems_md(res):
    lines = []
    lines.append("## 二、问题分析与优化建议")
    lines.append("")

    # 1. 重复文件
    lines.append("### 1. 重复文件")
    lines.append("")
    if res['duplicates']:
        wasted = sum(g['size'] * (len(g['files']) - 1) for g in res['duplicates'])
        lines.append(
            f"发现 **{len(res['duplicates'])}** 组内容完全相同的重复文件，"
            f"可释放约 **{human_size(wasted)}** 存储空间。")
        lines.append("")
        for i, g in enumerate(res['duplicates'][:20], 1):
            lines.append(f"**组 {i}** (大小 {human_size(g['size'])}，SHA256 `{g['hash'][:12]}…`)：")
            for p in g['files']:
                lines.append(f"  - `{p}`")
            lines.append("")
        lines.append("**建议**：确认内容一致后，保留一份权威副本（建议放入统一的 `归档/素材库`），"
                     "其余副本可移入 `待清理/` 或直接删除。可借助 `fdupes`、`czkawka` 等工具批量去重。")
    else:
        lines.append("未发现内容重复的文件。")
    lines.append("")

    # 2. 深层嵌套
    lines.append("### 2. 深层嵌套目录")
    lines.append("")
    if res['deep_nested']:
        lines.append(
            f"发现 **{len(res['deep_nested'])}** 个文件位于嵌套深度超过 "
            f"`{args.max_depth}` 层的目录中，路径过深会降低可维护性与检索效率。")
        lines.append("")
        for f in res['deep_nested'][:15]:
            lines.append(f"  - 深度 {f['depth']} 层：`{f['path']}`")
        lines.append("")
        lines.append("**建议**：遵循「项目 / 模块 / 子主题」三层结构，将深层目录扁平化；"
                     "例如把 `资料/2024/季度/部门/小组/文件.docx` 重组为 "
                     "`资料/2024Q_部门_小组_文件.docx` 或 `资料/2024/部门-小组/文件.docx`。")
    else:
        lines.append(f"目录嵌套深度均在 {args.max_depth} 层以内，结构合理。")
    lines.append("")

    # 3. 命名不规范
    lines.append("### 3. 命名不规范（含空格或特殊字符）")
    lines.append("")
    if res['naming']:
        lines.append(
            f"发现 **{len(res['naming'])}** 个文件名包含空格或特殊字符，"
            f"可能在脚本、URL、跨平台拷贝时出错。")
        lines.append("")
        for item in res['naming'][:15]:
            lines.append(f"  - {', '.join(item['reasons'])}：`{item['path']}`")
        lines.append("")
        lines.append("**建议**：统一采用 `小写字母+连字符/下划线+有意义的词` 命名法，"
                     "例如 `项目周报_2024-07.docx`、`data_export_v2.csv`；"
                     "避免空格（用 `-` 或 `_` 替代）、`# & % @ ( )` 等符号；"
                     "可用 `rename` / `PowerRename` 批量重命名。")
    else:
        lines.append("文件名均符合规范（字母/数字/中文/点/下划线/连字符）。")
    lines.append("")

    # 4. 临时/冗余
    lines.append("### 4. 临时或冗余文件")
    lines.append("")
    if res['temp']:
        wasted = sum(t['size'] for t in res['temp'])
        lines.append(
            f"发现 **{len(res['temp'])}** 个临时/系统冗余文件，"
            f"占用约 **{human_size(wasted)}**。")
        lines.append("")
        for t in res['temp'][:15]:
            lines.append(f"  - {t['reason']}：`{t['path']}`")
        lines.append("")
        lines.append("**建议**：将 `.tmp/.bak/.log/.cache`、`.DS_Store`、`thumbs.db` 等"
                     "移入 `待清理/` 或直接删除；可在 `.gitignore` 中忽略 `node_modules/`、`__pycache__/` "
                     "等构建产物目录，避免其进入版本库。")
    else:
        lines.append("未发现明显的临时/冗余文件。")
    lines.append("")

    # 5. 未分类杂散
    lines.append("### 5. 未分类的杂散文件")
    lines.append("")
    if res['stray']:
        lines.append(
            f"根目录下散落 **{len(res['stray'])}** 个未归类文件，"
            f"说明顶层缺乏分类结构。")
        lines.append("")
        for f in res['stray'][:15]:
            lines.append(f"  - `{f['path']}`")
        lines.append("")
        lines.append("**建议**：建立清晰的顶层分类目录，例如 "
                     "`文档/`、`图片/`、`数据/`、`代码/`、`归档/`、`待处理/`，"
                     "再按「年份-项目」二级归类；零散文件先放入 `待处理/` 待后续整理。")
    else:
        lines.append("根目录下无散落文件，分类结构清晰。")
    lines.append("")

    # 6. 过大文件
    lines.append(f"### 6. 过大文件（> {res['large_threshold']} MB）")
    lines.append("")
    if res['large']:
        lines.append(
            f"发现 **{len(res['large'])}** 个大文件，"
            f"合计约 **{human_size(sum(f['size'] for f in res['large']))}**，"
            f"可能为视频、镜像或数据库。")
        lines.append("")
        for f in res['large'][:15]:
            lines.append(f"  - {human_size(f['size'])}：`{f['path']}`")
        lines.append("")
        lines.append("**建议**：大文件（尤其是视频/安装包）建议迁移至对象存储、"
                     "NAS 或网盘，本地仅保留索引；数据库/虚拟机镜像应单独归档并定期清理快照；"
                     "对重复大文件优先去重。")
    else:
        lines.append(f"未发现超过 {res['large_threshold']} MB 的文件。")
    lines.append("")

    return "\n".join(lines)


def build_summary_md(res):
    issues = []
    if res['duplicates']:
        issues.append(f"重复文件 {len(res['duplicates'])} 组")
    if res['deep_nested']:
        issues.append(f"深层嵌套 {len(res['deep_nested'])} 个文件")
    if res['naming']:
        issues.append(f"命名不规范 {len(res['naming'])} 个")
    if res['temp']:
        issues.append(f"临时/冗余 {len(res['temp'])} 个")
    if res['stray']:
        issues.append(f"杂散文件 {len(res['stray'])} 个")
    if res['large']:
        issues.append(f"过大文件 {len(res['large'])} 个")
    summary = "## 三、整体结论\n\n"
    if issues:
        summary += "本次扫描共发现以下待优化项：\n\n"
        summary += "\n".join(f"- {x}" for x in issues) + "\n\n"
        summary += ("**优先行动**：① 清理临时/冗余文件释放空间 → "
                    "② 去重重复文件 → ③ 重命名不规范文件 → "
                    "④ 建立分类目录收纳杂散文件 → ⑤ 大文件外移归档。\n")
    else:
        summary += "未发现明显结构问题，目录组织良好。\n"
    return summary


def main():
    parser = argparse.ArgumentParser(
        description='文件结构分析工具：递归遍历并给出组织优化建议（只读）。')
    parser.add_argument('folder', help='要分析的目标文件夹路径')
    parser.add_argument('--max-depth', type=int, default=DEFAULT_MAX_DEPTH)
    parser.add_argument('--large-mb', type=int, default=DEFAULT_LARGE_FILE_MB)
    parser.add_argument('--report', help='将 Markdown 报告写入此文件')
    parser.add_argument('--json', help='将原始分析数据导出为 JSON')
    parser.add_argument('--no-overview', action='store_true',
                        help='仅输出问题分组，不打印概览')
    global args
    args = parser.parse_args()

    root = args.folder
    if not os.path.isdir(root):
        print(f"[错误] 文件夹不存在或不可访问: {root}", file=sys.stderr)
        sys.exit(1)

    print(f"[*] 正在扫描: {root}")
    files, root_path = scan(root)
    print(f"[*] 已扫描 {len(files)} 个文件，开始分析...")
    res = analyze(files, root_path, args.max_depth, args.large_mb)

    overview_md = build_overview_md(res['overview'], root_path)
    problems_md = build_problems_md(res)
    summary_md = build_summary_md(res)
    full = overview_md + "\n" + problems_md + "\n" + summary_md

    # 控制台输出
    if not args.no_overview:
        print("\n" + overview_md)
    print("\n" + problems_md)
    print("\n" + summary_md)

    if args.report:
        Path(args.report).write_text(full, encoding='utf-8')
        print(f"\n[+] 报告已写入: {args.report}")

    if args.json:
        export = {
            'overview': res['overview'],
            'duplicates': res['duplicates'],
            'deep_nested': res['deep_nested'],
            'naming': res['naming'],
            'temp': res['temp'],
            'stray': res['stray'],
            'large': res['large'],
        }
        Path(args.json).write_text(
            json.dumps(export, ensure_ascii=False, indent=2, default=str),
            encoding='utf-8')
        print(f"[+] 原始数据已导出: {args.json}")


if __name__ == '__main__':
    main()
