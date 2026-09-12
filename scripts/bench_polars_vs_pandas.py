#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
性能对比测试: pandas vs polars 解析引擎
测试文件读取、数据清洗、row_hash 计算的执行时间
"""
import time
import sys
import json
import os

# 确保使用 managed Python
PYTHON = sys.executable

# 测试文件
CSV_FILE = r"F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险\人员保险.csv"
XLSX_FILE = r"F:\个人文件\新安全看板\数据源\02_保险及人员管理\人员保险\人员保险.xlsx"
XLSX_LARGE = r"F:\个人文件\新安全看板\数据源\08_现场管理\宁津项目三违检查清单_三违检查记录表.xlsx"

def test_polars_csv():
    """测试 Polars CSV 读取"""
    import polars as pl
    t0 = time.perf_counter()
    df = pl.read_csv(CSV_FILE, encoding='utf8', try_parse_dates=True, null_values=['', 'NA', 'N/A'])
    elapsed = time.perf_counter() - t0
    print(f"[Polars] CSV 读取: {elapsed*1000:.1f}ms, {df.height} rows, {df.width} cols")
    return df, elapsed

def test_pandas_csv():
    """测试 pandas CSV 读取"""
    import pandas as pd
    t0 = time.perf_counter()
    df = pd.read_csv(CSV_FILE, encoding='utf-8')
    elapsed = time.perf_counter() - t0
    print(f"[pandas] CSV 读取: {elapsed*1000:.1f}ms, {len(df)} rows, {len(df.columns)} cols")
    return df, elapsed

def test_polars_excel():
    """测试 Polars Excel 读取 (calamine)"""
    import polars as pl
    t0 = time.perf_counter()
    df = pl.read_excel(XLSX_FILE, engine='calamine')
    elapsed = time.perf_counter() - t0
    print(f"[Polars] Excel(calamine) 读取: {elapsed*1000:.1f}ms, {df.height} rows, {df.width} cols")
    return df, elapsed

def test_pandas_excel():
    """测试 pandas Excel 读取 (openpyxl)"""
    import pandas as pd
    t0 = time.perf_counter()
    df = pd.read_excel(XLSX_FILE, engine='openpyxl')
    elapsed = time.perf_counter() - t0
    print(f"[pandas] Excel(openpyxl) 读取: {elapsed*1000:.1f}ms, {len(df)} rows, {len(df.columns)} cols")
    return df, elapsed

def test_polars_excel_large():
    """测试 Polars 读取大型 Excel"""
    import polars as pl
    t0 = time.perf_counter()
    df = pl.read_excel(XLSX_LARGE, engine='calamine')
    elapsed = time.perf_counter() - t0
    print(f"[Polars] Excel大型(calamine): {elapsed*1000:.1f}ms, {df.height} rows, {df.width} cols")
    return df, elapsed

def test_pandas_excel_large():
    """测试 pandas 读取大型 Excel"""
    import pandas as pd
    t0 = time.perf_counter()
    df = pd.read_excel(XLSX_LARGE, engine='openpyxl')
    elapsed = time.perf_counter() - t0
    print(f"[pandas] Excel大型(openpyxl): {elapsed*1000:.1f}ms, {len(df)} rows, {len(df.columns)} cols")
    return df, elapsed

def test_polars_cleaning(df):
    """测试 Polars 向量化清洗"""
    import polars as pl

    # 模拟身份证号清洗
    t0 = time.perf_counter()
    if '身份证号码' in df.columns:
        df = df.with_columns(
            pl.col('身份证号码')
            .cast(pl.Utf8, strict=False)
            .str.replace_all(' ', '', literal=True)
            .str.replace_all('-', '', literal=True)
            .str.strip_chars()
            .alias('身份证号码')
        )
    elapsed = time.perf_counter() - t0
    print(f"[Polars] 身份证清洗: {elapsed*1000:.1f}ms")
    return df, elapsed

def test_pandas_cleaning(df):
    """测试 pandas apply 清洗"""
    import pandas as pd
    import math

    def clean_id_card(v):
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return None
        return str(v).strip().replace(' ', '').replace('-', '')

    t0 = time.perf_counter()
    if '身份证号码' in df.columns:
        df['身份证号码'] = df['身份证号码'].apply(clean_id_card)
    elapsed = time.perf_counter() - t0
    print(f"[pandas] 身份证清洗(apply): {elapsed*1000:.1f}ms")
    return df, elapsed

def test_polars_hash(df):
    """测试 Polars 批量 row hash"""
    import polars as pl
    import hashlib

    # 选择部分列进行 hash
    cols = [c for c in df.columns if c in ['姓名', '身份证号码', '员工编码', '性别', '年龄']]
    if not cols:
        cols = df.columns[:5]

    t0 = time.perf_counter()

    # 向量化构建 hash 输入
    parts = []
    for col in cols:
        val_expr = pl.col(col).cast(pl.Utf8, strict=False).fill_null('null')
        part = pl.lit(f'["{col}","') + val_expr + pl.lit('"]')
        parts.append(part)

    hash_input = pl.lit('[') + pl.concat_str(parts, separator=',') + pl.lit(']')
    hash_inputs = df.select(hash_input.alias('_hash_input'))['_hash_input'].to_list()

    # 批量计算 SHA256
    hashes = [hashlib.sha256(s.encode('utf-8')).hexdigest() for s in hash_inputs]
    elapsed = time.perf_counter() - t0
    print(f"[Polars] Row hash 批量计算: {elapsed*1000:.1f}ms, {len(hashes)} rows")
    return hashes, elapsed

def test_pandas_hash(df):
    """测试 pandas 逐行 row hash"""
    import hashlib
    import json
    import math

    cols = [c for c in df.columns if c in ['姓名', '身份证号码', '员工编码', '性别', '年龄']]
    if not cols:
        cols = list(df.columns[:5])

    t0 = time.perf_counter()
    hashes = []
    for _, row in df[cols].iterrows():
        row_data = {}
        for col in cols:
            val = row[col]
            if isinstance(val, float) and math.isnan(val):
                val = None
            row_data[col] = val
        sorted_items = sorted(row_data.items())
        raw = json.dumps(sorted_items, ensure_ascii=False, default=str)
        hashes.append(hashlib.sha256(raw.encode('utf-8')).hexdigest())
    elapsed = time.perf_counter() - t0
    print(f"[pandas] Row hash 逐行(iterrows): {elapsed*1000:.1f}ms, {len(hashes)} rows")
    return hashes, elapsed

def test_to_dicts(df_pl, df_pd):
    """测试行数据提取"""
    import polars as pl

    # Polars to_dicts
    t0 = time.perf_counter()
    rows_pl = df_pl.head(10).to_dicts()
    elapsed_pl = time.perf_counter() - t0
    print(f"[Polars] head(10).to_dicts(): {elapsed_pl*1000:.1f}ms")

    # pandas iterrows
    t0 = time.perf_counter()
    rows_pd = []
    for _, row in df_pd.head(10).iterrows():
        rows_pd.append(dict(row))
    elapsed_pd = time.perf_counter() - t0
    print(f"[pandas] head(10).iterrows(): {elapsed_pd*1000:.1f}ms")

    return elapsed_pl, elapsed_pd


def main():
    print("=" * 70)
    print("性能对比测试: pandas vs polars")
    print("=" * 70)

    results = {}

    # --- CSV 读取测试 ---
    print("\n--- CSV 文件读取 ---")
    df_pl_csv, t_pl_csv = test_polars_csv()
    df_pd_csv, t_pd_csv = test_pandas_csv()
    results['csv_read'] = {'polars': t_pl_csv, 'pandas': t_pd_csv, 'speedup': t_pd_csv / t_pl_csv if t_pl_csv > 0 else 0}
    print(f"  → 提速: {results['csv_read']['speedup']:.1f}x")

    # --- Excel 读取测试 ---
    print("\n--- Excel 文件读取 ---")
    df_pl_xlsx, t_pl_xlsx = test_polars_excel()
    df_pd_xlsx, t_pd_xlsx = test_pandas_excel()
    results['xlsx_read'] = {'polars': t_pl_xlsx, 'pandas': t_pd_xlsx, 'speedup': t_pd_xlsx / t_pl_xlsx if t_pl_xlsx > 0 else 0}
    print(f"  → 提速: {results['xlsx_read']['speedup']:.1f}x")

    # --- 大型 Excel 读取测试 ---
    print("\n--- 大型 Excel 文件读取 ---")
    df_pl_large, t_pl_large = test_polars_excel_large()
    df_pd_large, t_pd_large = test_pandas_excel_large()
    results['xlsx_large_read'] = {'polars': t_pl_large, 'pandas': t_pd_large, 'speedup': t_pd_large / t_pl_large if t_pl_large > 0 else 0}
    print(f"  → 提速: {results['xlsx_large_read']['speedup']:.1f}x")

    # --- 数据清洗测试 ---
    print("\n--- 数据清洗 (身份证号) ---")
    _, t_pl_clean = test_polars_cleaning(df_pl_csv)
    _, t_pd_clean = test_pandas_cleaning(df_pd_csv)
    results['cleaning'] = {'polars': t_pl_clean, 'pandas': t_pd_clean, 'speedup': t_pd_clean / t_pl_clean if t_pl_clean > 0 else 0}
    print(f"  → 提速: {results['cleaning']['speedup']:.1f}x")

    # --- Row Hash 计算测试 ---
    print("\n--- Row Hash 计算 ---")
    _, t_pl_hash = test_polars_hash(df_pl_csv)
    _, t_pd_hash = test_pandas_hash(df_pd_csv)
    results['row_hash'] = {'polars': t_pl_hash, 'pandas': t_pd_hash, 'speedup': t_pd_hash / t_pl_hash if t_pl_hash > 0 else 0}
    print(f"  → 提速: {results['row_hash']['speedup']:.1f}x")

    # --- 行数据提取测试 ---
    print("\n--- 行数据提取 (前10行) ---")
    t_pl_dicts, t_pd_dicts = test_to_dicts(df_pl_csv, df_pd_csv)
    results['to_dicts'] = {'polars': t_pl_dicts, 'pandas': t_pd_dicts, 'speedup': t_pd_dicts / t_pl_dicts if t_pl_dicts > 0 else 0}
    print(f"  → 提速: {results['to_dicts']['speedup']:.1f}x")

    # --- 汇总 ---
    print("\n" + "=" * 70)
    print("性能对比汇总")
    print("=" * 70)
    print(f"{'操作':<25} {'pandas(ms)':<15} {'polars(ms)':<15} {'提速':<10}")
    print("-" * 65)
    for op, data in results.items():
        print(f"{op:<25} {data['pandas']*1000:>12.1f}   {data['polars']*1000:>12.1f}   {data['speedup']:>6.1f}x")
    print("=" * 70)


if __name__ == '__main__':
    main()
