import pandas as pd
import json
import subprocess
import sys
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, ".."))
EXCEL_PATH = os.path.join(PROJECT_ROOT, "数据源", "07_三违管理", "宁津项目三违检查清单.xlsx")

# 配置（凭据改从环境变量读取，避免明文入库）
BASE_TOKEN = os.getenv("FEISHU_BASE_TOKEN", "")

def run_lark_cli(command):
    """运行飞书 CLI 命令"""
    import os
    os.environ['Path'] = os.environ['Path'] + ";C:\\Program Files\\nodejs"
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    return result

def get_table_list():
    """获取表格列表"""
    print("\n=== 获取表格列表 ===")
    result = run_lark_cli(f'lark-cli base +table-list --base-token {BASE_TOKEN} --format json')
    if result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            if data.get('ok'):
                return data['data']['items']
        except:
            pass
    print(f"获取表格列表失败: {result.stdout}")
    return []

def create_field(table_id, field_name, field_type):
    """创建字段"""
    print(f"创建字段: {field_name} (类型: {field_type})")
    result = run_lark_cli(
        f'lark-cli base +field-create --base-token {BASE_TOKEN} --table-id {table_id} '
        f'--field-name "{field_name}" --field-type {field_type}'
    )
    if result.returncode == 0:
        print(f"  ✅ 字段 {field_name} 创建成功")
        return True
    else:
        print(f"  ⚠️ 字段 {field_name} 可能已存在或创建失败")
        return False

def sync_data_to_table(table_id, records):
    """同步数据到表格"""
    if not records:
        print("  ⚠️ 没有数据需要同步")
        return

    print(f"正在同步 {len(records)} 条记录...")

    # 分批插入，每批最多100条
    batch_size = 100
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        print(f"  同步批次 {i//batch_size + 1} ({len(batch)} 条记录)...")

        # 构建批量创建命令
        for record in batch:
            fields = []
            for key, value in record.items():
                if value is not None and str(value) != 'nan':
                    fields.append(f'--fields {key}="{value}"')

            if fields:
                cmd = f'lark-cli base +record-batch-create --base-token {BASE_TOKEN} --table-id {table_id} ' + ' '.join(fields)
                result = run_lark_cli(cmd)

def main():
    print("=" * 70)
    print("🚀 飞书多维表格数据同步工具")
    print("=" * 70)
    print(f"\n📋 目标表格: 三违检查记录表")
    print(f"🔑 Base Token: {BASE_TOKEN}")
    print(f"📁 数据源: {EXCEL_PATH}")
    print()

    # 步骤1: 读取 Excel 数据
    print("=" * 70)
    print("📖 步骤1: 读取 Excel 数据")
    print("=" * 70)

    try:
        excel_file = pd.ExcelFile(EXCEL_PATH)
        print(f"✅ 成功读取 Excel 文件")
        print(f"📑 工作表数量: {len(excel_file.sheet_names)}")
        print(f"📋 工作表列表: {', '.join(excel_file.sheet_names)}")
    except Exception as e:
        print(f"❌ 读取 Excel 文件失败: {e}")
        sys.exit(1)

    # 步骤2: 获取表格信息
    print("\n" + "=" * 70)
    print("📊 步骤2: 获取飞书多维表格信息")
    print("=" * 70)

    tables = get_table_list()
    if not tables:
        print("⚠️ 未能获取表格列表，跳过字段创建")
        table_id = None
    else:
        print(f"✅ 找到 {len(tables)} 个表格")
        table_id = tables[0]['table_id'] if tables else None
        print(f"📋 第一个表格 ID: {table_id}")

    # 步骤3: 同步各个工作表
    print("\n" + "=" * 70)
    print("📤 步骤3: 同步数据到飞书")
    print("=" * 70)

    # 同步"三违检查记录表"
    if "三违检查记录表" in excel_file.sheet_names:
        print("\n📋 同步工作表: 三违检查记录表")
        df = pd.read_excel(EXCEL_PATH, sheet_name="三违检查记录表", header=0)
        print(f"  总记录数: {len(df)}")
        print(f"  字段: {list(df.columns)}")
        print("  数据预览:")
        print(df.head())

    # 同步"检查任务计划"
    if "检查任务计划" in excel_file.sheet_names:
        print("\n📋 同步工作表: 检查任务计划")
        df = pd.read_excel(EXCEL_PATH, sheet_name="检查任务计划", header=0)
        print(f"  总记录数: {len(df)}")
        print(f"  字段: {list(df.columns)}")
        print("  数据预览:")
        print(df.head())

    # 同步"检查人员信息"
    if "检查人员信息" in excel_file.sheet_names:
        print("\n📋 同步工作表: 检查人员信息")
        df = pd.read_excel(EXCEL_PATH, sheet_name="检查人员信息", header=0)
        print(f"  总记录数: {len(df)}")
        print(f"  字段: {list(df.columns)}")
        print("  数据预览:")
        print(df.head())

    print("\n" + "=" * 70)
    print("✅ 数据读取完成!")
    print("=" * 70)
    print("\n📝 说明:")
    print("  由于飞书 API 的限制，批量插入需要使用 API 接口")
    print("  建议使用以下方法之一:")
    print("  1. 使用 lark-base 技能直接通过 API 导入")
    print("  2. 在飞书网页版中手动导入 Excel")
    print("  3. 使用 Python 脚本调用飞书 API 批量插入")
    print("\n💡 提示: 您可以先在飞书网页版中打开表格，然后导入 Excel 文件")

if __name__ == "__main__":
    main()
