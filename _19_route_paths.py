import re, glob

targets = {
 'objectives/responsibility/index':'目标责任书','objectives/budget/index':'安全费用预算',
 'regulations/index':'规章制度','risk-control/index':'风险清单','site/fire-facility/index':'消防设施',
 'site/grid/index':'网格管理','site/violation/index':'三违管理','hse/employee/index':'员工列表',
 'hse/employee/positions':'岗位管理','hse/employee-profile/index':'员工档案',
 'hse/employee-import-v2/index':'花名册导入','hse/employee/departments':'组织管理',
 'hse/employee/over-age/index':'超龄人员','training/certificates/index':'证书管理',
 'training/plans/index':'培训计划','emergency/drills/index':'应急演练',
 'hse/todos/plan/index':'考核计划版本','training/ledger/index':'培训记录',
 'objectives/committee/index':'安委会',
}
pat_comp = re.compile(r"import\(['\"]#/views/([^'\"]+?)\.vue['\"]\)")
pat_path = re.compile(r"path:\s*['\"]([^'\"]+)['\"]")
pat_name = re.compile(r"name:\s*['\"]([^'\"]+)['\"]")

for f in sorted(glob.glob('*.ts')):
    last_path = last_name = None
    for line in open(f, encoding='utf-8').read().splitlines():
        m = pat_path.search(line)
        if m:
            last_path = m.group(1)
        m = pat_name.search(line)
        if m:
            last_name = m.group(1)
        m = pat_comp.search(line)
        if m:
            view = m.group(1)
            if view in targets:
                print(f"{targets[view]:6} | {last_path} | {last_name}")
