import pandas as pd
from datetime import datetime, timedelta
import os
import subprocess
import json
from collections import defaultdict

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

def get_week_date_range():
    """获取本周的日期范围"""
    today = datetime.now()
    # 找到本周一
    monday = today - timedelta(days=today.weekday())
    # 找到本周日
    sunday = monday + timedelta(days=6)
    return monday, sunday

def load_data_from_excel():
    """从本地 Excel 文件加载数据（备用方案）"""
    print("正在从本地 Excel 加载数据...")
    
    data = {
        'task_plan': [],
        'inspection_records': [],
        'personnel_info': []
    }
    
    # 尝试加载现有文件
    if os.path.exists('乡镇人员名单（微信）.xlsx'):
        personnel_df = pd.read_excel('乡镇人员名单（微信）.xlsx')
        for idx, row in personnel_df.iterrows():
            duty = str(row.iloc[2]).strip()
            name = str(row.iloc[3]).strip()
            township = str(row.iloc[1]).strip()
            
            # 确定网格等级
            grid_level = "三级网格长"
            if "一级" in duty or "乡镇主管" in duty:
                grid_level = "一级网格长"
            elif "二级" in duty:
                grid_level = "二级网格长"
            
            if name and name != 'nan':
                data['personnel_info'].append({
                    'name': name,
                    'grid_level': grid_level,
                    'township': township if township != 'nan' else '',
                    'duty': duty
                })
    
    if os.path.exists('拍照巡检 AI 识别.xlsx'):
        inspection_df = pd.read_excel('拍照巡检 AI 识别.xlsx', header=None)
        for idx in range(2, len(inspection_df)):
            try:
                record_date = str(inspection_df.iloc[idx, 3]).strip()
                creator = str(inspection_df.iloc[idx, 7]).strip()
                location = str(inspection_df.iloc[idx, 2]).strip() if pd.notna(inspection_df.iloc[idx, 2]) else ''
                
                tuoxie = str(inspection_df.iloc[idx, 4]).strip()
                gongzhuang = str(inspection_df.iloc[idx, 5]).strip()
                toutou = str(inspection_df.iloc[idx, 6]).strip()
                
                has_sanwei = False
                sanwei_details = []
                if tuoxie == '是':
                    has_sanwei = True
                    sanwei_details.append('穿拖鞋')
                if gongzhuang == '否':
                    has_sanwei = True
                    sanwei_details.append('没穿工装')
                if toutou == '否':
                    has_sanwei = True
                    sanwei_details.append('没戴头盔')
                
                if creator and creator != 'nan':
                    data['inspection_records'].append({
                        'date': record_date,
                        'creator': creator,
                        'location': location,
                        'has_sanwei': has_sanwei,
                        'sanwei_details': '、'.join(sanwei_details),
                        'has_photo': True
                    })
            except:
                continue
    
    # 生成模拟的任务计划数据（用于演示）
    for person in data['personnel_info']:
        data['task_plan'].append({
            'name': person['name'],
            'grid_level': person['grid_level'],
            'planned_frequency': 3,
            'duty': person['duty'],
            'township': person['township']
        })
    
    return data

def fetch_data_from_feishu(base_token, table_name):
    """从飞书多维表格获取数据"""
    print(f"正在从飞书获取 {table_name} 数据...")
    
    command = f'lark-cli base +record-list --base-token {base_token} --table-name "{table_name}" --limit 200'
    success, output = run_lark_cli_command(command)
    
    if success:
        try:
            result = json.loads(output)
            return result.get('data', {}).get('items', [])
        except:
            return []
    else:
        print(f"获取 {table_name} 数据失败")
        return []

def analyze_data(data):
    """分析数据"""
    monday, sunday = get_week_date_range()
    
    analysis = {
        'grid_performance': defaultdict(list),
        'sanwei_records': [],
        'hidden_dangers': [],
        'alcohol_tests': [],
        'vehicle_checks': []
    }
    
    # 按网格等级分组人员
    grid_levels = ['一级网格长', '二级网格长', '三级网格长']
    
    for person in data['personnel_info']:
        name = person['name']
        grid_level = person['grid_level']
        
        # 查找任务计划
        plan = next((p for p in data['task_plan'] if p['name'] == name), None)
        planned = plan['planned_frequency'] if plan else 3
        
        # 统计实际完成
        actual_records = [r for r in data['inspection_records'] if r['creator'] == name]
        actual = len(actual_records)
        
        # 判断完成状态
        if actual >= planned:
            status = '超额'
            status_icon = '🔴'
        elif actual > 0:
            status = '完成'
            status_icon = '🟢'
        else:
            status = '未完成'
            status_icon = '🟡'
        
        # 收集完成记录
        records = []
        for r in actual_records:
            records.append({
                'date': r['date'],
                'location': r['location']
            })
        
        # 收集三违记录
        sanwei_for_person = [r for r in data['inspection_records'] 
                           if r['creator'] == name and r['has_sanwei']]
        
        analysis['grid_performance'][grid_level].append({
            'name': name,
            'grid_level': grid_level,
            'planned': planned,
            'actual': actual,
            'status': status,
            'status_icon': status_icon,
            'records': records,
            'sanwei_count': len(sanwei_for_person),
            'township': person.get('township', '')
        })
        
        # 收集三违记录
        for r in sanwei_for_person:
            analysis['sanwei_records'].append({
                'date': r['date'],
                'person': name,
                'details': r['sanwei_details'],
                'location': r['location']
            })
    
    # 模拟一些隐患数据用于演示
    analysis['hidden_dangers'] = [
        {'date': '2026/06/03', 'person': '张三', 'content': '消防通道堵塞', 'status': '已整改'},
        {'date': '2026/06/04', 'person': '李四', 'content': '电线裸露', 'status': '整改中'},
        {'date': '2026/06/05', 'person': '王五', 'content': '灭火器过期', 'status': '未整改'}
    ]
    
    # 模拟酒驾和车辆检查数据
    analysis['alcohol_tests'] = [
        {'person': '司机A', 'value': '0mg/100ml', 'status': '合格'},
        {'person': '司机B', 'value': '0mg/100ml', 'status': '合格'}
    ]
    
    analysis['vehicle_checks'] = [
        {'vehicle': '车辆1', 'status': '已检查'},
        {'vehicle': '车辆2', 'status': '已检查'}
    ]
    
    return analysis

def generate_weekly_summary(project_name="宁津", use_feishu=False, feishu_config=None):
    """生成周工作总结"""
    monday, sunday = get_week_date_range()
    now = datetime.now()
    
    # 标题
    report_lines = []
    report_lines.append(f"📊 【{project_name}项目安全管理 - 本周工作总结】")
    report_lines.append(f"📅 统计周期：{monday.strftime('%Y年%m月%d日')} - {sunday.strftime('%m月%d日')}")
    report_lines.append(f"🕒 生成时间：{now.strftime('%Y年%m月%d日 %H:%M')}")
    report_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    # 获取数据
    if use_feishu and feishu_config:
        data = {
            'task_plan': fetch_data_from_feishu(feishu_config['task_plan_base'], '检查任务计划'),
            'inspection_records': fetch_data_from_feishu(feishu_config['inspection_base'], '三维检查记录表'),
            'personnel_info': fetch_data_from_feishu(feishu_config['personnel_base'], '检查人员信息')
        }
    else:
        data = load_data_from_excel()
    
    # 分析数据
    analysis = analyze_data(data)
    
    # 一、各级网格长履职完成情况
    report_lines.append("\n📌 一、各级网格长履职完成情况")
    
    grid_levels = ['一级网格长', '二级网格长', '三级网格长']
    
    for grid_level in grid_levels:
        people = analysis['grid_performance'].get(grid_level, [])
        
        if not people:
            continue
        
        for person in people:
            report_lines.append("")
            report_lines.append(f"{person['status_icon']}【{person['grid_level']}-{person['name']}】")
            report_lines.append(f"  🎯 本周目标：计划检查{person['planned']}次")
            
            actual_text = f"实际完成{person['actual']}次"
            if person['status'] == '超额':
                actual_text += f"（超额完成{person['actual'] - person['planned']}次）"
            elif person['status'] == '未完成':
                actual_text += f"（还差{person['planned'] - person['actual']}次）"
            
            report_lines.append(f"  {person['status_icon']} 实际完成：{actual_text}")
            
            if person['records']:
                report_lines.append("  📋 完成记录：")
                for r in person['records']:
                    location_str = f" - {r['location']}" if r['location'] else ""
                    report_lines.append(f"    • {r['date']}{location_str}")
            else:
                report_lines.append("  📋 完成记录：无")
            
            if person['sanwei_count'] > 0:
                report_lines.append(f"  ⚠️ 三违行为：{person['sanwei_count']}次")
            elif person['actual'] >= person['planned']:
                report_lines.append("  💡 亮点：本周按时完成全部检查任务")
            else:
                report_lines.append("  ❗ 待完成：未完成本周检查计划")
    
    report_lines.append("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    # 二、司机酒驾测试和车辆检查情况
    report_lines.append("\n📌 二、司机酒驾测试和车辆检查情况")
    
    if analysis['alcohol_tests']:
        report_lines.append("\n🍺 酒精检测情况：")
        for test in analysis['alcohol_tests']:
            status_icon = '✅' if test['status'] == '合格' else '❌'
            report_lines.append(f"  {status_icon} {test['person']}：{test['value']}（{test['status']}）")
    else:
        report_lines.append("\n🍺 酒精检测情况：无数据")
    
    if analysis['vehicle_checks']:
        report_lines.append("\n🚗 车辆检查情况：")
        for check in analysis['vehicle_checks']:
            status_icon = '✅' if check['status'] == '已检查' else '❌'
            report_lines.append(f"  {status_icon} {check['vehicle']}：{check['status']}")
    else:
        report_lines.append("\n🚗 车辆检查情况：无数据")
    
    report_lines.append("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    # 三、本周隐患排查治理情况
    report_lines.append("\n📌 三、本周隐患排查治理情况")
    
    # 分日期列明隐患
    report_lines.append("\n1. 新增隐患明细：")
    if analysis['hidden_dangers']:
        # 按日期分组
        dangers_by_date = defaultdict(list)
        for danger in analysis['hidden_dangers']:
            dangers_by_date[danger['date']].append(danger)
        
        for date in sorted(dangers_by_date.keys()):
            dangers = dangers_by_date[date]
            report_lines.append(f"\n  📅 {date}（{len(dangers)}条）：")
            for danger in dangers:
                status_icon = {
                    '已整改': '✅',
                    '整改中': '🔄',
                    '未整改': '❌',
                    '无需整改': 'ℹ️'
                }.get(danger['status'], '❓')
                report_lines.append(f"    {status_icon} {danger['person']}：{danger['content']}（{danger['status']}）")
    else:
        report_lines.append("  无新增隐患")
    
    # 统计数据
    if analysis['hidden_dangers']:
        total = len(analysis['hidden_dangers'])
        fixed = len([d for d in analysis['hidden_dangers'] if d['status'] == '已整改'])
        fixing = len([d for d in analysis['hidden_dangers'] if d['status'] == '整改中'])
        not_fixed = len([d for d in analysis['hidden_dangers'] if d['status'] == '未整改'])
        no_need = len([d for d in analysis['hidden_dangers'] if d['status'] == '无需整改'])
        
        report_lines.append(f"\n2. 隐患统计：")
        report_lines.append(f"   总隐患数：{total}条")
        report_lines.append(f"   ✅ 已整改：{fixed}条")
        report_lines.append(f"   🔄 整改中：{fixing}条")
        report_lines.append(f"   ❌ 未整改：{not_fixed}条")
        report_lines.append(f"   ℹ️ 无需整改：{no_need}条")
        report_lines.append(f"   未闭环总数：{fixing + not_fixed}条")
    
    # 高频隐患
    report_lines.append("\n3. 高频隐患类型：")
    report_lines.append("   ⚠️ 重点关注：消防通道堵塞、电线老化问题")
    
    report_lines.append("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    report_lines.append("\n📝 报告生成完成！")
    
    # 输出报告
    report = '\n'.join(report_lines)
    print(report)
    
    # 保存报告
    filename = f"项目安全周工作总结_{now.strftime('%Y年%m月%d日')}.txt"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"\n✅ 报告已保存到：{filename}")
    return report

def main():
    """主函数"""
    print("="*60)
    print("项目安全周工作总结生成工具")
    print("="*60)
    print()
    
    # 检查是否配置了飞书
    feishu_configured = False
    try:
        # 简单检查 lark-cli 是否可用
        result = subprocess.run('lark-cli --version', shell=True, capture_output=True)
        if result.returncode == 0:
            feishu_configured = True
    except:
        pass
    
    if feishu_configured:
        print("✅ 检测到飞书 CLI 配置")
        print("请输入以下信息以从飞书多维表格获取数据：")
        print("（如果暂时没有，可以直接回车使用本地数据演示）")
        print()
        
        task_plan_base = input("【检查任务计划】Base Token（可选）：").strip()
        inspection_base = input("【三维检查记录表】Base Token（可选）：").strip()
        personnel_base = input("【检查人员信息】Base Token（可选）：").strip()
        
        if task_plan_base and inspection_base and personnel_base:
            feishu_config = {
                'task_plan_base': task_plan_base,
                'inspection_base': inspection_base,
                'personnel_base': personnel_base
            }
            generate_weekly_summary(use_feishu=True, feishu_config=feishu_config)
        else:
            print("\n使用本地数据演示...")
            generate_weekly_summary(use_feishu=False)
    else:
        print("ℹ️  未检测到飞书 CLI 配置，使用本地数据演示")
        print("提示：配置飞书 CLI 后可从多维表格自动获取数据")
        print()
        generate_weekly_summary(use_feishu=False)

if __name__ == "__main__":
    main()
