import pandas as pd
from datetime import datetime
import subprocess
import json
import os

def run_lark_cli_command(command):
    """执行 lark-cli 命令"""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            encoding='utf-8'
        )
        if result.returncode == 0:
            return True, result.stdout
        else:
            return False, result.stderr
    except Exception as e:
        return False, str(e)

def import_excel_to_feishu(excel_path, base_name=None):
    """将 Excel 文件导入到飞书多维表格"""
    if base_name is None:
        base_name = os.path.splitext(os.path.basename(excel_path))[0]
    
    print(f"正在导入 {excel_path} 到飞书多维表格...")
    
    # 使用 lark-cli 导入
    command = f'lark-cli drive +import --type bitable --file "{excel_path}" --title "{base_name}"'
    success, output = run_lark_cli_command(command)
    
    if success:
        print(f"✅ {excel_path} 导入成功！")
        print(output)
        return True
    else:
        print(f"❌ {excel_path} 导入失败：")
        print(output)
        return False

def sync_inspection_data(base_token, table_name, excel_path):
    """同步巡检数据到飞书多维表格"""
    print(f"正在读取 {excel_path}...")
    df = pd.read_excel(excel_path, header=None)
    
    # 这里需要根据实际表格结构调整
    # 先获取表结构
    print(f"正在获取表 {table_name} 的结构...")
    
    # 获取字段列表
    get_fields_cmd = f'lark-cli base +field-list --base-token {base_token} --table-name "{table_name}"'
    success, fields_output = run_lark_cli_command(get_fields_cmd)
    
    if not success:
        print("获取表结构失败，请先导入表或检查表名")
        return False
    
    # 准备数据并同步
    # 这里需要根据实际字段结构来映射数据
    print("数据同步准备完成")
    return True

def generate_and_sync_report():
    """生成报告并同步到飞书"""
    # 先生成本地报告
    print("正在生成本地报告...")
    
    # 读取人员名单
    personnel_df = pd.read_excel('乡镇人员名单（微信）.xlsx')
    name_to_wechat = {}
    wechat_to_name = {}
    township_to_people = {}
    
    for idx, row in personnel_df.iterrows():
        name = str(row.iloc[3]).strip()
        wechat = str(row.iloc[4]).strip()
        township = str(row.iloc[1]).strip()
        
        if name and name != 'nan':
            if wechat and wechat != 'nan':
                name_to_wechat[name] = wechat
                wechat_to_name[wechat] = name
            if township and township != 'nan':
                if township not in township_to_people:
                    township_to_people[township] = []
                township_to_people[township].append(name)
    
    # 读取巡检数据
    inspection_df = pd.read_excel('拍照巡检 AI 识别.xlsx', header=None)
    
    # 获取完成人员
    completed_creators = set()
    for idx in range(2, len(inspection_df)):
        creator = str(inspection_df.iloc[idx, 7]).strip()
        if creator and creator != 'nan':
            completed_creators.add(creator)
    
    # 匹配姓名
    completed_names = set()
    for creator in completed_creators:
        if creator in wechat_to_name:
            completed_names.add(wechat_to_name[creator])
        elif creator in name_to_wechat:
            completed_names.add(creator)
    
    # 生成报告
    now = datetime.now()
    today_date = now.strftime('%Y年%m月%d日')
    current_time = now.strftime('%Y年%m月%d日 %H:%M')
    
    report_lines = []
    report_lines.append('📊 【宁津项目"三违"管理】')
    report_lines.append(f'📅 统计周期：{today_date}')
    report_lines.append(f'🕒 生成时间：{current_time}')
    report_lines.append('一、各乡镇完成情况')
    
    for township, people in sorted(township_to_people.items()):
        if people:
            person_status_list = []
            for person in people:
                if person in completed_names:
                    person_status_list.append(f'{person}完成')
                else:
                    person_status_list.append(f'{person}未完成')
            
            status_str = '；'.join(person_status_list)
            report_lines.append(f'{township}：{status_str}。')
    
    report = '\n'.join(report_lines)
    print(report)
    
    # 保存到本地
    with open('统计报告_乡镇完成情况.txt', 'w', encoding='utf-8') as f:
        f.write(report)
    
    print("\n✅ 报告已保存到：统计报告_乡镇完成情况.txt")
    return report

def main():
    """主函数"""
    print("="*50)
    print("飞书多维表格同步工具")
    print("="*50)
    print()
    
    # 先生成报告
    report = generate_and_sync_report()
    
    print("\n" + "="*50)
    print("下一步操作：")
    print("1. 首先确保飞书 CLI 已配置（运行 lark-cli config init --new）")
    print("2. 授权多维表格访问（运行 lark-cli auth login --domain base）")
    print("3. 将 Excel 导入到飞书（运行 lark-cli drive +import --type bitable --file \"文件名.xlsx\"）")
    print("4. 然后使用此脚本进行日常同步")
    print("="*50)

if __name__ == "__main__":
    main()
