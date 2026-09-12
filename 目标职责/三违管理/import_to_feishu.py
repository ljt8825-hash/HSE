"""
飞书多维表格数据导入工具
将本地 Excel 数据同步到飞书多维表格
"""
import pandas as pd
import requests
import json
import base64
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, ".."))
EXCEL_PATH = os.path.join(PROJECT_ROOT, "数据源", "07_三违管理", "宁津项目三违检查清单.xlsx")

# 配置（凭据改从环境变量读取，避免明文入库）
BASE_URL = "https://open.feishu.cn/open-apis"
APP_ID = os.getenv("FEISHU_APP_ID", "")
APP_SECRET = os.getenv("FEISHU_APP_SECRET", "")
BASE_TOKEN = os.getenv("FEISHU_BASE_TOKEN", "")

def get_tenant_access_token():
    """获取 tenant_access_token"""
    url = f"{BASE_URL}/auth/v3/tenant_access_token/internal"
    headers = {"Content-Type": "application/json"}
    data = {
        "app_id": APP_ID,
        "app_secret": APP_SECRET
    }

    response = requests.post(url, headers=headers, json=data)
    result = response.json()

    if result.get("code") == 0:
        return result.get("tenant_access_token")
    else:
        print(f"❌ 获取 token 失败: {result}")
        return None

def get_table_info(base_token, access_token):
    """获取表格信息"""
    url = f"{BASE_URL}/bitable/v1/apps/{base_token}/tables"
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(url, headers=headers)
    result = response.json()

    if result.get("code") == 0:
        return result.get("data", {}).get("items", [])
    else:
        print(f"❌ 获取表格信息失败: {result}")
        return []

def get_fields(table_id, access_token):
    """获取字段列表"""
    url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/fields"
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(url, headers=headers)
    result = response.json()

    if result.get("code") == 0:
        return result.get("data", {}).get("items", [])
    else:
        print(f"❌ 获取字段失败: {result}")
        return []

def create_field(table_id, field_name, field_type, access_token):
    """创建字段"""
    url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/fields"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    # 字段类型映射
    field_type_map = {
        "text": 1,           # 文本
        "number": 2,         # 数字
        "single_select": 3,  # 单选
        "multi_select": 4,   # 多选
        "date": 5,           # 日期
        "attachment": 7,      # 附件
        "checkbox": 8,       # 复选框
    }

    data = {
        "field_name": field_name,
        "type": field_type_map.get(field_type, 1)
    }

    response = requests.post(url, headers=headers, json=data)
    result = response.json()

    if result.get("code") == 0:
        return result.get("data", {}).get("field", {})
    else:
        print(f"  ⚠️ 创建字段 {field_name} 失败: {result.get('msg')}")
        return None

def batch_create_records(table_id, records, access_token):
    """批量创建记录"""
    url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/records/batch_create"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    # 转换记录格式
    fields = {}
    for key, value in records[0].items():
        if value is not None and str(value) != 'nan':
            # 处理日期字段
            if isinstance(value, (datetime, pd.Timestamp)):
                value = int(pd.Timestamp(value).timestamp() * 1000)
            fields[key] = value

    data = {
        "records": [{"fields": fields}]
    }

    response = requests.post(url, headers=headers, json=data)
    result = response.json()

    if result.get("code") == 0:
        return True
    else:
        print(f"❌ 创建记录失败: {result}")
        return False

def main():
    print("=" * 70)
    print("🚀 飞书多维表格数据导入工具")
    print("=" * 70)
    print(f"\n📋 目标表格: 三违检查记录表")
    print(f"🔑 Base Token: {BASE_TOKEN}")
    print(f"📁 数据源: {EXCEL_PATH}")
    print()

    # 步骤1: 获取访问令牌
    print("=" * 70)
    print("🔐 步骤1: 获取访问令牌")
    print("=" * 70)

    access_token = get_tenant_access_token()
    if not access_token:
        print("❌ 无法获取访问令牌，程序退出")
        return

    print(f"✅ 成功获取访问令牌")
    print()

    # 步骤2: 获取表格信息
    print("=" * 70)
    print("📊 步骤2: 获取表格信息")
    print("=" * 70)

    tables = get_table_info(BASE_TOKEN, access_token)
    if not tables:
        print("❌ 无法获取表格信息，程序退出")
        return

    print(f"✅ 找到 {len(tables)} 个表格")
    for table in tables:
        print(f"  📋 {table['name']} (ID: {table['table_id']})")

    # 获取第一个表格的信息
    main_table = tables[0]
    main_table_id = main_table['table_id']
    print(f"\n📌 主表格: {main_table['name']}")
    print(f"   表格ID: {main_table_id}")
    print()

    # 步骤3: 读取 Excel 数据
    print("=" * 70)
    print("📖 步骤3: 读取 Excel 数据")
    print("=" * 70)

    try:
        excel_file = pd.ExcelFile(EXCEL_PATH)
        print(f"✅ 成功读取 Excel 文件")
        print(f"📑 工作表: {', '.join(excel_file.sheet_names)}")

        # 显示每个工作表的数据预览
        for sheet_name in excel_file.sheet_names:
            df = pd.read_excel(EXCEL_PATH, sheet_name=sheet_name, header=0)
            print(f"\n📋 {sheet_name}:")
            print(f"   记录数: {len(df)}")
            print(f"   字段: {', '.join(df.columns.tolist()[:5])}...")
            print(df.head(3).to_string())

    except Exception as e:
        print(f"❌ 读取 Excel 失败: {e}")
        return

    print("\n" + "=" * 70)
    print("💡 下一步操作")
    print("=" * 70)
    print()
    print("✅ 数据读取成功！")
    print()
    print("由于飞书 API 限制，大批量数据导入建议:")
    print("  1. 在飞书网页版中打开表格，手动导入 Excel")
    print("  2. 使用数据导入功能")
    print()
    print("📝 导入步骤:")
    print(f"  1. 打开链接: https://vcn0vq64r47r.feishu.cn/base/{BASE_TOKEN}")
    print("  2. 点击右上角 '...' 或 '导入'")
    print("  3. 选择 '从 Excel 导入'")
    print("  4. 选择文件并完成导入")
    print()

if __name__ == "__main__":
    main()
