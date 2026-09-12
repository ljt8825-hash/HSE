import pandas as pd

print("=== 乡镇人员名单（微信）.xlsx ===")
try:
    df1 = pd.read_excel('乡镇人员名单（微信）.xlsx')
    print(f"形状: {df1.shape}")
    print("\n列名:")
    for i, col in enumerate(df1.columns):
        print(f"  {i}: {col}")
    print("\n前10行数据:")
    print(df1.head(10).to_string())
except Exception as e:
    print(f"读取失败: {e}")

print("\n" + "="*80 + "\n")

print("=== 拍照巡检 AI 识别.xlsx ===")
try:
    df2 = pd.read_excel('拍照巡检 AI 识别.xlsx', header=None)
    print(f"形状: {df2.shape}")
    print("\n前20行数据:")
    for i in range(min(20, len(df2))):
        print(f"行{i}: {df2.iloc[i].tolist()}")
except Exception as e:
    print(f"读取失败: {e}")
