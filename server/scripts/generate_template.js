const xlsx = require('xlsx');
const path = require('path');

const workbook = xlsx.utils.book_new();

// Sheet1: 花名册数据
const headers = ['员工编号', '姓名', '身份证号', '性别', '出生日期', '所属部门', '班组', '职位', '入职日期', '联系电话', '是否驾驶员', '驾驶证类型'];
const sampleData = [
  ['EMP001', '张三', '371422199001011234', '男', '1990-01-01', '宁城街道片区', '一班', '乡镇保洁员', '2020-03-01', '13800138001', '否', ''],
  ['EMP002', '李四', '371422198505052345', '男', '1985-05-05', '宁城街道片区', '', '司机', '2019-06-01', '13900139001', '是', 'B2'],
  ['EMP003', '王五', '371422199210103456', '女', '1992-10-10', '长官镇片区', '', '中转站管理员', '2021-01-01', '13700137001', '否', ''],
  ['EMP004', '赵六', '371422198808084567', '男', '1988-08-08', '车队', '', '司机', '2018-09-01', '13600136001', '是', 'B2']
];

const dataSheet = xlsx.utils.aoa_to_sheet([headers, ...sampleData]);
xlsx.utils.book_append_sheet(workbook, dataSheet, '花名册数据');

// Sheet2: 填写说明
const instructionData = [
  ['序号', '字段名称', '填写说明'],
  ['1', '员工编号', '公司内部工号，全局唯一，格式如：EMP001'],
  ['2', '姓名', '员工真实姓名，与身份证一致'],
  ['3', '身份证号', '18位身份证号码，最后一位可为X'],
  ['4', '性别', '选择"男"或"女"，不填则由身份证推算'],
  ['5', '出生日期', '格式：YYYY-MM-DD，不填则由身份证推算'],
  ['6', '所属部门', '参考组织对照表，如：宁城街道片区、车队'],
  ['7', '班组', '保洁员填写班组名称（如：一班），其他岗位可空'],
  ['8', '职位', '填写岗位名称，如：乡镇保洁员、司机、中转站管理员'],
  ['9', '入职日期', '格式：YYYY-MM-DD'],
  ['10', '联系电话', '11位手机号'],
  ['11', '是否驾驶员', '驾驶员选择"是"，其他选择"否"'],
  ['12', '驾驶证类型', '驾驶员必填，选择：B2/A2/C1']
];

const instructionSheet = xlsx.utils.aoa_to_sheet(instructionData);
xlsx.utils.book_append_sheet(workbook, instructionSheet, '填写说明');

// Sheet3: 组织对照表
const orgData = [
  ['原始填写名称', '标准组织名称', '组织类型', '组织ID'],
  ['安环管理部', '安环管理部', 'department', 'DEPT-SAFETY'],
  ['生产管理部', '生产管理部', 'department', 'DEPT-PROD'],
  ['人力综合部', '人力综合部', 'department', 'DEPT-HR'],
  ['环卫作业中心', '环卫作业中心', 'operation_center', 'CENTER-HW'],
  ['市政绿化作业中心', '市政绿化作业中心', 'operation_center', 'CENTER-LV'],
  ['宁城街道片区', '宁城街道作业中心', 'town_center', 'TOWN-NINGCHENG'],
  ['长官镇片区', '长官镇作业中心', 'town_center', 'TOWN-CHANGGUAN'],
  ['张大庄镇片区', '张大庄镇作业中心', 'town_center', 'TOWN-ZHANGDAZHUANG'],
  ['大曹镇片区', '大曹镇作业中心', 'town_center', 'TOWN-DACAO'],
  ['杜集镇片区', '杜集镇作业中心', 'town_center', 'TOWN-DUJI'],
  ['柴胡店镇片区', '柴胡店镇作业中心', 'town_center', 'TOWN-CHAIHUDIAN'],
  ['保店镇片区', '保店镇作业中心', 'town_center', 'TOWN-BAODIAN'],
  ['大柳镇片区', '大柳镇作业中心', 'town_center', 'TOWN-DALIU'],
  ['相衙镇片区', '相衙镇作业中心', 'town_center', 'TOWN-XIANGYA'],
  ['刘营伍乡片区', '刘营伍乡作业中心', 'town_center', 'TOWN-LIUYINGWU'],
  ['时集镇片区', '时集镇作业中心', 'town_center', 'TOWN-SHIJI'],
  ['津城街道片区', '津城街道作业中心', 'town_center', 'TOWN-JINCHENG'],
  ['车队', '中心车辆作业组', 'center_vehicle_team', 'UNIT-CENTER-VEHICLE-001']
];

const orgSheet = xlsx.utils.aoa_to_sheet(orgData);
xlsx.utils.book_append_sheet(workbook, orgSheet, '组织对照表');

const outputPath = path.join(__dirname, '../HSE员工花名册导入模板.xlsx');
xlsx.writeFile(workbook, outputPath);

console.log('Excel模板生成成功:', outputPath);