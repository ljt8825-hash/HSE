import pandas as pd
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, ".."))

def read_excel_structure():
    """读取 Excel 文件结构"""
    excel_path = os.path.join(PROJECT_ROOT, "数据源", "07_三违管理", "宁津项目三违检查清单.xlsx")

    try:
        # 读取所有工作表
        excel_file = pd.ExcelFile(excel_path)
        print("=" * 60)
        print("📊 Excel 文件结构分析")
        print("=" * 60)
        print(f"\n📁 文件路径: {excel_path}")
        print(f"📋 工作表数量: {len(excel_file.sheet_names)}")
        print(f"\n📑 工作表列表:")
        for i, sheet_name in enumerate(excel_file.sheet_names, 1):
            print(f"  {i}. {sheet_name}")

        # 读取每个工作表的内容
        for sheet_name in excel_file.sheet_names:
            print(f"\n{'=' * 60}")
            print(f"📋 工作表: {sheet_name}")
            print("=" * 60)

            df = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
            print(f"总行数: {len(df)}")
            print(f"总列数: {len(df.columns)}")

            # 显示前10行
            print(f"\n前10行数据预览:")
            print("-" * 60)
            for idx in range(min(10, len(df))):
                row_data = []
                for col_idx in range(min(5, len(df.columns))):
                    value = df.iloc[idx, col_idx]
                    value_str = str(value) if pd.notna(value) else ""
                    row_data.append(value_str[:30])  # 限制每列长度
                print(f"行{idx}: {' | '.join(row_data)}")

        print("\n" + "=" * 60)
        print("✅ 结构读取完成")
        print("=" * 60)

    except Exception as e:
        print(f"❌ 读取失败: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    read_excel_structure()
