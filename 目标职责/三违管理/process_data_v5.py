import pandas as pd
from datetime import datetime

# 读取乡镇人员名单
personnel_df = pd.read_excel('乡镇人员名单（微信）.xlsx')

# 构建映射关系（只包含管理员，排除乡镇主管）
name_to_wechat = {}
wechat_to_name = {}
township_to_people = {}

for idx, row in personnel_df.iterrows():
    duty = str(row.iloc[2]).strip()
    name = str(row.iloc[3]).strip()
    wechat = str(row.iloc[4]).strip()
    township = str(row.iloc[1]).strip()
    
    # 跳过乡镇主管，只保留管理员
    if '乡镇主管' in duty:
        continue
    
    if name and name != 'nan':
        if wechat and wechat != 'nan':
            name_to_wechat[name] = wechat
            wechat_to_name[wechat] = name
        
        if township and township != 'nan':
            if township not in township_to_people:
                township_to_people[township] = []
            township_to_people[township].append(name)

# 读取拍照巡检数据
inspection_df = pd.read_excel('拍照巡检 AI 识别.xlsx', header=None)

# 获取当前日期
now = datetime.now()
today_date_str = now.strftime('%Y/%m/%d')

# 查找所有创建人（所有记录，用于完成情况统计）
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

# 查找当天的"三违"行为
sanwei_records = []
for idx in range(2, len(inspection_df)):
    inspection_date = str(inspection_df.iloc[idx, 3]).strip()
    
    # 只统计当天的记录
    if inspection_date != today_date_str:
        continue
    
    creator = str(inspection_df.iloc[idx, 7]).strip()
    tuoxie = str(inspection_df.iloc[idx, 4]).strip()
    gongzhuang = str(inspection_df.iloc[idx, 5]).strip()
    toutou = str(inspection_df.iloc[idx, 6]).strip()
    
    # 检查是否有三违行为
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
    
    if has_sanwei:
        creator_name = creator
        if creator in wechat_to_name:
            creator_name = wechat_to_name[creator]
        
        sanwei_records.append({
            'creator': creator_name,
            'details': '、'.join(sanwei_details)
        })

# 获取当前日期和时间
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

# 已完成情况
report_lines.append('\n✅ 已完成巡检的乡镇：')
if completed_townships:
    for township, people in sorted(completed_townships.items()):
        if people:
            people_str = '、'.join(people)
            report_lines.append(f'{township}：{people_str}。')
else:
    report_lines.append('无')

# 未完成情况
report_lines.append('\n❌ 未完成巡检的乡镇：')
if incomplete_townships:
    for township, people in sorted(incomplete_townships.items()):
        if people:
            people_str = '、'.join(people)
            report_lines.append(f'{township}：{people_str}。')
else:
    report_lines.append('无')

# 三违行为
report_lines.append('\n⚠️ 当天"三违"行为记录：')
if sanwei_records:
    report_lines.append(f'共发现 {len(sanwei_records)} 条"三违"行为：')
    for record in sanwei_records:
        report_lines.append(f'• {record["creator"]}：{record["details"]}。')
else:
    report_lines.append('无')

# 输出报告
report = '\n'.join(report_lines)
print(report)

# 保存报告到文件
with open('统计报告_管理员_三违.txt', 'w', encoding='utf-8') as f:
    f.write(report)
print('\n\n报告已保存到：统计报告_管理员_三违.txt')
