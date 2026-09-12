#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HSE 安全管理系统 — 智能导入解析引擎 (Polars 高性能版)
文件: import_parser.py
功能: 文件名识别 → Excel/CSV解析 → 字段映射 → 数据清洗 → 冲突检测 → 预览数据生成
调用: python import_parser.py --action=parse --file-path=xxx --file-name=xxx --file-record-id=xxx
      python import_parser.py --action=confirm --job-id=xxx --file-record-id=xxx
输出: JSON 到 stdout (Pydantic 模型序列化)

性能优化 (2026-07-04):
  - pandas → polars (Rust 引擎, 多线程, 零拷贝)
  - 逐行 apply → 向量化表达式
  - 逐行 DB 查询 → 批量 fetch + 内存 join (O(n)→O(1) DB 调用)
  - 逐行 INSERT → execute_batch (500 rows/chunk)
  - Excel 读取: openpyxl → calamine (Rust, 10x faster)
"""

import sys
import os
import json
import hashlib
import re
import argparse
import traceback
from datetime import datetime, date
from typing import Any, Optional, List, Dict
from pathlib import Path
import functools
import openpyxl

import polars as pl
import psycopg2
from psycopg2.extras import RealDictCursor, execute_batch
from pydantic import BaseModel, Field, field_validator, ConfigDict


# ============================================================
# OpenTelemetry 分布式追踪初始化 (可选依赖)
# 说明: opentelemetry 为可选依赖。Docker 生产环境已安装并配置 OTEL 端点时启用真实追踪；
#       本地 Windows 开发环境未安装 opentelemetry 或未配置端点时，自动降级为 NoOp tracer，
#       保证 import_parser.py 在任何环境都能正常 import 与运行（避免 ModuleNotFoundError 导致导入挂死）。
# ============================================================
_otel_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")

try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    _otel_available = True
except ImportError:
    _otel_available = False

if _otel_endpoint and _otel_available:
    resource = Resource(attributes={
        SERVICE_NAME: os.environ.get("OTEL_SERVICE_NAME", "hse-python-parser"),
        "deployment.environment": os.environ.get("OTEL_DEPLOYMENT_ENV", "development"),
    })
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=f"{_otel_endpoint}/v1/traces")
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    _tracer = trace.get_tracer(__name__)
else:
    # 无 OTEL 依赖或端点未配置 → 使用 NoOp tracer
    if _otel_available:
        _tracer = trace.NoOpTracer()
    else:
        class _NoOpSpan:
            def __enter__(self):
                return self
            def __exit__(self, *exc):
                return False
            def set_attribute(self, *args, **kwargs):
                pass
            def record_exception(self, *args, **kwargs):
                pass
        class _NoOpTracer:
            def start_as_current_span(self, *args, **kwargs):
                return _NoOpSpan()
        _tracer = _NoOpTracer()


def traced(name: str):
    """Decorator to trace a function with OpenTelemetry."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            with _tracer.start_as_current_span(name) as span:
                try:
                    result = func(*args, **kwargs)
                    span.set_attribute("success", True)
                    return result
                except Exception as e:
                    span.set_attribute("success", False)
                    span.set_attribute("error", str(e))
                    span.record_exception(e)
                    raise
        return wrapper
    return decorator


# ============================================================
# Pydantic 数据模型 — 类型安全的数据结构
# ============================================================

class ConflictStats(BaseModel):
    """冲突检测统计"""
    model_config = ConfigDict(populate_by_name=True)

    inserted: int = Field(default=0, description="新增行数")
    updated: int = Field(default=0, description="更新行数")
    skipped: int = Field(default=0, description="跳过行数")


class ParseErrorEntry(BaseModel):
    """导入错误条目"""
    row: int = Field(description="行号")
    error: str = Field(description="错误信息")


class ParseResult(BaseModel):
    """文件解析结果"""
    model_config = ConfigDict(populate_by_name=True)

    success: bool = Field(description="是否成功")
    module_type: Optional[str] = Field(default=None, description="模块类型")
    module_name: Optional[str] = Field(default=None, description="模块中文名称")
    data_period: Optional[str] = Field(default=None, description="数据周期 YYYY-MM-DD")
    target_table: Optional[str] = Field(default=None, description="目标表名")
    file_hash: Optional[str] = Field(default=None, description="文件 SHA256")
    total_rows: Optional[int] = Field(default=None, description="总行数")
    matched_columns: Optional[Dict[str, str]] = Field(default=None, description="匹配的列映射")
    unmatched_excel_columns: Optional[List[str]] = Field(default=None, description="未匹配的 Excel 列")
    conflict_keys: Optional[List[str]] = Field(default=None, description="冲突键列表")
    preview: Optional[ConflictStats] = Field(default=None, description="冲突检测预览")
    sample_data: Optional[List[Dict[str, Any]]] = Field(default=None, description="前10行预览数据")
    errors: List[str] = Field(default_factory=list, description="错误信息列表")
    error: Optional[str] = Field(default=None, description="错误信息（失败时）")
    file_name: Optional[str] = Field(default=None, description="文件名（识别失败时回传）")
    sheets: Optional[List[Dict[str, Any]]] = Field(default=None, description="文件内所有工作表探测结果（名称/行数/匹配列/是否数据表）")


class ConfirmResult(BaseModel):
    """确认入库结果"""
    model_config = ConfigDict(populate_by_name=True)

    success: bool = Field(description="是否成功")
    job_id: Optional[str] = Field(default=None, description="导入任务ID")
    log_id: Optional[int] = Field(default=None, description="导入日志ID")
    table_name: Optional[str] = Field(default=None, description="目标表名")
    total_rows: Optional[int] = Field(default=None, description="总行数")
    inserted: Optional[int] = Field(default=None, description="新增行数")
    updated: Optional[int] = Field(default=None, description="更新行数")
    skipped: Optional[int] = Field(default=None, description="跳过行数")
    errors: List[ParseErrorEntry] = Field(default_factory=list, description="错误列表")
    error: Optional[str] = Field(default=None, description="错误信息（失败时）")
    traceback: Optional[str] = Field(default=None, description="堆栈跟踪（异常时）")


class RollbackResult(BaseModel):
    """回滚结果"""
    model_config = ConfigDict(populate_by_name=True)

    success: bool = Field(default=None, description="是否成功")
    job_id: Optional[str] = Field(default=None, description="导入任务ID")
    deleted_rows: Optional[int] = Field(default=None, description="删除行数")
    table_name: Optional[str] = Field(default=None, description="目标表名")
    error: Optional[str] = Field(default=None, description="错误信息（失败时）")


class FieldMappingConfig(BaseModel):
    """字段映射配置（对应数据库 field_mapping_config 表）"""
    model_config = ConfigDict(populate_by_name=True)

    id: int = Field(description="配置ID")
    module_type: str = Field(description="模块类型")
    table_name: str = Field(description="目标表名")
    file_pattern: str = Field(default="", description="文件名匹配正则")
    column_mapping: Dict[str, str] = Field(default_factory=dict, description="列映射 {db_col: excel_col}")
    conflict_keys: List[str] = Field(default_factory=list, description="冲突键列表")
    data_cleaning_rules: Dict[str, str] = Field(default_factory=dict, description="数据清洗规则")
    header_row: int = Field(default=0, description="表头行号（0-based）")
    is_active: bool = Field(default=True, description="是否启用")

    @field_validator('column_mapping', 'data_cleaning_rules', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        """自动解析 JSON 字符串字段"""
        if isinstance(v, str):
            return json.loads(v)
        return v

    @field_validator('conflict_keys', mode='before')
    @classmethod
    def parse_conflict_keys(cls, v):
        """自动解析 JSON 字符串或逗号分隔的冲突键"""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [k.strip() for k in v.split(',') if k.strip()]
        return v or []


# ============================================================
# 配置
# ============================================================
DB_CONFIG: Dict[str, Any] = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('DB_PORT', '5432')),
    'dbname': os.environ.get('DB_NAME', 'safety_dashboard'),
    'user': os.environ.get('DB_USER', 'postgres'),
    # 不传 password，使用 trust 认证
}

# JSON 配置文件路径（备份用）
JSON_CONFIG_PATH: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'field_mapping.json')

# 批量操作 chunk 大小
BATCH_SIZE: int = 500


# ============================================================
# 数据库操作
# ============================================================
def get_db_conn() -> psycopg2.extensions.connection:
    """获取数据库连接"""
    return psycopg2.connect(**DB_CONFIG)


def load_config_from_db(conn: psycopg2.extensions.connection,
                        module_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """从数据库加载字段映射配置"""
    cur = conn.cursor(cursor_factory=RealDictCursor)
    if module_type:
        cur.execute(
            "SELECT * FROM field_mapping_config WHERE is_active = true AND module_type = %s ORDER BY id",
            (module_type,)
        )
    else:
        cur.execute(
            "SELECT * FROM field_mapping_config WHERE is_active = true ORDER BY module_type, id"
        )
    configs = cur.fetchall()
    cur.close()
    return [dict(c) for c in configs]


def load_config_from_json() -> Dict[str, Any]:
    """从 JSON 文件加载配置（备份）"""
    with open(JSON_CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


# ============================================================
# 文件名智能识别
# ============================================================
def identify_module(file_name: str, configs: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    根据文件名识别模块类型和目标表
    优先匹配 file_pattern，其次匹配 module_type 关键词
    """
    # 第一轮：精确匹配 file_pattern
    for cfg in configs:
        pattern: str = cfg.get('file_pattern', '')
        if pattern:
            try:
                if re.search(pattern, file_name, re.IGNORECASE):
                    return cfg
            except re.error:
                continue

    # 第二轮：模块关键词匹配
    json_config = load_config_from_json()
    module_keywords: Dict[str, List[str]] = json_config.get('filename_parsing', {}).get('module_keywords', {})

    for mod_type, keywords in module_keywords.items():
        for kw in keywords:
            if kw in file_name:
                for cfg in configs:
                    if cfg['module_type'] == mod_type:
                        return cfg
                break

    # 第三轮：表名关键词匹配
    for cfg in configs:
        table_name: str = cfg['table_name']
        parts = table_name.split('_')
        for part in parts[2:]:  # 跳过 t_XX_ 前缀
            if len(part) >= 2 and part in file_name:
                return cfg

    return None


def extract_data_period(file_name: str) -> str:
    """
    从文件名提取数据周期
    支持: 2026年7月、2026-07、2026.7、2026年第3季度
    返回: YYYY-MM-DD 格式
    """
    m = re.search(r'(\d{4})年(\d{1,2})月', file_name)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"

    m = re.search(r'(\d{4})-(\d{1,2})', file_name)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"

    m = re.search(r'(\d{4})\.(\d{1,2})', file_name)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"

    m = re.search(r'(\d{4})年第(\d)季度', file_name)
    if m:
        quarter_start = {1: 1, 2: 4, 3: 7, 4: 10}
        month = quarter_start.get(int(m.group(2)), 1)
        return f"{m.group(1)}-{month:02d}-01"

    m = re.search(r'(\d{4})', file_name)
    if m:
        return f"{m.group(1)}-01-01"

    now = datetime.now()
    return f"{now.year}-{now.month:02d}-01"


# ============================================================
# 文件读取 (Polars + calamine/PyArrow)
# ============================================================
def read_file(file_path: str, header_row: int = 0, sheet_name: str = None) -> pl.DataFrame:
    """
    读取 Excel/CSV 文件，返回 Polars DataFrame
    - CSV: pl.read_csv() (Rust 引擎, 多线程)
    - Excel: pl.read_excel(engine='calamine') (Rust 引擎, ~10x faster than openpyxl)
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.csv':
        # Polars CSV reader 支持 utf8 和 gbk 编码
        for encoding in ['utf8', 'gbk', 'gb2312', 'latin1']:
            try:
                df = pl.read_csv(
                    file_path,
                    encoding=encoding,
                    skip_rows=header_row,
                    infer_schema_length=1000,
                    try_parse_dates=True,
                    null_values=['', 'NA', 'N/A', 'null', 'NULL', 'None', 'nan', 'NaN'],
                )
                return df
            except Exception:
                continue

        # 如果 Polars 原生读取失败，回退到 Python 读取后转 Polars
        for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
            try:
                import csv
                with open(file_path, 'r', encoding=encoding, newline='') as f:
                    reader = csv.reader(f)
                    rows = list(reader)
                if not rows:
                    continue
                # 跳过 header_row 行
                if header_row > 0 and len(rows) > header_row:
                    rows = rows[header_row:]
                if len(rows) < 2:
                    continue
                headers = rows[0]
                data_rows = rows[1:]
                # 转为 Polars DataFrame
                data_dict = {h: [r[i] if i < len(r) else None for r in data_rows] for i, h in enumerate(headers)}
                return pl.DataFrame(data_dict)
            except (UnicodeDecodeError, Exception):
                continue
        raise ValueError(f"无法解析 CSV 文件: {file_path}")

    elif ext in ('.xlsx', '.xls'):
        # 使用 calamine 引擎 (Rust 实现, 比 openpyxl 快 10 倍)
        try:
            calamine_kwargs = {'engine': 'calamine'}
            if sheet_name:
                calamine_kwargs['sheet_name'] = sheet_name
            df = pl.read_excel(
                file_path,
                read_options={'skip_rows': header_row} if header_row > 0 else None,
                **calamine_kwargs,
            )
            # 检测合并单元格导致的列名异常（UNNAMED / 仅1列 / 第一列含标题文字）
            col_names = df.columns
            has_unnamed = any(str(c).startswith('__UNNAMED') for c in col_names)
            is_merged_cell_artifact = (
                len(df.columns) > 1 and has_unnamed
            ) or (
                len(df.columns) == 1
                and df.height > 3
                and '序号' not in str(col_names[0])
            )
            if is_merged_cell_artifact and header_row >= 0:
                # 重新不跳行读取，手动从 header_row 行提取表头
                raw_kwargs = {'engine': 'calamine'}
                if sheet_name:
                    raw_kwargs['sheet_name'] = sheet_name
                df_raw = pl.read_excel(file_path, **raw_kwargs)
                if df_raw.height > header_row:
                    raw_headers = [str(c).strip() for c in list(df_raw.row(header_row))]
                    # 确保提取到的表头看起来像列名（非纯数字/非空）
                    if any(h and not h.replace('.','').replace('-','').isdigit() for h in raw_headers):
                        df_data = df_raw.slice(header_row + 1)
                        # 如果数据行列数匹配则使用新表头
                        if df_data.height > 0 and len(raw_headers) == df_data.width:
                            # 构建重命名映射（处理重复列名：追加 _1, _2 后缀）
                            seen = {}
                            unique_headers = []
                            for h in raw_headers:
                                if h in seen:
                                    seen[h] += 1
                                    unique_headers.append(f"{h}_{seen[h]}")
                                else:
                                    seen[h] = 0
                                    unique_headers.append(h)
                            rename_map = {
                                old: new
                                for old, new in zip(df_data.columns, unique_headers)
                                if str(old) != new
                            }
                            if rename_map:
                                df = df_data.rename(rename_map)
            return df
        except Exception:
            # 回退到 openpyxl 引擎
            try:
                openpyxl_kwargs = {'engine': 'openpyxl'}
                read_opts2 = {'skip_rows': header_row} if header_row > 0 else {}
                if sheet_name:
                    read_opts2['sheet_name'] = sheet_name
                df = pl.read_excel(
                    file_path,
                    read_options=read_opts2 or None,
                    **openpyxl_kwargs,
                )
                return df
            except Exception as e2:
                raise ValueError(f"无法解析 Excel 文件: {file_path}, 错误: {e2}")

    else:
        raise ValueError(f"不支持的文件格式: {ext}")


def _list_excel_sheets(file_path: str) -> List[str]:
    """列出 Excel 文件所有工作表名称（用于多 sheet 探测）"""
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in ('.xlsx', '.xls'):
        return []
    try:
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        names = list(wb.sheetnames)
        wb.close()
        return names
    except Exception:
        return []


def normalize_column_name(col: Any) -> str:
    """标准化列名：去空格、去换行、统一命名"""
    if col is None:
        return ''
    s = str(col).strip()
    s = s.replace('\n', '').replace('\r', '').replace('  ', ' ')
    return s


def normalize_columns(df: pl.DataFrame) -> pl.DataFrame:
    """标准化 DataFrame 所有列名"""
    old_names = df.columns
    new_names = [normalize_column_name(c) for c in old_names]
    rename_map = {old: new for old, new in zip(old_names, new_names) if old != new}
    if rename_map:
        df = df.rename(rename_map)
    return df


def match_columns(df_columns: List[str],
                  column_mapping: Dict[str, str],
                  aliases: Optional[Dict[str, List[str]]] = None) -> Dict[str, str]:
    """
    智能匹配 Excel 列名到数据库列名
    返回: { excel_col: db_col }
    """
    result: Dict[str, str] = {}
    aliases = aliases or {}

    normalized_cols = {normalize_column_name(c): c for c in df_columns}

    # 第一轮：精确匹配
    for db_col, excel_col in column_mapping.items():
        norm_db = normalize_column_name(db_col)
        if norm_db in normalized_cols:
            result[normalized_cols[norm_db]] = excel_col
            continue
        norm_excel = normalize_column_name(excel_col)
        if norm_excel in normalized_cols:
            result[normalized_cols[norm_excel]] = excel_col

    # 第二轮：别名匹配
    for db_col, alias_list in aliases.items():
        if db_col in column_mapping.values():
            matched = False
            for excel_col, mapped_db in result.items():
                if mapped_db == db_col:
                    matched = True
                    break
            if matched:
                continue

        for alias in alias_list:
            norm_alias = normalize_column_name(alias)
            if norm_alias in normalized_cols:
                excel_col = normalized_cols[norm_alias]
                if excel_col not in result:
                    result[excel_col] = db_col
                    break

    # 第三轮：模糊匹配（包含关系）
    for norm_col, orig_col in normalized_cols.items():
        if orig_col in result:
            continue
        for db_col in column_mapping.keys():
            norm_db = normalize_column_name(db_col)
            if len(norm_db) >= 2 and norm_db in norm_col:
                result[orig_col] = column_mapping[db_col]
                break

    return result


# ============================================================
# 数据清洗 (向量化 Polars 表达式)
# ============================================================
def _clean_id_card_expr(col_name: str) -> pl.Expr:
    """身份证号清洗：去空格、去横杠"""
    return (
        pl.col(col_name)
        .cast(pl.Utf8, strict=False)
        .str.replace_all(' ', '', literal=True)
        .str.replace_all('-', '', literal=True)
        .str.strip_chars()
    )


def _clean_phone_expr(col_name: str) -> pl.Expr:
    """手机号清洗：去空格、去横杠、去+86"""
    return (
        pl.col(col_name)
        .cast(pl.Utf8, strict=False)
        .str.replace_all(' ', '', literal=True)
        .str.replace_all('-', '', literal=True)
        .str.replace_all('+86', '', literal=True)
        .str.strip_chars()
    )


def _clean_currency_expr(col_name: str) -> pl.Expr:
    """金额清洗：去逗号/货币符号，转浮点"""
    return (
        pl.col(col_name)
        .cast(pl.Utf8, strict=False)
        .str.replace_all(',', '', literal=True)
        .str.replace_all('¥', '', literal=True)
        .str.replace_all('￥', '', literal=True)
        .str.replace_all('元', '', literal=True)
        .str.strip_chars()
        .cast(pl.Float64, strict=False)
        .round(2)
    )


def _clean_date_expr(col_name: str, dtype: pl.DataType) -> pl.Expr:
    """
    日期清洗：支持多种输入格式，输出 YYYY-MM-DD 字符串
    - Polars Date/Datetime 类型 → strftime
    - 字符串 → strptime (多格式尝试)
    - 数值 (Excel 序列号) → 转换

    注意: dtype 在调用时从 df.schema 获取，不能在 Expr 上检查
    """
    col = pl.col(col_name)

    # 根据列类型选择不同策略
    if dtype in (pl.Date, pl.Datetime):
        # 已经是日期类型，直接格式化
        return col.dt.strftime('%Y-%m-%d')

    elif dtype in (pl.Int64, pl.Float64, pl.Int32, pl.Float32):
        # 数值 (Excel 序列号) → 日期
        # Excel 序列号: 1 = 1900-01-01, 基准日期 = 1899-12-30
        # 转为字符串日期: 使用 epoch + serial_days
        base_date = datetime(1899, 12, 30)
        # 将数值转为天数偏移，然后格式化
        # 使用 cast to Int64 确保整数运算
        serial_days = col.cast(pl.Int64, strict=False)
        # 构建日期: 1899-12-30 + N days → 用 Polars duration 表达
        return (
            pl.lit(base_date).cast(pl.Datetime) + pl.duration(days=serial_days)
        ).dt.strftime('%Y-%m-%d')

    else:
        # 字符串类型，尝试多种格式解析
        str_col = col.cast(pl.Utf8, strict=False)
        return (
            pl.coalesce(
                str_col.str.strptime(pl.Date, format='%Y-%m-%d', strict=False),
                str_col.str.strptime(pl.Date, format='%Y/%m/%d', strict=False),
                str_col.str.strptime(pl.Date, format='%Y年%m月%d日', strict=False),
                str_col.str.strptime(pl.Date, format='%d/%m/%Y', strict=False),
                str_col.str.strptime(pl.Date, format='%m/%d/%Y', strict=False),
                str_col.str.strptime(pl.Date, format='%Y-%m', strict=False),
                str_col.str.strptime(pl.Date, format='%Y/%m', strict=False),
                str_col.str.strptime(pl.Date, format='%Y年%m月', strict=False),
            )
            .dt.strftime('%Y-%m-%d')
        )


def clean_dataframe(df: pl.DataFrame,
                    col_mapping: Dict[str, str],
                    cleaning_rules: Dict[str, str]) -> pl.DataFrame:
    """
    向量化清洗 DataFrame 数据
    使用 Polars 表达式批量处理，避免逐行 apply
    """
    if not cleaning_rules:
        return df

    db_to_excel = {v: k for k, v in col_mapping.items()}
    schema = df.schema  # 获取列类型映射

    # 构建所有清洗表达式
    exprs: List[pl.Expr] = []
    for db_col, clean_type in cleaning_rules.items():
        excel_col = db_to_excel.get(db_col)
        if excel_col and excel_col in df.columns:
            col_dtype = schema.get(excel_col, pl.Utf8)
            if clean_type == 'id_card':
                exprs.append(_clean_id_card_expr(excel_col).alias(excel_col))
            elif clean_type == 'phone':
                exprs.append(_clean_phone_expr(excel_col).alias(excel_col))
            elif clean_type == 'currency':
                exprs.append(_clean_currency_expr(excel_col).alias(excel_col))
            elif clean_type == 'date':
                exprs.append(_clean_date_expr(excel_col, col_dtype).alias(excel_col))
            # 其他类型不处理

    if exprs:
        df = df.with_columns(exprs)

    return df


# ============================================================
# Row Hash 计算 (批量向量化)
# ============================================================
def calculate_row_hash_batch(df: pl.DataFrame,
                             col_mapping: Dict[str, str]) -> List[str]:
    """
    批量计算行数据的 SHA256 哈希
    使用 Polars concat_str 构建哈希输入，然后批量计算 SHA256
    
    优化: 从逐行 json.dumps+sha256 改为批量字符串拼接+循环 hash
    """
    # 获取需要参与哈希的列 (按 db_col 排序保持一致性)
    db_to_excel = {v: k for k, v in col_mapping.items()}
    sorted_db_cols = sorted(col_mapping.values())
    hash_excel_cols = [db_to_excel[db_col] for db_col in sorted_db_cols
                       if db_to_excel[db_col] in df.columns]

    if not hash_excel_cols:
        return []

    # 构建 JSON 格式的哈希输入: [["col","val"],["col","val"],...]
    # 使用 Polars concat_str 向量化拼接
    parts: List[pl.Expr] = []
    for db_col in sorted_db_cols:
        excel_col = db_to_excel.get(db_col)
        if excel_col and excel_col in df.columns:
            # 将值转为字符串, null 转为 "null"
            val_expr = (
                pl.col(excel_col)
                .cast(pl.Utf8, strict=False)
                .fill_null('null')
            )
            # 格式: ["db_col","val"]
            part = pl.lit(f'["{db_col}","') + val_expr + pl.lit('"]')
            parts.append(part)

    if not parts:
        return []

    # 用逗号连接各部分, 外包 []
    hash_input = pl.lit('[') + pl.concat_str(parts, separator=',') + pl.lit(']')

    # 获取哈希输入字符串列表
    hash_inputs = df.select(hash_input.alias('_hash_input'))['_hash_input'].to_list()

    # 批量计算 SHA256
    hashes = [hashlib.sha256(s.encode('utf-8')).hexdigest() for s in hash_inputs]

    return hashes


def calculate_row_hash(row_data: Dict[str, Any]) -> str:
    """计算单行数据的 SHA256 哈希（兼容旧接口）"""
    sorted_items = sorted(row_data.items())
    raw = json.dumps(sorted_items, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def calculate_file_hash(file_path: str) -> str:
    """计算文件 SHA256"""
    h = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


# ============================================================
# 冲突检测 (批量优化 — O(1) DB 查询, O(n) 内存匹配)
# ============================================================
def check_conflicts(conn: psycopg2.extensions.connection,
                    table_name: str,
                    df: pl.DataFrame,
                    col_mapping: Dict[str, str],
                    conflict_keys: List[str],
                    data_period: str) -> ConflictStats:
    """
    批量检测数据冲突，返回新增/更新/跳过的统计

    优化策略:
    1. 一次性 fetch 所有已有 row_hash (1 条 SQL)
    2. 一次性 fetch 所有匹配 conflict_keys + data_period 的行 (1 条 SQL)
    3. 构建 dict 在内存中 O(1) 查找匹配 (0 条额外 SQL)

    原 pandas 版: O(n) 条 SQL (每行一条查询)
    优化版: O(1) 条 SQL + O(n) dict 查找
    """
    cur = conn.cursor()

    db_to_excel = {v: k for k, v in col_mapping.items()}

    # ---- Step 1: 批量计算所有行的 row_hash ----
    row_hashes = calculate_row_hash_batch(df, col_mapping)
    total_rows = len(row_hashes)

    if total_rows == 0:
        cur.close()
        return ConflictStats(inserted=0, updated=0, skipped=0)

    # ---- Step 2: 一次性获取所有已有的 row_hash (用于检测完全重复) ----
    existing_hashes: set = set()
    try:
        cur.execute(f'SELECT row_hash FROM "{table_name}" WHERE row_hash IS NOT NULL')
        for row in cur.fetchall():
            if row[0]:
                existing_hashes.add(row[0])
    except Exception:
        pass

    # ---- Step 3: 如果有冲突键，一次性获取所有匹配的行 ----
    # 构建 conflict_key_tuple → existing_hash 的 dict
    existing_key_to_hash: Dict[tuple, Optional[str]] = {}

    if conflict_keys:
        try:
            ck_cols = ', '.join(f'"{ck}"' for ck in conflict_keys)
            cur.execute(
                f'SELECT {ck_cols}, row_hash FROM "{table_name}" WHERE data_period = %s OR data_period IS NULL',
                (data_period,)
            )
            existing_rows = cur.fetchall()
            for row in existing_rows:
                # 构建冲突键元组 (统一转为字符串以便比较)
                key = tuple(
                    str(row[i]) if row[i] is not None else None
                    for i in range(len(conflict_keys))
                )
                existing_key_to_hash[key] = row[-1]  # row_hash 是最后一列
        except Exception:
            pass

    cur.close()

    # ---- Step 4: 构建新数据并分类 ----
    inserted = 0
    updated = 0
    skipped = 0

    # 获取新数据的冲突键值
    new_keys_data: Dict[str, List[Any]] = {}
    for ck in conflict_keys:
        excel_col = db_to_excel.get(ck, ck)
        if excel_col in df.columns:
            new_keys_data[ck] = df[excel_col].cast(pl.Utf8, strict=False).to_list()
        else:
            new_keys_data[ck] = [None] * total_rows

    for i in range(total_rows):
        rh = row_hashes[i]

        # 检查完全重复 (row_hash 已存在)
        if rh in existing_hashes:
            skipped += 1
            continue

        # 检查冲突键匹配
        if conflict_keys and existing_key_to_hash:
            new_key = tuple(
                str(new_keys_data[ck][i]) if new_keys_data[ck][i] is not None else None
                for ck in conflict_keys
            )

            if new_key in existing_key_to_hash:
                # 冲突键匹配: 检查 hash 是否相同
                existing_hash = existing_key_to_hash[new_key]
                if existing_hash is not None and existing_hash == rh:
                    skipped += 1   # 数据完全相同
                else:
                    updated += 1   # 冲突键匹配但数据不同 (或旧数据无 hash)
            else:
                inserted += 1
        else:
            inserted += 1

        existing_hashes.add(rh)

    return ConflictStats(inserted=inserted, updated=updated, skipped=skipped)


# ============================================================
# 辅助函数
# ============================================================
def get_module_name(module_type: str, json_config: Dict[str, Any]) -> str:
    """获取模块中文名称"""
    modules = json_config.get('modules', {})
    if module_type in modules:
        return modules[module_type].get('name', module_type)
    return module_type


def df_to_serializable_dicts(df: pl.DataFrame, col_mapping: Dict[str, str],
                             n_rows: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    将 Polars DataFrame 转为可序列化的字典列表
    只包含 col_mapping 中的列，null 转为 None
    """
    if n_rows is not None:
        df = df.head(n_rows)

    result: List[Dict[str, Any]] = []
    rows = df.to_dicts()

    for row in rows:
        row_data: Dict[str, Any] = {}
        for excel_col, db_col in col_mapping.items():
            if excel_col in row:
                val = row[excel_col]
                if val is None:
                    row_data[db_col] = None
                else:
                    row_data[db_col] = str(val) if not isinstance(val, (int, float, bool)) else val
        result.append(row_data)

    return result


def sanitize_identifier(name: str) -> str:
    """将任意文件名转为合法的 PostgreSQL 标识符（保留中文/字母/数字/下划线）"""
    s = re.sub(r'[^\w\u4e00-\u9fff]', '_', name or 'import')
    s = re.sub(r'_+', '_', s).strip('_')
    return s or 'import'


def derive_table_name(file_name: str, config: Dict[str, Any]) -> str:
    """
    根据文件名推导导入临时表名：<config.table_name 前缀>_<文件名(去扩展名)>
    与既有 t_10_隐患排查治理_<文件名> 命名规则一致，使同一文件多次导入落到同一张表
    """
    base = config.get('table_name', '') or ''
    if '_' in base:
        prefix = base.rsplit('_', 1)[0] + '_'
    else:
        prefix = ''
    stem = Path(file_name).stem if file_name else 'import'
    return prefix + sanitize_identifier(stem)


def ensure_import_table(conn, table_name: str, db_columns: List[str], conflict_keys: List[str] = None) -> str:
    """
    确保导入临时表存在且字段匹配：
    - 不存在则按 db_columns + 6 个通用字段创建
    - 已存在但字段不匹配（旧版 schema 漂移）则重建（导入临时表可安全重建）
    - 始终按 conflict_keys 建立唯一索引（供 ON CONFLICT 使用，幂等）
    """
    cur = conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (table_name,))
    existing = set(r[0] for r in cur.fetchall())
    expected = set(db_columns) | {
        'data_period', 'source_file_id', 'import_job_id', 'row_hash', 'last_updated_at', 'version', '__src_sheet__'
    }
    if existing and (expected - existing):
        # 字段不匹配 -> 重建（避免跨版本 schema 漂移导致 upsert 失败）
        print(f"[Import] 表 {table_name} 字段不匹配，重建中...", file=sys.stderr, flush=True)
        cur.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        conn.commit()
        existing = set()
    if not existing:
        # 去重：Excel 可能含重复列名（如"网格层级"出现多次），建表时只保留唯一列
        unique_db_columns = list(dict.fromkeys(db_columns))
        col_defs = [f'"{c}" TEXT' for c in unique_db_columns]
        common = [
            '"data_period" DATE',
            '"source_file_id" INTEGER',
            '"import_job_id" UUID',
            '"row_hash" CHAR(64)',
            '"last_updated_at" TIMESTAMP',
            '"version" INTEGER DEFAULT 1',
            '"created_at" TIMESTAMP DEFAULT NOW()',
            '"__src_sheet__" TEXT',
        ]
        sql = (f'CREATE TABLE IF NOT EXISTS "{table_name}" '
               f'(id SERIAL PRIMARY KEY, ' + ', '.join(col_defs + common) + ')')
        cur.execute(sql)
        conn.commit()
    # 冲突键唯一索引（幂等；ON CONFLICT 依赖它）
    if conflict_keys:
        ck_cols = ', '.join(f'"{ck}"' for ck in conflict_keys)
        idx_name = 'imp_uk_' + hashlib.md5(table_name.encode('utf-8')).hexdigest()[:12]
        cur.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS "{idx_name}" ON "{table_name}" ({ck_cols})')
        conn.commit()
    cur.close()
    return table_name


# ============================================================
# 主流程: 解析
# ============================================================
@traced("parse_file")
def do_parse(file_path: str, file_name: str,
             file_record_id: Optional[int] = None,
             sheets: Optional[List[str]] = None) -> ParseResult:
    """解析文件，返回预览数据（Pydantic 模型）"""

    # sheets 参数兼容字符串（逗号分隔，来自命令行 --sheets=a,b）
    if isinstance(sheets, str):
        sheets = [s.strip() for s in sheets.split(',') if s.strip()] or None

    # 1. 检查文件是否存在
    if not os.path.exists(file_path):
        return ParseResult(success=False, error=f'文件不存在: {file_path}')

    # 2. 计算文件哈希
    file_hash = calculate_file_hash(file_path)

    # 3. 连接数据库，加载配置
    conn = get_db_conn()

    try:
        configs = load_config_from_db(conn)

        # 4. 识别模块
        config = identify_module(file_name, configs)
        if not config:
            return ParseResult(
                success=False,
                error=f'无法识别文件对应的模块: {file_name}',
                file_name=file_name,
                file_hash=file_hash,
            )

        module_type: str = config['module_type']
        table_name: str = derive_table_name(file_name, config)
        conflict_keys: List[str] = config.get('conflict_keys', [])
        if isinstance(conflict_keys, str):
            conflict_keys = json.loads(conflict_keys)

        column_mapping: Dict[str, str] = config.get('column_mapping', {})
        if isinstance(column_mapping, str):
            column_mapping = json.loads(column_mapping)

        cleaning_rules: Dict[str, str] = config.get('data_cleaning_rules', {})
        if isinstance(cleaning_rules, str):
            cleaning_rules = json.loads(cleaning_rules)

        # 5. 提取数据周期
        data_period = extract_data_period(file_name)

        # 6. 从 JSON 配置加载别名
        aliases: Dict[str, List[str]] = {}
        json_config = load_config_from_json()
        modules = json_config.get('modules', {})
        if module_type in modules:
            for tbl in modules[module_type].get('tables', []):
                if tbl['table_name'] == table_name:
                    aliases = tbl.get('aliases', {})
                    break

        # 6.5 表头行 + 探测文件所有工作表（供前端手动勾选）
        header_row: int = config.get('header_row', 0) or 0

        # 探测所有 sheet：对每个 sheet 做列匹配，判断是否为数据 sheet
        try:
            all_sheet_names = _list_excel_sheets(file_path)
        except Exception:
            all_sheet_names = []
        sheet_infos: List[Dict[str, Any]] = []
        for _s in all_sheet_names:
            try:
                _sdf = read_file(file_path, header_row, sheet_name=_s)
                _sdf = normalize_columns(_sdf)
                _sdf = _sdf.filter(~pl.all_horizontal(pl.all().is_null()))
                _sc = match_columns(_sdf.columns, column_mapping, aliases)
                sheet_infos.append({
                    'name': _s,
                    'row_count': _sdf.height,
                    'matched_cols': len(_sc),
                    'is_data_sheet': len(_sc) >= 3 and _sdf.height > 0,
                })
            except Exception:
                sheet_infos.append({'name': _s, 'row_count': 0, 'matched_cols': 0, 'is_data_sheet': False})

        # 决定本次合并的 sheet：显式选择优先；否则默认所有数据 sheet；兜底首个
        if sheets:
            selected_sheets = [s for s in sheets if s in all_sheet_names]
        else:
            selected_sheets = [si['name'] for si in sheet_infos if si['is_data_sheet']]
            if not selected_sheets and all_sheet_names:
                selected_sheets = [all_sheet_names[0]]

        # 7. 读取文件 (Polars + calamine)，按选中的工作表合并
        if selected_sheets:
            _merged: List[pl.DataFrame] = []
            for _s in selected_sheets:
                _sdf = read_file(file_path, header_row, sheet_name=_s)
                _sdf = normalize_columns(_sdf)
                _sdf = _sdf.filter(~pl.all_horizontal(pl.all().is_null()))
                # 标记来源工作表，供业务表 category/sheet 双字段标记使用
                _sdf = _sdf.with_columns(pl.lit(_s).alias('__src_sheet__'))
                _merged.append(_sdf)
            df = _merged[0] if len(_merged) == 1 else pl.concat(_merged, how='diagonal_relaxed')
        else:
            df = read_file(file_path, header_row)
            df = normalize_columns(df)
            df = df.filter(~pl.all_horizontal(pl.all().is_null()))

        total_rows = df.height

        if total_rows == 0:
            return ParseResult(
                success=False,
                error=f'文件无有效数据行: {file_name}',
                module_type=module_type,
                target_table=table_name,
            )

        # 8. 智能匹配列
        col_mapping = match_columns(df.columns, column_mapping, aliases)

        if not col_mapping:
            return ParseResult(
                success=False,
                error=f'无法匹配任何列。Excel列: {df.columns}',
                module_type=module_type,
                target_table=table_name,
            )

        # 9. 数据清洗 (向量化)
        df = clean_dataframe(df, col_mapping, cleaning_rules)

        # 9.5 按文件名创建/复用导入临时表（与原 t_10_隐患排查治理_<文件名> 规则一致）
        ensure_import_table(conn, table_name, list(col_mapping.values()), conflict_keys)

        # 10. 冲突检测 (批量)
        conflict_stats = check_conflicts(conn, table_name, df, col_mapping, conflict_keys, data_period)

        # 11. 准备预览数据（前10行）
        preview_rows = df_to_serializable_dicts(df, col_mapping, n_rows=10)

        # 12. 更新 file_records
        if file_record_id:
            cur = conn.cursor()
            cur.execute(
                """UPDATE file_records SET module_type = %s, data_period = %s,
                   file_hash = %s, status = 'parsed',
                   metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
                   WHERE id = %s""",
                (module_type, data_period, file_hash,
                 json.dumps({'selected_sheets': selected_sheets}, ensure_ascii=False), file_record_id)
            )
            conn.commit()
            cur.close()

        return ParseResult(
            success=True,
            module_type=module_type,
            module_name=get_module_name(module_type, json_config),
            data_period=data_period,
            target_table=table_name,
            file_hash=file_hash,
            total_rows=total_rows,
            matched_columns=col_mapping,
            unmatched_excel_columns=[c for c in df.columns if c not in col_mapping],
            conflict_keys=conflict_keys,
            preview=conflict_stats,
            sample_data=preview_rows,
            sheets=sheet_infos,
            errors=[],
        )

    finally:
        conn.close()


# ============================================================
# 业务表同步：导入临时表 → 模块业务主表
# ============================================================

# 模块类型 → (业务表名, {临时表Excel列名 → 业务表列名})
BUSINESS_TABLE_MAP: Dict[str, tuple] = {
    'risk': (
        'risk_sources',
        {
            # 临时表的中文列名 → risk_sources 的列名
            '风险源名称': 'name',
            '风险类型': 'type',
            '事故类型': 'accident_type',
            '风险等级': 'level',
            '作业内容/场所': 'location',
            '管控措施': 'measures',
            '应急准备措施': 'emergency',
            '管控部门': 'area',
            # 注: 网格层级(一级/二级网格长)在 risk_sources 无对应列，不单独同步；
            #     来源工作表(高风险/一般风险)通过下方 __src_sheet__ 双标记写入 category 与 sheet
        },
        # 业务表独有字段的默认值（不在临时表中）
        {'status': "'正常'", 'is_deleted': 'FALSE'},
    ),
    # 人员保险模块：临时表(人员视角) → personnel_insurance(业务表，前端读取)
    'insurance': (
        'personnel_insurance',
        {
            # 临时表中文列名 → (personnel_insurance 列名, 类型转换)
            '姓名': 'person_name',
            '身份证号码': 'id_card',
            '所属部门': 'department',
            '职位': 'position',
            '年龄分类': 'employee_type',
            '保险起期': ('start_date', 'date'),
            '保险止期': ('expire_date', 'date'),
            '入职日期': ('entry_date', 'date'),
            '应缴保险类型': 'insurance_type',
            '工伤险金额': ('coverage_amount', 'numeric'),
            '雇主责任险金额': ('premium', 'numeric'),
        },
        # 业务表独有字段默认值
        {
            'is_current': 'false',
            'is_deleted': 'FALSE',
            # 高危人员派生：超龄人员视为高危（与统计口径一致）
            'is_high_risk': "(CASE WHEN \"年龄分类\" = '超龄人员' THEN true ELSE false END)",
        },
    ),
    # 其他模块可在此扩展：
    # 'hazard': ('hazards', {...}, {'status': "'正常'"})
}


def _sync_to_business_table(
    conn, cur,
    module_type: str,
    import_table_name: str,
    col_mapping: Dict[str, str],
    insert_excel_cols: List[str],
    batch_params: List[tuple],
    job_id: str,
    file_record_id: int,
    data_period,
) -> int:
    """
    将导入数据同步写入模块对应的业务主表。

    使用 SQL INSERT ... SELECT 从临时表直接复制数据到业务表，
    通过列名映射 (excel_col → business_col) 进行字段转换。
    相比参数索引方式更稳健，避免索引错位导致的 NULL 问题。
    """
    if module_type not in BUSINESS_TABLE_MAP:
        return 0

    business_table, excel_to_business_col, default_values = BUSINESS_TABLE_MAP[module_type]

    try:
        # 创建 SAVEPOINT：同步失败时只回滚到此处，不影响主事务（临时表插入等）
        cur.execute('SAVEPOINT business_sync')

        # 确认业务表存在
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = %s
            )
        """, (business_table,))
        if not cur.fetchone()['exists']:
            print(f'[WARN] 业务表 {business_table} 不存在，跳过同步', file=sys.stderr)
            return 0

        # 构建 SELECT 列映射：从临时表中选列并重命名为业务表列名
        # 对 NOT NULL 关键字段使用 COALESCE 提供默认值，防止 NULL 违反约束
        coalesce_defaults = {
            'name': "'未命名风险点'",
            'level': "'四级'",
            'status': "'正常'",
            'type': "'其他'",
        }

        select_exprs: List[str] = []
        business_cols: List[str] = []

        for src_col, mapping_value in excel_to_business_col.items():
            # 检查源列是否存在于临时表中
            if src_col in insert_excel_cols or any(c.replace('"', '') == src_col for c in insert_excel_cols):
                # mapping_value 可为 字符串(目标列名) 或 元组(目标列名, 类型转换)
                # 例如 ('start_date', 'date') 表示写入时做 ::date 转换
                if isinstance(mapping_value, (tuple, list)):
                    dst_col = mapping_value[0]
                    cast_type = mapping_value[1] if len(mapping_value) > 1 else None
                else:
                    dst_col = mapping_value
                    cast_type = None
                # 空串统一转为 NULL，避免文本型日期/数值列在隐式转换时空串报错
                nullif_expr = f'NULLIF("{import_table_name}"."{src_col}"::text, \'\')'
                if cast_type:
                    nullif_expr = f'{nullif_expr}::{cast_type}'
                # 对关键字段用 COALESCE 兜底 NULL 值
                if dst_col in coalesce_defaults:
                    select_exprs.append(f'COALESCE({nullif_expr}, {coalesce_defaults[dst_col]})')
                else:
                    select_exprs.append(nullif_expr)
                business_cols.append('"' + dst_col + '"')

        # 添加默认值字段
        for dst_col, expr in default_values.items():
            select_exprs.append(expr)
            business_cols.append('"' + dst_col + '"')

        # 多 sheet 来源双标记：临时表 __src_sheet__ → 业务表 category 与 sheet
        if '__src_sheet__' in insert_excel_cols:
            select_exprs.append(f'"{import_table_name}"."__src_sheet__"')
            business_cols.append('"category"')
            select_exprs.append(f'"{import_table_name}"."__src_sheet__"')
            business_cols.append('"sheet"')

        # 添加通用追踪字段（从临时表取），按目标列类型转换避免 text→typed 失败
        for tracking in [('row_hash', 'row_hash', None), ('source_file_id', 'source_file_id', 'integer'),
                         ('import_job_id', 'import_job_id', 'uuid')]:
            t_src, t_dst, cast_type = tracking
            if t_src not in [d for _, d in excel_to_business_col.items()]:
                expr = f'NULLIF("{import_table_name}"."{t_src}"::text, \'\')'
                if cast_type:
                    expr = f'{expr}::{cast_type}'
                select_exprs.append(expr)
                business_cols.append('"' + t_dst + '"')

        if not business_cols:
            print(f'[WARN] 无可同步的列', file=sys.stderr)
            return 0

        # 构建 INSERT ... SELECT SQL
        col_str = ', '.join(business_cols)
        sel_str = ', '.join(select_exprs)
        sql = f'''INSERT INTO "{business_table}" ({col_str})
                  SELECT {sel_str}
                  FROM "{import_table_name}"
                  WHERE import_job_id = %s
                  ON CONFLICT DO NOTHING'''

        cur.execute(sql, (job_id,))
        synced = cur.rowcount

        if synced > 0:
            print(f'[SYNC] 已同步 {synced} 行到业务表 {business_table}', file=sys.stderr)

        return synced

    except Exception as e:
        # 同步失败不影响导入结果（临时表已写入成功）
        # 使用 SAVEPOINT 回滚仅回滚业务表同步部分，不影响主事务
        print(f'[WARN] 业务表同步失败 ({business_table}): {e}', file=sys.stderr)
        try:
            cur.execute('ROLLBACK TO SAVEPOINT business_sync')
        except Exception:
            pass  # savepoint 可能不存在
        return 0


# ============================================================
# 主流程: 确认入库 (批量 Upsert)
# ============================================================
@traced("confirm_import")
def do_confirm(job_id: str, file_record_id: int,
               operator: str = 'system') -> ConfirmResult:
    """
    确认入库，执行批量 Upsert
    
    优化:
    1. Polars 读取文件
    2. 向量化清洗
    3. 批量 row_hash 计算
    4. execute_batch 批量 INSERT ... ON CONFLICT (500 rows/chunk)
    
    原 pandas 版: 逐行 INSERT (O(n) DB 调用)
    优化版: 批量 INSERT (O(n/500) DB 调用)
    """

    conn = get_db_conn()

    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1. 获取 file_records 信息
        cur.execute("SELECT * FROM file_records WHERE id = %s", (file_record_id,))
        file_record = cur.fetchone()
        if not file_record:
            return ConfirmResult(success=False, error=f'文件记录不存在: id={file_record_id}')

        file_record = dict(file_record)
        file_path: str = file_record.get('filepath', '')
        file_name: str = file_record.get('original_name', '')
        module_type: str = file_record.get('module_type', '')
        data_period = file_record.get('data_period')

        if not module_type or not data_period:
            return ConfirmResult(success=False, error='文件尚未解析，请先执行解析')

        # 2. 创建 import_logs 记录
        cur.execute(
            """INSERT INTO import_logs (file_record_id, job_id, module_type, data_period,
               target_table, status, started_at, operator)
               VALUES (%s, %s, %s, %s, %s, 'running', NOW(), %s) RETURNING id""",
            (file_record_id, job_id, module_type, data_period, '', operator)
        )
        log_id: int = cur.fetchone()['id']

        # 3. 获取配置
        configs = load_config_from_db(conn, module_type)
        config = identify_module(file_name, configs)
        if not config:
            cur.execute("UPDATE import_logs SET status = 'failed', finished_at = NOW() WHERE id = %s", (log_id,))
            conn.commit()
            return ConfirmResult(success=False, error=f'无法识别模块: {file_name}')

        config = dict(config)
        table_name: str = derive_table_name(file_name, config)
        conflict_keys: List[str] = config.get('conflict_keys', [])
        if isinstance(conflict_keys, str):
            conflict_keys = json.loads(conflict_keys)

        column_mapping: Dict[str, str] = config.get('column_mapping', {})
        if isinstance(column_mapping, str):
            column_mapping = json.loads(column_mapping)

        cleaning_rules: Dict[str, str] = config.get('data_cleaning_rules', {})
        if isinstance(cleaning_rules, str):
            cleaning_rules = json.loads(cleaning_rules)

        cur.execute("UPDATE import_logs SET target_table = %s WHERE id = %s", (table_name, log_id))

        # 4. 重新解析文件 (Polars) —— 复用解析阶段选定的工作表，保证与预览一致
        header_row: int = config.get('header_row', 0) or 0
        _meta = file_record.get('metadata') or {}
        _sel = _meta.get('selected_sheets') if isinstance(_meta, dict) else None
        if _sel:
            _merged = []
            for _s in _sel:
                _sdf = read_file(file_path, header_row, sheet_name=_s)
                _sdf = normalize_columns(_sdf)
                _sdf = _sdf.filter(~pl.all_horizontal(pl.all().is_null()))
                _sdf = _sdf.with_columns(pl.lit(_s).alias('__src_sheet__'))
                _merged.append(_sdf)
            df = _merged[0] if len(_merged) == 1 else pl.concat(_merged, how='diagonal_relaxed')
        else:
            df = read_file(file_path, header_row)
            df = normalize_columns(df)
            df = df.filter(~pl.all_horizontal(pl.all().is_null()))

        json_config = load_config_from_json()
        aliases: Dict[str, List[str]] = {}
        modules = json_config.get('modules', {})
        if module_type in modules:
            for tbl in modules[module_type].get('tables', []):
                if tbl['table_name'] == table_name:
                    aliases = tbl.get('aliases', {})
                    break

        col_mapping = match_columns(df.columns, column_mapping, aliases)
        df = clean_dataframe(df, col_mapping, cleaning_rules)

        # 4.5 确保导入临时表存在（仅 parse 未先执行时兜底）
        ensure_import_table(conn, table_name, list(col_mapping.values()), conflict_keys)

        # 5. 批量计算 row_hash
        row_hashes = calculate_row_hash_batch(df, col_mapping)
        total_rows: int = len(row_hashes)

        # 6. 构建批量 Upsert 参数
        db_to_excel = {v: k for k, v in col_mapping.items()}

        # 获取所有需要插入的列 (excel_col → db_col 映射)，去重重名
        insert_cols_ordered: List[str] = []  # 保持顺序的去重列表
        insert_excel_cols: List[str] = []  # excel_col names in df

        seen_db_cols = set()
        for excel_col, db_col in col_mapping.items():
            if excel_col in df.columns and db_col not in seen_db_cols:
                insert_cols_ordered.append(db_col)
                insert_excel_cols.append(excel_col)
                seen_db_cols.add(db_col)

        # 来源工作表标记列（多 sheet 合并时存在，用于业务表 category/sheet 双标记）
        if '__src_sheet__' in df.columns:
            insert_cols_ordered.append('__src_sheet__')
            insert_excel_cols.append('__src_sheet__')

        # 添加通用字段
        insert_cols_ordered.extend(['row_hash', 'data_period', 'source_file_id', 'import_job_id', 'last_updated_at'])
        now = datetime.now()

        # 构建 ON CONFLICT 子句
        conflict_cols = ', '.join(f'"{ck}"' for ck in conflict_keys) if conflict_keys else None
        if conflict_cols:
            update_cols = [c for c in insert_cols_ordered if c not in conflict_keys and c not in ('data_period',)]
            update_str = ', '.join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)
            update_str += f', version = "{table_name}"."version" + 1'

        # 构建 SQL 模板
        col_str = ', '.join(f'"{c}"' for c in insert_cols_ordered)
        val_str = ', '.join(['%s'] * len(insert_cols_ordered))

        if conflict_cols:
            sql = f'''INSERT INTO "{table_name}" ({col_str})
                      VALUES ({val_str})
                      ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_str}'''
        else:
            sql = f'''INSERT INTO "{table_name}" ({col_str})
                      VALUES ({val_str})
                      ON CONFLICT DO NOTHING'''

        # 7. 批量构建参数
        rows_data = df.select(insert_excel_cols).to_dicts()
        batch_params: List[tuple] = []

        for i, row in enumerate(rows_data):
            params = []
            for excel_col in insert_excel_cols:
                val = row.get(excel_col)
                # Polars null → None
                if val is None:
                    params.append(None)
                else:
                    params.append(val)

            # 通用字段
            params.append(row_hashes[i])       # row_hash
            params.append(data_period)          # data_period
            params.append(file_record_id)       # source_file_id
            params.append(job_id)               # import_job_id
            params.append(now)                  # last_updated_at

            batch_params.append(tuple(params))

        # 8. 执行批量 Upsert
        inserted: int = 0
        updated: int = 0
        skipped: int = 0
        errors: List[ParseErrorEntry] = []

        # 使用 execute_batch 分块执行
        # execute_batch 自动处理参数化查询，减少网络往返
        try:
            execute_batch(cur, sql, batch_params, page_size=BATCH_SIZE)

            # execute_batch 不返回每行的 rowcount，需要用另一种方式统计
            # 优化：用一次性 COUNT 查询统计变化
            # 简化：统计总数 - 已有数 = 新增/更新数
            cur.execute(
                f'SELECT count(*) FROM "{table_name}" WHERE import_job_id = %s',
                (job_id,)
            )
            affected_rows = cur.fetchone()['count']

            # 近似统计 (execute_batch 不提供精确的 inserted/updated/skipped 分解)
            # 通过比较 total_rows 和 affected_rows 来估算
            if conflict_cols:
                # 有冲突键时: affected_rows 包含 insert + update
                inserted = affected_rows
                updated = max(0, total_rows - affected_rows)
                skipped = 0
            else:
                inserted = affected_rows
                updated = 0
                skipped = max(0, total_rows - affected_rows)

        except Exception as e:
            # 如果批量失败，回退到逐行模式以收集错误
            conn.rollback()
            cur = conn.cursor(cursor_factory=RealDictCursor)

            for i, params in enumerate(batch_params):
                try:
                    cur.execute(sql, params)
                    if cur.rowcount == 1:
                        inserted += 1
                    elif cur.rowcount == 0:
                        skipped += 1
                    else:
                        updated += cur.rowcount
                except Exception as row_e:
                    errors.append(ParseErrorEntry(row=i + 1, error=str(row_e)))
                    conn.rollback()
                    cur = conn.cursor(cursor_factory=RealDictCursor)
                    continue

        # 9. 更新日志
        errors_json = json.dumps([e.model_dump() for e in errors], ensure_ascii=False)
        cur.execute(
            """UPDATE import_logs SET
               total_rows = %s, inserted_rows = %s, updated_rows = %s,
               skipped_rows = %s, error_count = %s,
               status = 'completed', finished_at = NOW(),
               error_details = %s WHERE id = %s""",
            (total_rows, inserted, updated, skipped, len(errors), errors_json, log_id)
        )

        # 10. 更新 file_records 状态
        cur.execute(
            "UPDATE file_records SET status = 'imported', import_job_id = %s WHERE id = %s",
            (job_id, file_record_id)
        )

        # 11. 同步写入业务表（导入临时表 → 模块对应的业务主表）
        business_synced = _sync_to_business_table(
            conn, cur, module_type, table_name,
            col_mapping, insert_excel_cols, batch_params,
            job_id, file_record_id, data_period
        )

        conn.commit()

        return ConfirmResult(
            success=True,
            job_id=job_id,
            log_id=log_id,
            table_name=table_name,
            total_rows=total_rows,
            inserted=inserted,
            updated=updated,
            skipped=skipped,
            errors=errors,
        )

    except Exception as e:
        conn.rollback()
        return ConfirmResult(
            success=False,
            error=str(e),
            traceback=traceback.format_exc(),
        )
    finally:
        conn.close()


# ============================================================
# 主流程: 回滚
# ============================================================
def do_rollback(job_id: str) -> RollbackResult:
    """按 job_id 回滚导入数据（返回 Pydantic 模型）"""
    conn = get_db_conn()

    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1. 查找导入日志
        cur.execute("SELECT * FROM import_logs WHERE job_id = %s", (job_id,))
        log = cur.fetchone()
        if not log:
            return RollbackResult(success=False, error=f'未找到导入记录: job_id={job_id}')

        log = dict(log)
        module_type: str = log.get('module_type', '')
        table_name: str = log['target_table']

        # 2. 统计要删除的行数（临时表）
        cur.execute(f'SELECT count(*) as c FROM "{table_name}" WHERE import_job_id = %s', (job_id,))
        delete_count: int = cur.fetchone()['c']

        # 3. 删除临时表数据
        cur.execute(f'DELETE FROM "{table_name}" WHERE import_job_id = %s', (job_id,))

        # 4. 同步清理业务表（按 import_job_id 删除对应行）
        business_deleted = 0
        if module_type in BUSINESS_TABLE_MAP:
            business_table = BUSINESS_TABLE_MAP[module_type][0]
            try:
                cur.execute(f'SELECT count(*) as c FROM "{business_table}" WHERE import_job_id = %s', (job_id,))
                business_deleted = cur.fetchone()['c']
                if business_deleted > 0:
                    cur.execute(f'DELETE FROM "{business_table}" WHERE import_job_id = %s', (job_id,))
                    print(f'[ROLLBACK] 已从业务表 {business_table} 清理 {business_deleted} 行', file=sys.stderr)
            except Exception as e:
                print(f'[WARN] 业务表清理失败 ({business_table}): {e}', file=sys.stderr)

        # 5. 更新日志状态
        cur.execute(
            "UPDATE import_logs SET status = 'rolled_back', finished_at = NOW() WHERE job_id = %s",
            (job_id,)
        )

        # 6. 更新 file_records 状态
        cur.execute(
            "UPDATE file_records SET status = 'rolled_back' WHERE import_job_id = %s",
            (job_id,)
        )

        conn.commit()

        return RollbackResult(
            success=True,
            job_id=job_id,
            deleted_rows=delete_count,
            table_name=table_name,
        )

    except Exception as e:
        conn.rollback()
        return RollbackResult(success=False, error=str(e))
    finally:
        conn.close()


# ============================================================
# 主入口
# ============================================================
def main() -> None:
    parser = argparse.ArgumentParser(description='HSE 智能导入解析引擎 (Polars 高性能版)')
    parser.add_argument('--json-input', dest='json_input', default=None,
                        help='从 JSON 文件读取参数（避免命令行中文编码问题）')
    parser.add_argument('--action', default='', choices=['', 'parse', 'confirm', 'rollback'])
    parser.add_argument('--file-path', dest='file_path', default='')
    parser.add_argument('--file-name', dest='file_name', default='')
    parser.add_argument('--file-record-id', dest='file_record_id', type=int, default=None)
    parser.add_argument('--job-id', dest='job_id', default='')
    parser.add_argument('--operator', default='system')

    args = parser.parse_args()

    # 如果提供了 JSON 输入文件，从文件读取参数
    if args.json_input:
        with open(args.json_input, 'r', encoding='utf-8') as f:
            params = json.load(f)
        args.action = params.get('action', '')
        args.file_path = params.get('file_path', '')
        args.file_name = params.get('file_name', '')
        args.file_record_id = params.get('file_record_id')
        if isinstance(args.file_record_id, str):
            # 防御：前端 mock 回退可能传入 'import_<timestamp>' 格式，尝试提取纯数字部分
            raw = args.file_record_id.strip()
            if raw.startswith('import_'):
                raw = raw[7:]  # 去掉 'import_' 前缀
            args.file_record_id = int(raw) if raw.isdigit() else None
        args.job_id = params.get('job_id', '')
        args.operator = params.get('operator', 'system')

    result: Optional[Any] = None

    if args.action == 'parse':
        result = do_parse(args.file_path, args.file_name, args.file_record_id)

    elif args.action == 'confirm':
        if not args.job_id:
            import uuid
            args.job_id = str(uuid.uuid4())
        result = do_confirm(args.job_id, args.file_record_id, args.operator)

    elif args.action == 'rollback':
        result = do_rollback(args.job_id)

    # 输出 JSON 到 stdout（Pydantic 模型序列化，确保中文字符正常输出）
    if result is not None:
        if isinstance(result, BaseModel):
            print(json.dumps(result.model_dump(), ensure_ascii=False, default=str))
        else:
            print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
