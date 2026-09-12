#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HSE 安全管理系统 — 智能导入解析引擎
文件: import_parser.py
功能: 文件名识别 → Excel解析 → 字段映射 → 数据清洗 → 冲突检测 → 预览数据生成
调用: python import_parser.py --action=parse --file-path=xxx --file-name=xxx --file-record-id=xxx
      python import_parser.py --action=confirm --job-id=xxx --file-record-id=xxx
输出: JSON 到 stdout
"""

import sys
import os
import json
import hashlib
import re
import argparse
import traceback
from datetime import datetime, date
from typing import Any, Optional

import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor

# ============================================================
# 配置
# ============================================================
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('DB_PORT', '5432')),
    'dbname': os.environ.get('DB_NAME', 'safety_dashboard'),
    'user': os.environ.get('DB_USER', 'postgres'),
    # 不传 password，使用 trust 认证
}

# JSON 配置文件路径（备份用）
JSON_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'field_mapping.json')


# ============================================================
# 数据库操作
# ============================================================
def get_db_conn():
    """获取数据库连接"""
    return psycopg2.connect(**DB_CONFIG)


def load_config_from_db(conn, module_type: str = None) -> list:
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


def load_config_from_json() -> dict:
    """从 JSON 文件加载配置（备份）"""
    with open(JSON_CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


# ============================================================
# 文件名智能识别
# ============================================================
def identify_module(file_name: str, configs: list) -> Optional[dict]:
    """
    根据文件名识别模块类型和目标表
    优先匹配 file_pattern，其次匹配 module_type 关键词
    """
    file_lower = file_name.lower()

    # 第一轮：精确匹配 file_pattern
    for cfg in configs:
        pattern = cfg.get('file_pattern', '')
        if pattern:
            try:
                if re.search(pattern, file_name, re.IGNORECASE):
                    return cfg
            except re.error:
                continue

    # 第二轮：模块关键词匹配
    json_config = load_config_from_json()
    module_keywords = json_config.get('filename_parsing', {}).get('module_keywords', {})

    for module_type, keywords in module_keywords.items():
        for kw in keywords:
            if kw in file_name:
                # 找到匹配的模块，返回该模块的第一个表配置
                for cfg in configs:
                    if cfg['module_type'] == module_type:
                        return cfg
                break

    # 第三轮：表名关键词匹配
    for cfg in configs:
        table_name = cfg['table_name']
        # 提取表名中的中文关键词
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
    # 2026年7月 / 2026年07月
    m = re.search(r'(\d{4})年(\d{1,2})月', file_name)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"

    # 2026-07 / 2026-7
    m = re.search(r'(\d{4})-(\d{1,2})', file_name)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"

    # 2026.7 / 2026.07
    m = re.search(r'(\d{4})\.(\d{1,2})', file_name)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"

    # 2026年第3季度
    m = re.search(r'(\d{4})年第(\d)季度', file_name)
    if m:
        quarter_start = {1: 1, 2: 4, 3: 7, 4: 10}
        month = quarter_start.get(int(m.group(2)), 1)
        return f"{m.group(1)}-{month:02d}-01"

    # 仅年份 2026
    m = re.search(r'(\d{4})', file_name)
    if m:
        return f"{m.group(1)}-01-01"

    # 默认当前月
    now = datetime.now()
    return f"{now.year}-{now.month:02d}-01"


# ============================================================
# Excel 解析
# ============================================================
def read_excel(file_path: str, header_row: int = 0) -> pd.DataFrame:
    """读取 Excel 文件，返回 DataFrame"""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.csv':
        # 尝试多种编码
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


def normalize_column_name(col: str) -> str:
    """标准化列名：去空格、去换行、统一命名"""
    if col is None:
        return ''
    s = str(col).strip()
    s = s.replace('\n', '').replace('\r', '').replace('  ', ' ')
    return s


def match_columns(df_columns: list, column_mapping: dict, aliases: dict = None) -> dict:
    """
    智能匹配 Excel 列名到数据库列名
    返回: { excel_col: db_col }
    """
    result = {}
    aliases = aliases or {}

    # 标准化 Excel 列名
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
            # 已匹配，跳过
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
        if len(s) == 18:
            return s
        elif len(s) == 15:
            # 15位老身份证，补全为18位
            return s
        return s

    elif clean_type == 'date':
        if isinstance(value, (datetime, date)):
            return value.strftime('%Y-%m-%d')
        if isinstance(value, (int, float)):
            # Excel 序列号转日期
            try:
                base = datetime(1899, 12, 30)
                dt = base + pd.Timedelta(days=float(value))
                return dt.strftime('%Y-%m-%d')
            except Exception:
                pass
        s = str(value).strip()
        # 尝试多种日期格式
        for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y年%m月%d日', '%d/%m/%Y', '%m/%d/%Y']:
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue
        # pandas 自动解析
        try:
            parsed = pd.to_datetime(s)
            if not pd.isna(parsed):
                return parsed.strftime('%Y-%m-%d')
        except Exception:
            pass
        return s

    elif clean_type == 'phone':
        s = str(value).strip().replace(' ', '').replace('-', '').replace('+86', '')
        if len(s) == 11 and s.startswith('1'):
            return s
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


def clean_dataframe(df: pd.DataFrame, col_mapping: dict, cleaning_rules: dict) -> pd.DataFrame:
    """清洗 DataFrame 数据"""
    if not cleaning_rules:
        return df

    # 反转映射：db_col -> excel_col
    db_to_excel = {v: k for k, v in col_mapping.items()}

    for db_col, clean_type in cleaning_rules.items():
        excel_col = db_to_excel.get(db_col)
        if excel_col and excel_col in df.columns:
            df[excel_col] = df[excel_col].apply(lambda v: clean_value(v, clean_type))

    return df


# ============================================================
# Row Hash 计算
# ============================================================
def calculate_row_hash(row_data: dict) -> str:
    """计算行数据的 SHA256 哈希"""
    # 按 key 排序确保一致性
    sorted_items = sorted(row_data.items())
    raw = json.dumps(sorted_items, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


# ============================================================
# 冲突检测
# ============================================================
def check_conflicts(conn, table_name: str, df: pd.DataFrame, col_mapping: dict,
                    conflict_keys: list, data_period: str) -> dict:
    """
    检查数据冲突，返回新增/更新/跳过的统计
    """
    cur = conn.cursor()

    # 反转映射
    db_to_excel = {v: k for k, v in col_mapping.items()}

    # 获取冲突键对应的 Excel 列
    conflict_excel_cols = []
    for ck in conflict_keys:
        excel_col = db_to_excel.get(ck, ck)
        conflict_excel_cols.append((ck, excel_col))

    inserted = 0
    updated = 0
    skipped = 0
    existing_hashes = set()

    # 查询现有数据的 row_hash
    try:
        cur.execute(f'SELECT row_hash FROM "{table_name}" WHERE row_hash IS NOT NULL')
        for row in cur.fetchall():
            existing_hashes.add(row[0])
    except Exception:
        pass  # 表可能还没有数据

    for _, row in df.iterrows():
        row_data = {}
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
            # 检查冲突键是否已存在
            if conflict_keys:
                conditions = []
                params = []
                for ck, excel_col in conflict_excel_cols:
                    val = row.get(excel_col)
                    if pd.isna(val) or val is None:
                        conditions.append(f'"{ck}" IS NULL')
                    else:
                        conditions.append(f'"{ck}" = %s')
                        params.append(str(val))

                # 也考虑 data_period
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

    return {
        'inserted': inserted,
        'updated': updated,
        'skipped': skipped
    }


# ============================================================
# 主流程: 解析
# ============================================================
def do_parse(file_path: str, file_name: str, file_record_id: int = None) -> dict:
    """解析文件，返回预览数据"""

    # 1. 检查文件是否存在
    if not os.path.exists(file_path):
        return {'success': False, 'error': f'文件不存在: {file_path}'}

    # 2. 计算文件哈希
    file_hash = calculate_file_hash(file_path)

    # 3. 连接数据库，加载配置
    conn = get_db_conn()

    try:
        configs = load_config_from_db(conn)

        # 4. 识别模块
        config = identify_module(file_name, configs)
        if not config:
            return {
                'success': False,
                'error': f'无法识别文件对应的模块: {file_name}',
                'file_name': file_name,
                'file_hash': file_hash
            }

        module_type = config['module_type']
        table_name = config['table_name']
        conflict_keys = config.get('conflict_keys', [])
        column_mapping = config.get('column_mapping', {})
        if isinstance(column_mapping, str):
            column_mapping = json.loads(column_mapping)
        cleaning_rules = config.get('data_cleaning_rules', {})
        if isinstance(cleaning_rules, str):
            cleaning_rules = json.loads(cleaning_rules)

        # 5. 提取数据周期
        data_period = extract_data_period(file_name)

        # 6. 从 JSON 配置加载别名
        aliases = {}
        json_config = load_config_from_json()
        modules = json_config.get('modules', {})
        if module_type in modules:
            for tbl in modules[module_type].get('tables', []):
                if tbl['table_name'] == table_name:
                    aliases = tbl.get('aliases', {})
                    break

        # 7. 读取 Excel
        header_row = config.get('header_row', 0) or 0
        df = read_excel(file_path, header_row)

        # 去除全空行
        df = df.dropna(how='all')

        total_rows = len(df)

        # 8. 智能匹配列
        col_mapping = match_columns(list(df.columns), column_mapping, aliases)

        if not col_mapping:
            return {
                'success': False,
                'error': f'无法匹配任何列。Excel列: {list(df.columns)}',
                'module_type': module_type,
                'table_name': table_name
            }

        # 9. 数据清洗
        df = clean_dataframe(df, col_mapping, cleaning_rules)

        # 10. 冲突检测
        conflict_stats = check_conflicts(conn, table_name, df, col_mapping, conflict_keys, data_period)

        # 11. 准备预览数据（前10行）
        preview_rows = []
        for _, row in df.head(10).iterrows():
            row_data = {}
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

        result = {
            'success': True,
            'module_type': module_type,
            'module_name': get_module_name(module_type, json_config),
            'data_period': data_period,
            'target_table': table_name,
            'file_hash': file_hash,
            'total_rows': total_rows,
            'matched_columns': col_mapping,
            'unmatched_excel_columns': [c for c in df.columns if c not in col_mapping],
            'conflict_keys': conflict_keys,
            'preview': conflict_stats,
            'sample_data': preview_rows,
            'errors': []
        }

    finally:
        conn.close()

    return result


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


def get_module_name(module_type: str, json_config: dict) -> str:
    """获取模块中文名称"""
    modules = json_config.get('modules', {})
    if module_type in modules:
        return modules[module_type].get('name', module_type)
    return module_type


# ============================================================
# 主流程: 确认入库
# ============================================================
def do_confirm(job_id: str, file_record_id: int, operator: str = 'system') -> dict:
    """确认入库，执行 Upsert"""

    conn = get_db_conn()

    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1. 获取 file_records 信息
        cur.execute("SELECT * FROM file_records WHERE id = %s", (file_record_id,))
        file_record = cur.fetchone()
        if not file_record:
            return {'success': False, 'error': f'文件记录不存在: id={file_record_id}'}

        file_record = dict(file_record)
        file_path = file_record.get('filepath', '')
        file_name = file_record.get('original_name', '')
        module_type = file_record.get('module_type', '')
        data_period = file_record.get('data_period')

        if not module_type or not data_period:
            return {'success': False, 'error': '文件尚未解析，请先执行解析'}

        # 2. 创建 import_logs 记录
        cur.execute(
            """INSERT INTO import_logs (file_record_id, job_id, module_type, data_period,
               target_table, status, started_at, operator)
               VALUES (%s, %s, %s, %s, %s, 'running', NOW(), %s) RETURNING id""",
            (file_record_id, job_id, module_type, data_period,
             '', operator)
        )
        log_id = cur.fetchone()['id']

        # 3. 获取配置
        configs = load_config_from_db(conn, module_type)
        config = identify_module(file_name, configs)
        if not config:
            cur.execute("UPDATE import_logs SET status = 'failed', finished_at = NOW() WHERE id = %s", (log_id,))
            conn.commit()
            return {'success': False, 'error': f'无法识别模块: {file_name}'}

        config = dict(config)
        table_name = config['table_name']
        conflict_keys = config.get('conflict_keys', [])
        column_mapping = config.get('column_mapping', {})
        if isinstance(column_mapping, str):
            column_mapping = json.loads(column_mapping)
        cleaning_rules = config.get('data_cleaning_rules', {})
        if isinstance(cleaning_rules, str):
            cleaning_rules = json.loads(cleaning_rules)

        # 更新 target_table
        cur.execute("UPDATE import_logs SET target_table = %s WHERE id = %s", (table_name, log_id))

        # 4. 重新解析文件
        header_row = config.get('header_row', 0) or 0
        df = read_excel(file_path, header_row)
        df = df.dropna(how='all')

        # 从 JSON 加载别名
        json_config = load_config_from_json()
        aliases = {}
        modules = json_config.get('modules', {})
        if module_type in modules:
            for tbl in modules[module_type].get('tables', []):
                if tbl['table_name'] == table_name:
                    aliases = tbl.get('aliases', {})
                    break

        col_mapping = match_columns(list(df.columns), column_mapping, aliases)
        df = clean_dataframe(df, col_mapping, cleaning_rules)

        # 5. 执行 Upsert
        total_rows = len(df)
        inserted = 0
        updated = 0
        skipped = 0
        errors = []

        # 构建 ON CONFLICT 子句
        conflict_cols = ', '.join(f'"{ck}"' for ck in conflict_keys) if conflict_keys else None

        for _, row in df.iterrows():
            try:
                row_data = {}
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

                # 构建列名和值
                cols = list(row_data.keys())
                col_str = ', '.join(f'"{c}"' for c in cols)
                val_str = ', '.join('%s' for _ in cols)
                params = [row_data[c] for c in cols]

                if conflict_cols:
                    # ON CONFLICT DO UPDATE
                    update_cols = [c for c in cols if c not in conflict_keys]
                    update_str = ', '.join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)
                    update_str += ', version = "{table}"."version" + 1'.format(table=table_name)

                    query = f'''INSERT INTO "{table_name}" ({col_str})
                                VALUES ({val_str})
                                ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_str}'''
                else:
                    # 无冲突键，直接插入
                    query = f'''INSERT INTO "{table_name}" ({col_str})
                                VALUES ({val_str})
                                ON CONFLICT DO NOTHING'''

                cur.execute(query, params)

                if cur.rowcount == 1:
                    inserted += 1
                elif cur.rowcount == 0:
                    # 可能是 ON CONFLICT DO NOTHING 跳过
                    skipped += 1
                else:
                    updated += cur.rowcount

            except Exception as e:
                errors.append({'row': len(errors) + 1, 'error': str(e)})
                conn.rollback()
                continue

        # 6. 更新日志
        cur.execute(
            """UPDATE import_logs SET
               total_rows = %s, inserted_rows = %s, updated_rows = %s,
               skipped_rows = %s, error_count = %s,
               status = 'completed', finished_at = NOW(),
               error_details = %s WHERE id = %s""",
            (total_rows, inserted, updated, skipped, len(errors),
             json.dumps(errors, ensure_ascii=False), log_id)
        )

        # 7. 更新 file_records 状态
        cur.execute(
            "UPDATE file_records SET status = 'imported', import_job_id = %s WHERE id = %s",
            (job_id, file_record_id)
        )

        conn.commit()

        return {
            'success': True,
            'job_id': job_id,
            'log_id': log_id,
            'table_name': table_name,
            'total_rows': total_rows,
            'inserted': inserted,
            'updated': updated,
            'skipped': skipped,
            'errors': errors
        }

    except Exception as e:
        conn.rollback()
        return {'success': False, 'error': str(e), 'traceback': traceback.format_exc()}
    finally:
        conn.close()


# ============================================================
# 主流程: 回滚
# ============================================================
def do_rollback(job_id: str) -> dict:
    """按 job_id 回滚导入数据"""
    conn = get_db_conn()

    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 1. 查找导入日志
        cur.execute("SELECT * FROM import_logs WHERE job_id = %s", (job_id,))
        log = cur.fetchone()
        if not log:
            return {'success': False, 'error': f'未找到导入记录: job_id={job_id}'}

        log = dict(log)
        table_name = log['target_table']

        # 2. 统计要删除的行数
        cur.execute(f'SELECT count(*) as c FROM "{table_name}" WHERE import_job_id = %s', (job_id,))
        delete_count = cur.fetchone()['c']

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

        return {
            'success': True,
            'job_id': job_id,
            'deleted_rows': delete_count,
            'table_name': table_name
        }

    except Exception as e:
        conn.rollback()
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()


# ============================================================
# 主入口
# ============================================================
def main():
    parser = argparse.ArgumentParser(description='HSE 智能导入解析引擎')
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

    result = None

    if args.action == 'parse':
        result = do_parse(args.file_path, args.file_name, args.file_record_id)

    elif args.action == 'confirm':
        if not args.job_id:
            # 生成新的 job_id
            import uuid
            args.job_id = str(uuid.uuid4())
        result = do_confirm(args.job_id, args.file_record_id, args.operator)

    elif args.action == 'rollback':
        result = do_rollback(args.job_id)

    # 输出 JSON 到 stdout
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
