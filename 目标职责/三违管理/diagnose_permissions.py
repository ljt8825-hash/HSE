"""
飞书 API 权限诊断工具
"""
import requests
import json
import os

# 配置（凭据改从环境变量读取，避免明文入库）
BASE_URL = "https://open.feishu.cn/open-apis"
APP_ID = os.getenv("FEISHU_APP_ID", "")
APP_SECRET = os.getenv("FEISHU_APP_SECRET", "")
BASE_TOKEN = os.getenv("FEISHU_BASE_TOKEN", "")

def get_token_info():
    """获取 token 信息"""
    print("\n=== 诊断 1: 获取 Token ===")
    url = f"{BASE_URL}/auth/v3/tenant_access_token/internal"
    headers = {"Content-Type": "application/json"}
    data = {
        "app_id": APP_ID,
        "app_secret": APP_SECRET
    }

    response = requests.post(url, headers=headers, json=data)
    result = response.json()

    if result.get("code") == 0:
        token = result.get("tenant_access_token")
        print(f"✅ Token 获取成功")
        print(f"Token: {token[:20]}...")
        return token
    else:
        print(f"❌ Token 获取失败: {result}")
        return None

def check_app_info(token):
    """检查应用信息"""
    print("\n=== 诊断 2: 检查应用信息 ===")
    url = f"{BASE_URL}/application/v6/applications/{APP_ID}"
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(url, headers=headers)
    result = response.json()

    if result.get("code") == 0:
        app = result.get("data", {}).get("app", {})
        print(f"✅ 应用信息:")
        print(f"  应用名称: {app.get('app_name')}")
        print(f"  版本: {app.get('version')}")
        return True
    else:
        print(f"❌ 应用信息获取失败: {result}")
        return False

def check_bitable_access(token):
    """检查多维表格访问权限"""
    print("\n=== 诊断 3: 检查多维表格访问权限 ===")

    # 测试1: 获取表格列表
    print("\n测试 3.1: 获取表格列表")
    url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables"
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(url, headers=headers)
    result = response.json()

    if result.get("code") == 0:
        print(f"✅ 表格列表获取成功")
        print(f"  表格数量: {len(result.get('data', {}).get('items', []))}")
    else:
        print(f"❌ 表格列表获取失败")
        print(f"  错误码: {result.get('code')}")
        print(f"  错误信息: {result.get('msg')}")
        print(f"  详细: {result}")

    # 测试2: 获取字段
    print("\n测试 3.2: 获取字段")
    table_id = "tbltaZKtUh2SREIm"
    url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/fields"
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(url, headers=headers)
    result = response.json()

    if result.get("code") == 0:
        print(f"✅ 字段获取成功")
        fields = result.get('data', {}).get('items', [])
        print(f"  字段数量: {len(fields)}")
        for field in fields[:5]:
            print(f"    - {field.get('field_name')} ({field.get('type')})")
    else:
        print(f"❌ 字段获取失败")
        print(f"  错误码: {result.get('code')}")
        print(f"  错误信息: {result.get('msg')}")

    # 测试3: 创建字段
    print("\n测试 3.3: 创建字段")
    url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/fields"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "field_name": "测试字段",
        "type": 1  # 文本类型
    }

    response = requests.post(url, headers=headers, json=data)
    result = response.json()

    if result.get("code") == 0:
        print(f"✅ 字段创建成功")
    else:
        print(f"❌ 字段创建失败")
        print(f"  错误码: {result.get('code')}")
        print(f"  错误信息: {result.get('msg')}")
        print(f"  详细: {json.dumps(result, ensure_ascii=False)}")

    # 测试4: 创建记录
    print("\n测试 3.4: 创建记录")
    url = f"{BASE_URL}/bitable/v1/apps/{BASE_TOKEN}/tables/{table_id}/records"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "fields": {
            "多行文本": "测试数据"
        }
    }

    response = requests.post(url, headers=headers, json=data)
    result = response.json()

    if result.get("code") == 0:
        print(f"✅ 记录创建成功")
    else:
        print(f"❌ 记录创建失败")
        print(f"  错误码: {result.get('code')}")
        print(f"  错误信息: {result.get('msg')}")
        print(f"  详细: {json.dumps(result, ensure_ascii=False)}")

def check_permissions():
    """检查应用权限列表"""
    print("\n=== 诊断 4: 检查应用权限（需手动） ===")
    print("请访问以下链接查看应用权限配置：")
    print(f"  https://open.feishu.cn/app/{APP_ID}/permission/overview")
    print("\n需要检查的权限：")
    print("  - bitable:app")
    print("  - bitable:record")
    print("  - bitable:field")
    print("  - bitable:app:readonly")
    print("  - bitable:record:readonly")

def main():
    print("=" * 70)
    print("🔍 飞书 API 权限诊断工具")
    print("=" * 70)

    # 获取 token
    token = get_token_info()
    if not token:
        print("\n❌ 无法获取 token，诊断终止")
        return

    # 检查应用信息
    check_app_info(token)

    # 检查多维表格权限
    check_bitable_access(token)

    # 权限检查说明
    check_permissions()

    # 总结
    print("\n" + "=" * 70)
    print("📋 诊断总结")
    print("=" * 70)
    print("\n常见问题及解决方案：")
    print("\n1. 错误码 91402 (NOTEXIST)")
    print("   原因: 没有访问该多维表格的权限")
    print("   解决: 在飞书开放平台添加 bitable:app 权限并发布")

    print("\n2. Forbidden 错误")
    print("   原因: 应用没有相关操作的权限")
    print("   解决: 在'权限管理'中添加相应权限并发布新版本")

    print("\n3. Token 过期")
    print("   原因: tenant_access_token 已过期")
    print("   解决: 重新获取 token（当前代码会自动处理）")

    print("\n4. 权限未生效")
    print("   原因: 权限配置后需要发布新版本")
    print("   解决: 在'版本管理与发布'中发布新版本")

if __name__ == "__main__":
    main()
