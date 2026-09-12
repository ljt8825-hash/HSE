import pandas as pd
from datetime import datetime
from collections import defaultdict

def load_data():
    """加载数据"""
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
    
    # 获取当前日期
    now = datetime.now()
    today_date_str = now.strftime('%Y/%m/%d')
    
    # 查找当天完成的人员
    completed_creators = set()
    for idx in range(2, len(inspection_df)):
        inspection_date = str(inspection_df.iloc[idx, 3]).strip()
        if inspection_date != today_date_str:
            continue
        
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
    
    return township_to_people, completed_names

def generate_daily_report():
    """生成日报"""
    now = datetime.now()
    today_date = now.strftime('%Y年%m月%d日')
    current_time = now.strftime('%Y年%m月%d日 %H:%M')
    
    # 加载数据
    township_to_people, completed_names = load_data()
    
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
    generate_daily_report()
