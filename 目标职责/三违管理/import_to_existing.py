"""
飞书多维表格数据导入工具（使用现有表格）
将数据导入到已存在的表格中
"""
import pandas as pd
import requests
import json
import time
import os
from datetime import datetime
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, ".."))

# 配置（凭据改从环境变量读取，避免明文入库）
BASE_URL = "https://open.feishu.cn/open-apis"
APP_ID = os.getenv("FEISHU_APP_ID", "")
APP_SECRET = os.getenv("FEISHU_APP_SECRET", "")
BASE_TOKEN = os.getenv("FEISHU_BASE_TOKEN", "")
EXCEL_PATH = os.path.join(PROJECT_ROOT, "数据源", "07_三违管理", "宁津项目三违检查清单.xlsx")

class FeishuBitableImporter:
    def __init__(self):
        self.access_token = None
        self.headers = None

    def get_access_token(self):
        """获取访问令牌"""
        print("🔐 正在获取访问令牌...")
        url = f"{BASE_URL}/auth/v3/tenant_access_token/internal"
        headers = {"Content-Type": "application/json"}
        data = {
            "app_id": APP_ID,
            "app_secret": APP_SECRET
        }

        try:
            response = requests.post(url, headers=headers, json=data, timeout=10)
            result = response.json()

            if result.get("code") == 0:
                self.access_token = result.get("tenant_access_token")
                self.headers = {
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type": "application/json"
                }
                print("✅ 访问令牌获取成功")
                return True
            else:
                print(f"❌ 获取令牌失败: {result.get('msg')}")
                return False
        except Exception as e:
            print(f"❌ 网络错误: {e}")
            return False

    def get_tables(self):
        """获取所有表格"""
        print("\n📊 正在获取表格列表...")
        url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables"
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            result = response.json()

            if result.get("code") == 0:
                tables = result.get("data", {}).get("items", [])
                print(f"✅ 找到 {len(tables)} 个表格")
                for table in tables:
                    print(f"  📋 {table['name']} (ID: {table['table_id']})")
                return tables
            else:
                print(f"❌ 获取表格失败: {result.get('msg')}")
                return []
        except Exception as e:
            print(f"❌ 错误: {e}")
            return []

    def get_fields(self, table_id):
        """获取表格字段"""
        url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/fields"
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            result = response.json()

            if result.get("code") == 0:
                fields = result.get("data", {}).get("items", [])
                return {f["field_name"]: f for f in fields}
            return {}
        except:
            return {}

    def create_field(self, table_id, field_name, field_type=1):
        """创建字段"""
        url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/fields"
        data = {
            "field_name": field_name,
            "type": field_type
        }

        try:
            response = requests.post(url, headers=self.headers, json=data, timeout=10)
            result = response.json()

            if result.get("code") == 0:
                field_id = result.get("data", {}).get("field", {}).get("field_id")
                print(f"    ➕ 字段 '{field_name}' 创建成功")
                return field_id
            else:
                print(f"    ⚠️ 字段 '{field_name}' 创建失败: {result.get('msg')}")
                return None
        except Exception as e:
            print(f"    ❌ 创建字段失败: {e}")
            return None

    def batch_create_records(self, table_id, records):
        """批量创建记录"""
        if not records:
            return True

        url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/records/batch_create"

        # 转换记录格式
        batch_records = []
        for record in records:
            fields = {}
            for key, value in record.items():
                if pd.notna(value):
                    if isinstance(value, (datetime, pd.Timestamp)):
                        # 日期转换为时间戳（毫秒）
                        fields[key] = int(pd.Timestamp(value).timestamp() * 1000)
                    elif isinstance(value, (int, float)):
                        fields[key] = value
                    else:
                        fields[key] = str(value)
            batch_records.append({"fields": fields})

        data = {"records": batch_records}

        try:
            response = requests.post(url, headers=self.headers, json=data, timeout=30)
            result = response.json()

            if result.get("code") == 0:
                return True
            else:
                print(f"    ⚠️ 导入失败: {result.get('msg')}")
                return False
        except Exception as e:
            print(f"    ❌ 批量导入失败: {e}")
            return False

    def import_to_existing_table(self, sheet_name, df, table_id, table_name):
        """导入数据到现有表格"""
        print(f"\n📋 正在导入: {sheet_name} -> {table_name}")
        print(f"  记录数: {len(df)}")

        # 获取现有字段
        existing_fields = self.get_fields(table_id)
        print(f"  现有字段数: {len(existing_fields)}")

        # 创建缺失的字段
        fields_created = 0
        for field_name in df.columns:
            if field_name not in existing_fields:
                print(f"    ➕ 创建字段: {field_name}")
                self.create_field(table_id, field_name)
                fields_created += 1
                time.sleep(0.5)  # 避免请求过快

        if fields_created > 0:
            print(f"  ✅ 新增 {fields_created} 个字段")

        # 分批导入数据（每批50条，避免过大）
        batch_size = 50
        total_records = len(df)
        total_batches = (total_records + batch_size - 1) // batch_size

        success_count = 0
        for i in range(0, total_records, batch_size):
            batch = df.iloc[i:i+batch_size]
            batch_num = i // batch_size + 1
            print(f"  📤 批次 {batch_num}/{total_batches} ({len(batch)} 条)...")

            records = batch.to_dict('records')
            if self.batch_create_records(table_id, records):
                success_count += len(batch)

            time.sleep(0.5)  # 避免请求过快

        print(f"  ✅ 成功导入 {success_count}/{total_records} 条记录")

    def run(self):
        """运行导入"""
        print("=" * 70)
        print("🚀 飞书多维表格数据导入工具")
        print("=" * 70)
        print(f"\n📋 目标表格: 三违检查记录表")
        print(f"🔑 Base Token: {BASE_TOKEN}")
        print(f"📁 数据源: {EXCEL_PATH}")
        print()

        # 步骤1: 获取访问令牌
        if not self.get_access_token():
            print("\n❌ 无法获取访问令牌，程序退出")
            return False

        # 步骤2: 获取表格列表
        tables = self.get_tables()
        if not tables:
            print("\n❌ 无法获取表格列表，程序退出")
            return False

        # 获取主表格（第一个表格）
        main_table = tables[0]
        main_table_id = main_table['table_id']
        main_table_name = main_table['name']

        print(f"\n📌 使用表格: {main_table_name}")
        print(f"   表格ID: {main_table_id}")

        # 步骤3: 读取 Excel 文件
        print("\n📖 正在读取 Excel 文件...")
        try:
            excel_file = pd.ExcelFile(EXCEL_PATH)
            print(f"✅ 成功读取 Excel 文件")
            print(f"📑 工作表: {', '.join(excel_file.sheet_names)}")
        except Exception as e:
            print(f"❌ 读取 Excel 文件失败: {e}")
            return False

        # 步骤4: 导入数据到主表格
        print("\n" + "=" * 70)
        print("📤 开始导入数据")
        print("=" * 70)

        # 选择要导入的工作表（可以修改这里选择特定的工作表）
        sheet_to_import = "三违检查记录表"

        if sheet_to_import in excel_file.sheet_names:
            df = pd.read_excel(EXCEL_PATH, sheet_name=sheet_to_import, header=0)
            self.import_to_existing_table(sheet_to_import, df, main_table_id, main_table_name)
        else:
            print(f"⚠️ 工作表 '{sheet_to_import}' 不存在")

        # 完成
        print("\n" + "=" * 70)
        print("✅ 导入完成!")
        print("=" * 70)
        print(f"\n📋 表格链接: https://vcn0vq64r47r.feishu.cn/base/{BASE_TOKEN}")
        print("\n💡 提示: 请在浏览器中刷新页面查看导入的数据")
        print()

        return True

if __name__ == "__main__":
    importer = FeishuBitableImporter()
    success = importer.run()

    if success:
        print("🎉 数据导入完成!")
    else:
        print("⚠️ 导入过程中遇到问题，请检查错误信息")
