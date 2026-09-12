const XLSX = require('xlsx');
const path = require('path');

const EXCEL_PATH = 'F:\\deploy\\hse-dashboard\\数据源\\02_保险及人员管理\\人员保险\\花名册.xlsx';

function readExcel() {
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { header: 1 });
}

function analyzeDepts() {
    const rows = readExcel();
    const headerRow = rows[0];
    
    console.log('表头:', headerRow);
    
    // 找部门列和职位列
    let deptCol = -1, posCol = -1, nameCol = -1, empIdCol = -1;
    for (let i = 0; i < headerRow.length; i++) {
        const h = String(headerRow[i] || '').trim();
        if (h.includes('部门') || h.includes('所属部门')) deptCol = i;
        if (h.includes('职位') || h.includes('岗位')) posCol = i;
        if (h.includes('姓名')) nameCol = i;
        if (h.includes('工号') || h.includes('员工编号')) empIdCol = i;
    }
    
    console.log(`列索引: 部门=${deptCol}, 职位=${posCol}, 姓名=${nameCol}, 工号=${empIdCol}`);
    
    // 统计所有部门
    const deptCount = new Map();
    const deptPosMap = new Map(); // 部门 -> 职位统计
    
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const dept = String(row[deptCol] || '').trim();
        const pos = String(row[posCol] || '').trim();
        
        if (!dept) continue;
        
        deptCount.set(dept, (deptCount.get(dept) || 0) + 1);
        
        if (!deptPosMap.has(dept)) {
            deptPosMap.set(dept, new Map());
        }
        const posMap = deptPosMap.get(dept);
        posMap.set(pos, (posMap.get(pos) || 0) + 1);
    }
    
    // 分类
    const areaDepts = []; // 片区
    const teamDepts = []; // 班组
    const centerDepts = []; // 中心直管
    const otherDepts = [];
    
    for (const [dept, count] of deptCount.entries()) {
        if (dept.includes('片区')) {
            areaDepts.push({ dept, count });
        } else if (dept.includes('班') || dept.includes('组') || dept.includes('队')) {
            teamDepts.push({ dept, count });
        } else if (dept.includes('车队') || dept.includes('中心') || dept.includes('办公室') || dept.includes('部')) {
            centerDepts.push({ dept, count });
        } else {
            otherDepts.push({ dept, count });
        }
    }
    
    console.log('\n========================================');
    console.log('部门分类统计');
    console.log('========================================');
    
    console.log(`\n--- 片区类 (${areaDepts.length}个) ---`);
    areaDepts.sort((a, b) => b.count - a.count).forEach(d => {
        const posMap = deptPosMap.get(d.dept);
        const posList = Array.from(posMap.entries()).map(([p, c]) => `${p}(${c})`).join(', ');
        console.log(`  ${d.dept}: ${d.count}人 | 职位: ${posList}`);
    });
    
    console.log(`\n--- 班组类 (${teamDepts.length}个) ---`);
    teamDepts.sort((a, b) => b.count - a.count).forEach(d => {
        const posMap = deptPosMap.get(d.dept);
        const posList = Array.from(posMap.entries()).map(([p, c]) => `${p}(${c})`).join(', ');
        console.log(`  ${d.dept}: ${d.count}人 | 职位: ${posList}`);
    });
    
    console.log(`\n--- 中心直管/职能类 (${centerDepts.length}个) ---`);
    centerDepts.sort((a, b) => b.count - a.count).forEach(d => {
        const posMap = deptPosMap.get(d.dept);
        const posList = Array.from(posMap.entries()).map(([p, c]) => `${p}(${c})`).join(', ');
        console.log(`  ${d.dept}: ${d.count}人 | 职位: ${posList}`);
    });
    
    console.log(`\n--- 其他 (${otherDepts.length}个) ---`);
    otherDepts.sort((a, b) => b.count - a.count).forEach(d => {
        const posMap = deptPosMap.get(d.dept);
        const posList = Array.from(posMap.entries()).map(([p, c]) => `${p}(${c})`).join(', ');
        console.log(`  ${d.dept}: ${d.count}人 | 职位: ${posList}`);
    });
    
    console.log(`\n总部门数: ${deptCount.size}`);
    console.log(`总人数: ${rows.length - 1}`);
    
    // 提取乡镇名
    console.log('\n========================================');
    console.log('乡镇提取验证');
    console.log('========================================');
    
    const towns = new Set();
    for (const dept of deptCount.keys()) {
        const townMatch = dept.match(/^(.+?)(街道|镇|乡|片区)/);
        if (townMatch) {
            towns.add(townMatch[1] + (townMatch[2] === '片区' ? '' : townMatch[2]));
        }
    }
    
    console.log('提取到的乡镇:');
    Array.from(towns).sort().forEach(t => console.log(`  - ${t}`));
    console.log(`共 ${towns.size} 个乡镇`);
}

analyzeDepts();
