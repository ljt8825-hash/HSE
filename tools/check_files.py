# -*- coding: utf-8 -*-
import os

files = [
    r'c:\Users\honey\.trae-cn\attachments\6a451e58b10e4ff55c5c3152\ff3e1629-a2c8-49f5-97f8-5c243f0ce4c3_员工信息维护_20260625140249(3).xlsx',
    r'c:\Users\honey\.trae-cn\attachments\6a451e58b10e4ff55c5c3152\497d72e6-d8f5-4bc9-99ed-8ff2ca2af64f_工伤险分配表.xls',
    r'c:\Users\honey\.trae-cn\attachments\6a451e58b10e4ff55c5c3152\55676d00-4db9-41fb-8d4d-771ce66501d9_最新雇员清单.xlsx',
    r'c:\Users\honey\.trae-cn\attachments\6a451e58b10e4ff55c5c3152\8c711e15-2389-487c-8b02-1f7c6768014d_11月份公益岗工资表.xlsx'
]

for f in files:
    if os.path.exists(f):
        print(f'{os.path.basename(f)}: size={os.path.getsize(f)} bytes')
        # 检查文件头
        with open(f, 'rb') as file:
            header = file.read(20)
            print(f'  Header: {header[:20]}')
    else:
        print(f'NOT FOUND: {f}')