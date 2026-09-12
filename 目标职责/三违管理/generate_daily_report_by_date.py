import pandas as pd
from datetime import datetime
import sys
from datetime import datetime

def normalize_date(date_str):
    """将日期字符串标准化，去除前导零"""
    try:
        if isinstance(date_str, str):
            # 尝试解析日期
            parts = date_str.split('/')
            if len(parts) == 3:
                year, month, day = parts
                return f"{year}/{int(month)}/{int(day)}"
        return str(date_str)
    except:
        return str(date_str)

def load_data(target_date_str=None):
    """加载数据，可指定目标日期"""
    # 读取乡镇人员名单
    personnel_df = pd.read_excel('乡镇人员名单（微信）.xlsx')
    
    # 构建映射关系
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
                if name not in township_to_people[township]:
                    township_to_people[township].append(name)
    
    # 读取拍照巡检数据
    inspection_df = pd.read_excel('拍照巡检 AI 识别.xlsx', header=None)
    
    # 获取目标日期并标准化
    if target_date_str:
        # 使用指定的日期并标准化
        today_date_str = normalize_date(target_date_str)
    else:
        # 使用当前日期并标准化
        now = datetime.now()
        today_date_str = f"{now.year}/{now.month}/{now.day}"
    
    print(f"正在查找日期: {today_date_str} 的巡检记录...")
    
    # 查找目标日期完成的人员
    completed_creators = set()
    record_count = 0
    
    for idx in range(2, len(inspection_df)):
        inspection_date = str(inspection_df.iloc[idx, 3]).strip()
        # 标准化Excel中的日期
        normalized_date = normalize_date(inspection_date)
        
        if normalized_date != today_date_str:
            continue
        
        record_count += 1
        creator = str(inspection_df.iloc[idx, 7]).strip()
        if creator and creator != 'nan':
            completed_creators.add(creator)
            print(f"找到记录: 日期={inspection_date}, 创建人={creator}")
    
    print(f"共找到 {record_count} 条记录，{len(completed_creators)} 位完成人员")
    
    # 匹配姓名
    completed_names = set()
    for creator in completed_creators:
        if creator in wechat_to_name:
            completed_names.add(wechat_to_name[creator])
        elif creator in name_to_wechat:
            completed_names.add(creator)
    
    return township_to_people, completed_names, today_date_str

def generate_daily_report(target_date_str=None, target_date_display=None):
    """生成日报，可指定目标日期"""
    now = datetime.now()
    
    # 加载数据
    township_to_people, completed_names, today_date_str = load_data(target_date_str)
    
    # 确定显示的日期
    if target_date_display:
        today_date = target_date_display
    else:
        today_date = now.strftime('%Y年%m月%d日')
    
    current_time = now.strftime('%Y年%m月%d日 %H:%M')
    
    # 分类乡镇
    completed_townships = {}
    incomplete_townships = {}
    
    for township, people in sorted(township_to_people.items()):
        if people:
            completed_people = []
            incomplete_people = []
            
            for person in people:
                if person in completed_names:
                    completed_people.append(person)
                else:
                    incomplete_people.append(person)
            
            if completed_people:
                completed_townships[township] = completed_people
            if incomplete_people:
                incomplete_townships[township] = incomplete_people
    
    # 生成报告
    report_lines = []
    report_lines.append('📊 【宁津项目"三违"管理】')
    report_lines.append(f'📅 统计周期: {today_date}')
    report_lines.append(f'🕒 生成时间: {current_time}')
    report_lines.append('')
    
    # 已完成情况
    report_lines.append('✅ 已完成巡检的乡镇：')
    if completed_townships:
        for township, people in sorted(completed_townships.items()):
            if people:
                people_str = '、'.join(people)
                report_lines.append(f'{township}：{people_str}。')
    else:
        report_lines.append('无')
    
    report_lines.append('')
    
    # 未完成情况 - 只列出完全没有完成巡检的乡镇
    report_lines.append('❌ 未完成巡检的乡镇：')
    
    # 找出完全没有完成的乡镇
    all_incomplete_townships = []
    for township in sorted(township_to_people.keys()):
        if township not in completed_townships:
            # 这个乡镇没有任何人完成巡检
            all_incomplete_townships.append(township)
    
    if all_incomplete_townships:
        # 显示完全没有完成的乡镇
        for township in all_incomplete_townships:
            people = township_to_people.get(township, [])
            people_str = '、'.join(people)
            report_lines.append(f'{township}：{people_str}。')
    else:
        # 所有乡镇都有人完成了至少一次巡检
        report_lines.append('无')
    
    report_lines.append('')
    
    # 扣分情况（暂无数据，固定为无）
    report_lines.append('📉 扣分情况：')
    report_lines.append('无')
    
    report_lines.append('')
    
    # 三违行为（暂无数据，固定为无）
    report_lines.append('⚠️ 当天"三违"行为记录：')
    report_lines.append('无')
    
    report_lines.append('')
    report_lines.append('@所有人')
    
    # 输出报告
    report = '\n'.join(report_lines)
    print(report)
    
    # 保存报告
    filename = f'日报_{today_date}.txt'
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f'\n✅ 日报已保存到：{filename}')
    return report

if __name__ == "__main__":
    # 支持命令行参数指定日期
    # 格式: python generate_daily_report_by_date.py 2026/6/6
    if len(sys.argv) > 1:
        target_date = sys.argv[1]
        # 转换为显示格式
        try:
            dt = datetime.strptime(target_date, '%Y/%m/%d')
            target_display = dt.strftime('%Y年%m月%d日')
            generate_daily_report(target_date, target_display)
        except:
            try:
                # 尝试另一种格式
                dt = datetime.strptime(target_date, '%Y/%m/d')
                target_display = dt.strftime('%Y年%m月%d日')
                generate_daily_report(target_date, target_display)
            except:
                print("日期格式错误，请使用 YYYY/M/D 格式")
                print("例如: python generate_daily_report_by_date.py 2026/6/6")
    else:
        # 使用当前日期
        generate_daily_report()
