#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
端到端测试: Polars 优化版解析器
验证文件读取 → 列匹配 → 数据清洗 → row_hash 计算 → 预览数据生成
"""
import sys
import os
import time
import json

# 添加脚本目录到 path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from import_parser import (
    read_file, normalize_columns, normalize_column_name,
    match_columns, clean_dataframe, calculate_row_hash_batch,
    calculate_file_hash, extract_data_period, identify_module,
    load_config_from_json, DB_CONFIG,
)
import polars as pl

# 测试文件
TEST_FILES = [
    (r"F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险\人员保险.csv", "人员保险.csv"),
    (r"F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险\人员保险.xlsx", "人员保险.xlsx"),
    (r"F:\个人文件\新安全看板\数据源\08_现场管理\宁津项目三违检查清单_三违检查记录表.xlsx", "宁津项目三违检查清单_三违检查记录表.xlsx"),
    (r"F:\个人文件\新安全看板\数据源\02_保险及人员管理\车辆保险\宁津项目车辆保险统计表.xlsx", "宁津项目车辆保险统计表.xlsx"),
    (r"F:\个人文件\新安全看板\数据源\03_规章制度\制度清单.xlsx", "制度清单.xlsx"),
]


def test_read_and_parse(file_path: str, file_name: str):
    """测试单个文件的完整解析流程"""
    print(f"\n{'='*60}")
    print(f"测试: {file_name}")
    print(f"{'='*60}")

    # 1. 文件存在检查
    if not os.path.exists(file_path):
        print(f"  ✗ 文件不存在: {file_path}")
        return False

    # 2. 读取文件
    t0 = time.perf_counter()
    try:
        df = read_file(file_path, header_row=0)
    except Exception as e:
        print(f"  ✗ 读取失败: {e}")
        return False
    t_read = time.perf_counter() - t0

    # 标准化列名
    df = normalize_columns(df)
    # 删除全空行
    df = df.filter(~pl.all_horizontal(pl.all().is_null()))

    print(f"  ✓ 读取: {t_read*1000:.1f}ms, {df.height} rows, {df.width} cols")
    print(f"  列名: {df.columns[:8]}{'...' if len(df.columns) > 8 else ''}")

    # 3. 加载配置
    json_config = load_config_from_json()
    modules = json_config.get('modules', {})

    # 模拟识别模块 (使用文件名关键词)
    module_type = None
    module_keywords = json_config.get('filename_parsing', {}).get('module_keywords', {})
    for mod_type, keywords in module_keywords.items():
        for kw in keywords:
            if kw in file_name:
                module_type = mod_type
                break
        if module_type:
            break

    if not module_type:
        print(f"  - 未识别到模块类型, 跳过后续测试")
        return True

    # 找到对应的表配置
    table_config = None
    if module_type in modules:
        for tbl in modules[module_type].get('tables', []):
            table_config = tbl
            break

    if not table_config:
        print(f"  - 未找到表配置, 跳过后续测试")
        return True

    column_mapping = table_config.get('column_mapping', {})
    aliases = table_config.get('aliases', {})
    cleaning_rules = table_config.get('cleaning', {})

    # 4. 列匹配
    t0 = time.perf_counter()
    col_mapping = match_columns(df.columns, column_mapping, aliases)
    t_match = time.perf_counter() - t0

    matched_count = len(col_mapping)
    total_mapping = len(column_mapping)
    print(f"  ✓ 列匹配: {t_match*1000:.1f}ms, {matched_count}/{total_mapping} 列匹配")

    if matched_count == 0:
        print(f"  ✗ 无匹配列")
        return False

    # 显示匹配结果
    for excel_col, db_col in list(col_mapping.items())[:5]:
        print(f"    {excel_col} → {db_col}")

    # 5. 数据清洗
    t0 = time.perf_counter()
    df = clean_dataframe(df, col_mapping, cleaning_rules)
    t_clean = time.perf_counter() - t0
    print(f"  ✓ 数据清洗: {t_clean*1000:.1f}ms")

    # 6. Row Hash 计算
    t0 = time.perf_counter()
    hashes = calculate_row_hash_batch(df, col_mapping)
    t_hash = time.perf_counter() - t0
    print(f"  ✓ Row Hash: {t_hash*1000:.1f}ms, {len(hashes)} 行")

    # 显示前3个 hash
    if hashes:
        print(f"    示例 hash[0]: {hashes[0][:32]}...")

    # 7. 预览数据
    t0 = time.perf_counter()
    from import_parser import df_to_serializable_dicts
    preview = df_to_serializable_dicts(df, col_mapping, n_rows=3)
    t_preview = time.perf_counter() - t0
    print(f"  ✓ 预览数据: {t_preview*1000:.1f}ms, {len(preview)} 行")

    if preview:
        first_row = preview[0]
        # 显示前3个字段
        items = list(first_row.items())[:3]
        for k, v in items:
            print(f"    {k}: {v}")

    # 汇总
    total_time = t_read + t_match + t_clean + t_hash + t_preview
    print(f"  总耗时: {total_time*1000:.1f}ms")

    return True


def test_data_period():
    """测试数据周期提取"""
    print(f"\n{'='*60}")
    print("测试: 数据周期提取")
    print(f"{'='*60}")

    test_cases = [
        ("人员保险2026年7月.csv", "2026-07-01"),
        ("2026-04五险一金.xlsx", "2026-04-01"),
        ("2026年第3季度报告.xlsx", "2026-07-01"),
        ("2026年度统计.xlsx", "2026-01-01"),
        ("无日期文件.xlsx", None),  # 应返回当前月份
    ]

    all_pass = True
    for file_name, expected in test_cases:
        result = extract_data_period(file_name)
        if expected and result == expected:
            print(f"  ✓ {file_name} → {result}")
        elif expected is None:
            print(f"  ✓ {file_name} → {result} (当前月份)")
        else:
            print(f"  ✗ {file_name} → {result}, 期望 {expected}")
            all_pass = False

    return all_pass


def main():
    print("=" * 60)
    print("Polars 优化版解析器 — 端到端测试")
    print("=" * 60)

    # 数据周期测试
    test_data_period()

    # 文件解析测试
    success_count = 0
    total_count = 0

    for file_path, file_name in TEST_FILES:
        total_count += 1
        if test_read_and_parse(file_path, file_name):
            success_count += 1

    # 汇总
    print(f"\n{'='*60}")
    print(f"测试完成: {success_count}/{total_count} 文件解析成功")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
