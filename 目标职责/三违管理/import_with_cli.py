"""
飞书多维表格数据导入工具（使用飞书 CLI）
通过飞书 CLI 命令导入数据，避免权限问题
"""
import pandas as pd
import subprocess
import json
import time
import sys
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, ".."))
EXCEL_PATH = os.path.join(PROJECT_ROOT, "数据源", "07_三违管理", "宁津项目三违检查清单.xlsx")

# 配置（凭据改从环境变量读取，避免明文入库）
BASE_TOKEN = os.getenv("FEISHU_BASE_TOKEN", "")

def run_lark_cli(command):
    """运行飞书 CLI 命令并返回结果"""
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=60)
        return result.stdout, result.stderr, result.returncode
    except Exception as e:
        return "", str(e), -1

def get_table_id(table_name):
    """获取表格 ID"""
    print(f"📋 正在查找表格: {table_name}")
    cmd = f'lark-cli base +table-list --base-token {BASE_TOKEN} --format json'
    stdout, stderr, code = run_lark_cli(cmd)
    
    if code == 0:
        try:
            result = json.loads(stdout)
            if result.get('ok'):
                for table in result['data']['tables']:
                    if table['name'] == table_name:
                        print(f"✅ 找到表格 (ID: {table['id']})")
                        return table['id']
        except:
            pass
    return None

def get_table_fields(table_id):
    """获取表格字段列表"""
    cmd = f'lark-cli base +field-list --base-token {BASE_TOKEN} --table-id {table_id} --format json'
    stdout, stderr, code = run_lark_cli(cmd)
    
    if code == 0:
        try:
            result = json.loads(stdout)
            if result.get('ok'):
                return {f['field_name']: f for f in result.get('data', {}).get('items', [])}
        except:
            pass
    return {}

def create_field(table_id, field_name, field_type=1):
    """创建字段"""
    cmd = f'lark-cli base +field-create --base-token {BASE_TOKEN} --table-id {table_id} --field-name "{field_name}" --field-type {field_type}'
    stdout, stderr, code = run_lark_cli(cmd)
    
    if code == 0:
        print(f"    ✅ 字段 '{field_name}' 创建成功")
        return True
    else:
        print(f"    ⚠️ 字段 '{field_name}' 创建可能已存在或失败")
        return False

def create_record(table_id, fields):
    """创建单条记录"""
    cmd_parts = [f'lark-cli base +record-create --base-token {BASE_TOKEN} --table-id {table_id}']
    
    for key, value in fields.items():
        if pd.notna(value):
            if isinstance(value, (datetime, pd.Timestamp)):
                value_str = value.strftime('%Y-%m-%d %H:%M:%S')
            else:
                value_str = str(value)
            cmd_parts.append(f'--fields {key}="{value_str}"')
    
    cmd = ' '.join(cmd_parts)
    stdout, stderr, code = run_lark_cli(cmd)
    return code == 0

def import_to_table(table_name, df, table_id):
    """导入数据到表格"""
    print(f"\n📋 正在导入: {table_name}")
    print(f"  记录数: {len(df)}")
    
    # 获取现有字段
    existing_fields = get_table_fields(table_id)
    print(f"  现有字段: {len(existing_fields)}")
    
    # 创建缺失的字段
    for field_name in df.columns:
        if field_name not in existing_fields:
            print(f"    ➕ 创建字段: {field_name}")
            create_field(table_id, field_name)
            time.sleep(0.5)
    
    # 逐条导入记录（批量导入可能有问题，逐条更稳定）
    success_count = 0
    for idx, row in df.iterrows():
        print(f"  📤 导入记录 {idx+1}/{len(df)}...", end='\r')
        
        fields = {}
        for field_name in df.columns:
            value = row[field_name]
            fields[field_name] = value
        
        if create_record(table_id, fields):
            success_count += 1
        else:
            print(f"    ⚠️ 记录 {idx+1} 导入失败")
        
        time.sleep(0.3)  # 避免请求过快
    
    print(f"\n  ✅ 成功导入 {success_count}/{len(df)} 条记录")

def main():
    print("=" * 70)
    print("🚀 飞书多维表格数据导入工具（使用 CLI）")
    print("=" * 70)
    print(f"\n📋 目标表格: 三违检查记录表")
    print(f"🔑 Base Token: {BASE_TOKEN}")
    print(f"📁 数据源: {EXCEL_PATH}")
    print()

    # 获取表格 ID
    table_id = get_table_id("数据表")
    if not table_id:
        print("❌ 无法找到表格")
        return False

    # 读取 Excel
    print("\n📖 正在读取 Excel 文件...")
    try:
        excel_file = pd.ExcelFile(EXCEL_PATH)
        print(f"✅ 成功读取 Excel")
        print(f"📑 工作表: {', '.join(excel_file.sheet_names)}")
    except Exception as e:
        print(f"❌ 读取 Excel 失败: {e}")
        return False

    # 导入数据
    print("\n" + "=" * 70)
    print("📤 开始导入数据")
    print("=" * 70)

    sheet_name = "三违检查记录表"
    if sheet_name in excel_file.sheet_names:
        df = pd.read_excel(EXCEL_PATH, sheet_name=sheet_name, header=0)
        import_to_table(sheet_name, df, table_id)
    else:
        print(f"⚠️ 工作表 '{sheet_name}' 不存在")

    # 完成
    print("\n" + "=" * 70)
    print("✅ 导入完成!")
    print("=" * 70)
    print(f"\n📋 表格链接: https://vcn0vq64r47r.feishu.cn/base/{BASE_TOKEN}")
    print("\n💡 请在浏览器中刷新页面查看数据")

if __name__ == "__main__":
    main()
