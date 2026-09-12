"""
飞书多维表格自动导入工具
将本地 Excel 数据自动同步到飞书多维表格
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
EXCEL_PATH = os.path.join(PROJECT_ROOT, "数据源", "07_三违管理", "宁津项目三违检查清单.xlsx")

# 配置（凭据改从环境变量读取，避免明文入库）
BASE_URL = "https://open.feishu.cn/open-apis"
APP_ID = os.getenv("FEISHU_APP_ID", "")
APP_SECRET = os.getenv("FEISHU_APP_SECRET", "")
BASE_TOKEN = os.getenv("FEISHU_BASE_TOKEN", "")

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

    def get_or_create_table(self, table_name):
        """获取或创建表格"""
        print(f"\n📊 正在处理表格: {table_name}")

        # 获取现有表格列表
        url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables"
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            result = response.json()

            if result.get("code") == 0:
                tables = result.get("data", {}).get("items", [])

                # 查找是否存在同名表格
                for table in tables:
                    if table["name"] == table_name:
                        print(f"  ✅ 找到已存在的表格: {table_name} (ID: {table['table_id']})")
                        return table["table_id"]

                # 创建新表格
                print(f"  ➕ 创建新表格: {table_name}")
                create_url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables"
                create_data = {"table": {"name": table_name}}

                response = requests.post(create_url, headers=self.headers, json=create_data, timeout=10)
                result = response.json()

                if result.get("code") == 0:
                    table_id = result.get("data", {}).get("table_id")
                    print(f"  ✅ 表格创建成功 (ID: {table_id})")
                    return table_id
                else:
                    print(f"  ❌ 表格创建失败: {result.get('msg')}")
                    return None
        except Exception as e:
            print(f"  ❌ 错误: {e}")
            return None

    def get_fields(self, table_id):
        """获取表格字段"""
        url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/fields"
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            result = response.json()

            if result.get("code") == 0:
                fields = result.get("data", {}).get("items", [])
                return {f["field_name"]: f["field_id"] for f in fields}
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
                return result.get("data", {}).get("field", {}).get("field_id")
            return None
        except:
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
                        # 日期转换为时间戳
                        fields[key] = int(pd.Timestamp(value).timestamp() * 1000)
                    else:
                        fields[key] = value
            batch_records.append({"fields": fields})

        data = {"records": batch_records}

        try:
            response = requests.post(url, headers=self.headers, json=data, timeout=30)
            result = response.json()

            if result.get("code") == 0:
                print(f"    ✅ 成功导入 {len(records)} 条记录")
                return True
            else:
                print(f"    ⚠️ 部分导入失败: {result.get('msg')}")
                return False
        except Exception as e:
            print(f"    ❌ 导入失败: {e}")
            return False

    def import_sheet(self, sheet_name, df, table_id):
        """导入单个工作表"""
        print(f"\n📋 正在导入工作表: {sheet_name}")
        print(f"  记录数: {len(df)}")
        print(f"  字段数: {len(df.columns)}")

        # 获取现有字段
        existing_fields = self.get_fields(table_id)

        # 获取字段列表
        fields = list(df.columns)

        # 创建缺失的字段
        for field_name in fields:
            if field_name not in existing_fields:
                print(f"  ➕ 创建字段: {field_name}")
                self.create_field(table_id, field_name)
                time.sleep(0.3)  # 避免请求过快

        # 分批导入数据（每批100条）
        batch_size = 100
        total_batches = (len(df) + batch_size - 1) // batch_size

        for i in range(0, len(df), batch_size):
            batch = df.iloc[i:i+batch_size]
            batch_num = i // batch_size + 1
            print(f"  📤 导入批次 {batch_num}/{total_batches} ({len(batch)} 条)...")

            records = batch.to_dict('records')
            self.batch_create_records(table_id, records)
            time.sleep(0.5)  # 避免请求过快

        print(f"  ✅ {sheet_name} 导入完成")

    def run(self):
        """运行导入"""
        print("=" * 70)
        print("🚀 飞书多维表格自动导入工具")
        print("=" * 70)
        print(f"\n📋 目标表格: 三违检查记录表")
        print(f"🔑 Base Token: {BASE_TOKEN}")
        print(f"📁 数据源: {EXCEL_PATH}")
        print()

        # 步骤1: 获取访问令牌
        if not self.get_access_token():
            print("\n❌ 无法获取访问令牌，程序退出")
            return False

        # 步骤2: 读取 Excel 文件
        print("\n📖 正在读取 Excel 文件...")
        try:
            excel_file = pd.ExcelFile(EXCEL_PATH)
            print(f"✅ 成功读取 Excel 文件")
            print(f"📑 工作表: {', '.join(excel_file.sheet_names)}")
        except Exception as e:
            print(f"❌ 读取 Excel 文件失败: {e}")
            return False

        # 步骤3: 导入每个工作表
        print("\n" + "=" * 70)
        print("📤 开始导入数据")
        print("=" * 70)

        success_count = 0
        for sheet_name in excel_file.sheet_names:
            # 获取或创建表格
            table_id = self.get_or_create_table(sheet_name)
            if not table_id:
                print(f"⚠️ 跳过工作表: {sheet_name}")
                continue

            # 读取数据
            df = pd.read_excel(EXCEL_PATH, sheet_name=sheet_name, header=0)

            # 导入数据
            self.import_sheet(sheet_name, df, table_id)
            success_count += 1

            time.sleep(1)  # 表格之间暂停

        # 完成
        print("\n" + "=" * 70)
        print("✅ 导入完成!")
        print("=" * 70)
        print(f"\n📊 导入统计:")
        print(f"  ✅ 成功导入: {success_count} 个工作表")
        print(f"  📋 表格链接: https://vcn0vq64r47r.feishu.cn/base/{BASE_TOKEN}")
        print()

        return True

if __name__ == "__main__":
    importer = FeishuBitableImporter()
    success = importer.run()

    if success:
        print("🎉 所有数据已成功导入到飞书!")
    else:
        print("⚠️ 导入过程中遇到了一些问题，请检查上面的错误信息")
