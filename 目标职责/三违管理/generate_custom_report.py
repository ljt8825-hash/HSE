import pandas as pd
from datetime import datetime

# 读取乡镇人员名单
personnel_df = pd.read_excel('乡镇人员名单（微信）.xlsx')

# 构建映射关系（包含所有人员，不排除乡镇主管）
name_to_wechat = {}
wechat_to_name = {}
township_to_people = {}

for idx, row in personnel_df.iterrows():
    duty = str(row.iloc[2]).strip()
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

# 获取当前日期和时间
today_date = now.strftime('%Y年%m月%d日')
current_time = now.strftime('%Y年%m月%d日 %H:%M')

# 生成报告
report_lines = []
report_lines.append('📊 【宁津项目"三违"管理】')
report_lines.append(f'📅 统计周期：{today_date}')
report_lines.append(f'🕒 生成时间：{current_time}')
report_lines.append('一、各乡镇完成情况')

# 按要求格式输出每个乡镇的完成情况
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

# 输出报告
report = '\n'.join(report_lines)
print(report)

# 保存报告到文件
with open('统计报告_乡镇完成情况.txt', 'w', encoding='utf-8') as f:
    f.write(report)
print('\n\n报告已保存到：统计报告_乡镇完成情况.txt')
