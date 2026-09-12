#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HSE 安全管理系统 — 智能导入解析引擎 (Pydantic 类型安全版)
文件: import_parser.py
功能: 文件名识别 → Excel解析 → 字段映射 → 数据清洗 → 冲突检测 → 预览数据生成
调用: python import_parser.py --action=parse --file-path=xxx --file-name=xxx --file-record-id=xxx
      python import_parser.py --action=confirm --job-id=xxx --file-record-id=xxx
输出: JSON 到 stdout (Pydantic 模型序列化)
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

import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel, Field, field_validator, ConfigDict


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

    success: bool = Field(description="是否成功")
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
# Excel 解析
# ============================================================
def read_excel(file_path: str, header_row: int = 0) -> pd.DataFrame:
    """读取 Excel 文件，返回 DataFrame"""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.csv':
        for encoding in ['utf-8', 'gbk', 'gb2312', 'latin1']:
            try:
                df = pd.read_csv(file_path, encoding=encoding, header=header_row)
                return df
            except (UnicodeDecodeError, Exception):
                continue
        raise ValueError(f"无法解析 CSV 文件: {file_path}")

    elif ext in ('.xlsx', '.xls'):
        df = pd.read_excel(file_path, header=header_row, engine='openpyxl' if ext == '.xlsx' else 'xlrd')
        return df

    else:
        raise ValueError(f"不支持的文件格式: {ext}")


def normalize_column_name(col: Any) -> str:
    """标准化列名：去空格、去换行、统一命名"""
    if col is None:
        return ''
    s = str(col).strip()
    s = s.replace('\n', '').replace('\r', '').replace('  ', ' ')
    return s


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
# 数据清洗
# ============================================================
def clean_value(value: Any, clean_type: str) -> Any:
    """根据清洗规则清洗单个值"""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None

    if clean_type == 'id_card':
        s = str(value).strip().replace(' ', '').replace('-', '')
        return s

    elif clean_type == 'date':
        if isinstance(value, (datetime, date)):
            return value.strftime('%Y-%m-%d')
        if isinstance(value, (int, float)):
            try:
                base = datetime(1899, 12, 30)
                dt = base + pd.Timedelta(days=float(value))
                return dt.strftime('%Y-%m-%d')
            except Exception:
                pass
        s = str(value).strip()
        for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y年%m月%d日', '%d/%m/%Y', '%m/%d/%Y']:
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue
        try:
            parsed = pd.to_datetime(s)
            if not pd.isna(parsed):
                return parsed.strftime('%Y-%m-%d')
        except Exception:
            pass
        return s

    elif clean_type == 'phone':
        s = str(value).strip().replace(' ', '').replace('-', '').replace('+86', '')
        return s

    elif clean_type == 'currency':
        if isinstance(value, (int, float)):
            return round(float(value), 2)
        s = str(value).strip().replace(',', '').replace('¥', '').replace('￥', '').replace('元', '')
        try:
            return round(float(s), 2)
        except ValueError:
            return None

    return value


def clean_dataframe(df: pd.DataFrame,
                    col_mapping: Dict[str, str],
                    cleaning_rules: Dict[str, str]) -> pd.DataFrame:
    """清洗 DataFrame 数据"""
    if not cleaning_rules:
        return df

    db_to_excel = {v: k for k, v in col_mapping.items()}

    for db_col, clean_type in cleaning_rules.items():
        excel_col = db_to_excel.get(db_col)
        if excel_col and excel_col in df.columns:
            df[excel_col] = df[excel_col].apply(lambda v: clean_value(v, clean_type))

    return df


# ============================================================
# Row Hash 计算
# ============================================================
def calculate_row_hash(row_data: Dict[str, Any]) -> str:
    """计算行数据的 SHA256 哈希"""
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
# 冲突检测
# ============================================================
def check_conflicts(conn: psycopg2.extensions.connection,
                    table_name: str,
                    df: pd.DataFrame,
                    col_mapping: Dict[str, str],
                    conflict_keys: List[str],
                    data_period: str) -> ConflictStats:
    """
    检查数据冲突，返回新增/更新/跳过的统计
    """
    cur = conn.cursor()

    db_to_excel = {v: k for k, v in col_mapping.items()}

    conflict_excel_cols: List[tuple] = []
    for ck in conflict_keys:
        excel_col = db_to_excel.get(ck, ck)
        conflict_excel_cols.append((ck, excel_col))

    inserted = 0
    updated = 0
    skipped = 0
    existing_hashes: set = set()

    try:
        cur.execute(f'SELECT row_hash FROM "{table_name}" WHERE row_hash IS NOT NULL')
        for row in cur.fetchall():
            existing_hashes.add(row[0])
    except Exception:
        pass

    for _, row in df.iterrows():
        row_data: Dict[str, Any] = {}
        for excel_col, db_col in col_mapping.items():
            if excel_col in df.columns:
                val = row[excel_col]
                if pd.isna(val):
                    val = None
                row_data[db_col] = val

        row_hash = calculate_row_hash(row_data)

        if row_hash in existing_hashes:
            skipped += 1
        else:
            if conflict_keys:
                conditions: List[str] = []
                params: List[Any] = []
                for ck, excel_col in conflict_excel_cols:
                    val = row.get(excel_col)
                    if pd.isna(val) or val is None:
                        conditions.append(f'"{ck}" IS NULL')
                    else:
                        conditions.append(f'"{ck}" = %s')
                        params.append(str(val))

                conditions.append('(data_period IS NULL OR data_period = %s)')
                params.append(data_period)

                query = f'SELECT row_hash FROM "{table_name}" WHERE {" AND ".join(conditions)} LIMIT 1'
                try:
                    cur.execute(query, params)
                    result = cur.fetchone()
                    if result:
                        if result[0] == row_hash:
                            skipped += 1
                        else:
                            updated += 1
                    else:
                        inserted += 1
                except Exception:
                    inserted += 1
            else:
                inserted += 1

            existing_hashes.add(row_hash)

    cur.close()

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


# ============================================================
# 主流程: 解析
# ============================================================
def do_parse(file_path: str, file_name: str,
             file_record_id: Optional[int] = None) -> ParseResult:
    """解析文件，返回预览数据（Pydantic 模型）"""

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
        table_name: str = config['table_name']
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

        # 7. 读取 Excel
        header_row: int = config.get('header_row', 0) or 0
        df = read_excel(file_path, header_row)
        df = df.dropna(how='all')
        total_rows = len(df)

        # 8. 智能匹配列
        col_mapping = match_columns(list(df.columns), column_mapping, aliases)

        if not col_mapping:
            return ParseResult(
                success=False,
                error=f'无法匹配任何列。Excel列: {list(df.columns)}',
                module_type=module_type,
                target_table=table_name,
            )

        # 9. 数据清洗
        df = clean_dataframe(df, col_mapping, cleaning_rules)

        # 10. 冲突检测
        conflict_stats = check_conflicts(conn, table_name, df, col_mapping, conflict_keys, data_period)

        # 11. 准备预览数据（前10行）
        preview_rows: List[Dict[str, Any]] = []
        for _, row in df.head(10).iterrows():
            row_data: Dict[str, Any] = {}
            for excel_col, db_col in col_mapping.items():
                if excel_col in df.columns:
                    val = row[excel_col]
                    if pd.isna(val):
                        val = None
                    row_data[db_col] = str(val) if val is not None else None
            preview_rows.append(row_data)

        # 12. 更新 file_records
        if file_record_id:
            cur = conn.cursor()
            cur.execute(
                """UPDATE file_records SET module_type = %s, data_period = %s,
                   file_hash = %s, status = 'parsed' WHERE id = %s""",
                (module_type, data_period, file_hash, file_record_id)
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
            errors=[],
        )

    finally:
        conn.close()


# ============================================================
# 主流程: 确认入库
# ============================================================
def do_confirm(job_id: str, file_record_id: int,
               operator: str = 'system') -> ConfirmResult:
    """确认入库，执行 Upsert（返回 Pydantic 模型）"""

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
        table_name: str = config['table_name']
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

        # 4. 重新解析文件
        header_row: int = config.get('header_row', 0) or 0
        df = read_excel(file_path, header_row)
        df = df.dropna(how='all')

        json_config = load_config_from_json()
        aliases: Dict[str, List[str]] = {}
        modules = json_config.get('modules', {})
        if module_type in modules:
            for tbl in modules[module_type].get('tables', []):
                if tbl['table_name'] == table_name:
                    aliases = tbl.get('aliases', {})
                    break

        col_mapping = match_columns(list(df.columns), column_mapping, aliases)
        df = clean_dataframe(df, col_mapping, cleaning_rules)

        # 5. 执行 Upsert
        total_rows: int = len(df)
        inserted: int = 0
        updated: int = 0
        skipped: int = 0
        errors: List[ParseErrorEntry] = []

        conflict_cols = ', '.join(f'"{ck}"' for ck in conflict_keys) if conflict_keys else None

        for _, row in df.iterrows():
            try:
                row_data: Dict[str, Any] = {}
                for excel_col, db_col in col_mapping.items():
                    if excel_col in df.columns:
                        val = row[excel_col]
                        if pd.isna(val):
                            val = None
                        row_data[db_col] = val

                row_hash = calculate_row_hash(row_data)
                row_data['row_hash'] = row_hash
                row_data['data_period'] = data_period
                row_data['source_file_id'] = file_record_id
                row_data['import_job_id'] = job_id
                row_data['last_updated_at'] = datetime.now()

                cols = list(row_data.keys())
                col_str = ', '.join(f'"{c}"' for c in cols)
                val_str = ', '.join('%s' for _ in cols)
                params = [row_data[c] for c in cols]

                if conflict_cols:
                    update_cols = [c for c in cols if c not in conflict_keys]
                    update_str = ', '.join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)
                    update_str += ', version = "{table}"."version" + 1'.format(table=table_name)

                    query = f'''INSERT INTO "{table_name}" ({col_str})
                                VALUES ({val_str})
                                ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_str}'''
                else:
                    query = f'''INSERT INTO "{table_name}" ({col_str})
                                VALUES ({val_str})
                                ON CONFLICT DO NOTHING'''

                cur.execute(query, params)

                if cur.rowcount == 1:
                    inserted += 1
                elif cur.rowcount == 0:
                    skipped += 1
                else:
                    updated += cur.rowcount

            except Exception as e:
                errors.append(ParseErrorEntry(row=len(errors) + 1, error=str(e)))
                conn.rollback()
                continue

        # 6. 更新日志
        errors_json = json.dumps([e.model_dump() for e in errors], ensure_ascii=False)
        cur.execute(
            """UPDATE import_logs SET
               total_rows = %s, inserted_rows = %s, updated_rows = %s,
               skipped_rows = %s, error_count = %s,
               status = 'completed', finished_at = NOW(),
               error_details = %s WHERE id = %s""",
            (total_rows, inserted, updated, skipped, len(errors), errors_json, log_id)
        )

        # 7. 更新 file_records 状态
        cur.execute(
            "UPDATE file_records SET status = 'imported', import_job_id = %s WHERE id = %s",
            (job_id, file_record_id)
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
        table_name: str = log['target_table']

        # 2. 统计要删除的行数
        cur.execute(f'SELECT count(*) as c FROM "{table_name}" WHERE import_job_id = %s', (job_id,))
        delete_count: int = cur.fetchone()['c']

        # 3. 删除数据
        cur.execute(f'DELETE FROM "{table_name}" WHERE import_job_id = %s', (job_id,))

        # 4. 更新日志状态
        cur.execute(
            "UPDATE import_logs SET status = 'rolled_back', finished_at = NOW() WHERE job_id = %s",
            (job_id,)
        )

        # 5. 更新 file_records 状态
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
    parser = argparse.ArgumentParser(description='HSE 智能导入解析引擎 (Pydantic)')
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
            args.file_record_id = int(args.file_record_id) if args.file_record_id else None
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
