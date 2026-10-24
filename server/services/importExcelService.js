/**
 * HSE 智能导入 · 原生入库 + 端点业务 service
 * 从 routes/import.js 迁移：confirmImportNative（逐字保持）+ parse/confirm/rollback/template/upload 端点业务。
 * 各端点函数返回统一描述符（__t: json / error / file），由 controller 解释为对外响应，保持原契约。
 * 不持有 express 依赖；req/res 由 controller 承担解析与包装。
 */
const path = require('path');
const crypto = require('crypto');
const { pool, isConnected } = require('../config/db');
const { auditLog } = require('../routes/audit');
const XLSX = require('xlsx');
const gridCompletionService = require('./gridCompletionService');
const gridUncheckedDeduction = require('./gridUncheckedDeductionService');
const { resolveEmployee, isNameConsistent } = require('./employeeResolver');
const { normalizeInsuranceType, SUPPORTED_INSURANCE_TYPES } = require('./insuranceTypeDict');
const { findActivePolicyConflict, isPolicyActiveOnBusinessDay } = require('./personnelInsurancePolicyService');
const { hashSensitive } = require('../utils/encryption');
const shared = require('./importShared');
const {
  NATIVE_IMPORT_MODULES, PARSER_SCRIPT, parseExcelNative, callPython, buildFrontendPreview,
  fixDateValue, attachViolationImages, attachGridImages, cleanModel, repairMojibakeFileName,
  buildConflictKey,
} = shared;
const { confirmImportMemory } = require('./importMemoryService');
// P3-04-00.2 (F-03)：隐患生命周期初始状态必须引用唯一 fact source，不得在本文件另立字面量。
// hazardService 不反向依赖 importExcelService，无循环引用。
const { HAZARD_STATUS } = require('./hazardService');

// ============================================================
// POST /api/import/parse — 解析文件
// ============================================================
async function parse({ fileRecordId, filePath, fileName, sheets }) {
  try {
    let _filePath = filePath;
    let _fileName = fileName;
    if ((!_filePath || !_fileName) && fileRecordId) {
      const fr = await pool.query(
        `SELECT filepath, original_name, filename FROM file_records WHERE id = $1`,
        [fileRecordId]
      );
      if (fr.rows.length) {
        _filePath = fr.rows[0].filepath;
        _fileName = fr.rows[0].original_name || fr.rows[0].filename;
      }
    }
    if (!_filePath || !_fileName) {
      return { __t: 'error', code: -1, message: '缺少必要参数: filePath, fileName (且 file_records 中无可用的记录)' };
    }
    let moduleType = null;
    if (fileRecordId) {
      const fr = await pool.query('SELECT module_type FROM file_records WHERE id = $1', [fileRecordId]);
      if (fr.rows.length) moduleType = fr.rows[0].module_type;
    }
    if (moduleType && NATIVE_IMPORT_MODULES[moduleType]) {
      try {
        const nativeConfig = NATIVE_IMPORT_MODULES[moduleType];
        const parseResult = parseExcelNative(_filePath, nativeConfig, sheets);
        if (!parseResult.success) {
          return { __t: 'error', code: -2, message: parseResult.error || '文件解析失败', data: parseResult };
        }
        const payload = {
          jobId: String(fileRecordId),
          totalRows: parseResult.total_rows + (parseResult.error_count || 0),
          validRows: parseResult.total_rows,
          invalidRows: parseResult.error_count || 0,
          errors: parseResult.errors || [],
          preview: parseResult.preview,
          moduleType,
          moduleName: nativeConfig.moduleName,
          targetTable: nativeConfig.targetTable,
          sheets: parseResult.sheets || [],
        };
        return { __t: 'json', payload, message: `解析成功: 模块=${nativeConfig.moduleName}, 共${parseResult.total_rows}行${parseResult.error_count ? `，错误${parseResult.error_count}行` : ''}` };
      } catch (nativeErr) {
        console.error('[Import] native parse failed:', nativeErr.message);
      }
    }
    const args = [
      PARSER_SCRIPT, '--action=parse', `--file-path=${_filePath}`, `--file-name=${_fileName}`,
    ];
    if (fileRecordId) args.push(`--file-record-id=${fileRecordId}`);
    if (sheets && Array.isArray(sheets) && sheets.length) args.push(`--sheets=${sheets.join(',')}`);
    const result = await callPython(args);
    if (result.success) {
      const payload = buildFrontendPreview(result, fileRecordId);
      return { __t: 'json', payload, message: `解析成功: 模块=${result.module_name}, 表=${result.target_table}, 共${result.total_rows}行` };
    } else {
      return { __t: 'error', code: -2, message: result.error || '解析失败', data: result };
    }
  } catch (err) {
    console.error('[Import] parse error:', err.message);
    return { __t: 'error', code: -3, message: '解析异常: ' + err.message };
  }
}

// ============================================================
// POST /api/import/confirm — 确认入库
// ============================================================
async function confirm({ fileRecordId, insuranceType, operator, ip }) {
  try {
    if (!fileRecordId) {
      return { __t: 'error', code: -1, message: '缺少必要参数: fileRecordId' };
    }
    const jobId = crypto.randomUUID();
    const fr = await pool.query('SELECT module_type FROM file_records WHERE id = $1', [fileRecordId]);
    const moduleType = fr.rows[0]?.module_type;
    if (moduleType && NATIVE_IMPORT_MODULES[moduleType]) {
      const result = await confirmImportNative(fileRecordId, moduleType, operator, insuranceType);
      if (result.success) {
        const count = (result.inserted || 0) + (result.updated || 0);
        auditLog({ userId: operator?.id, username: operator?.username, action: 'import', module: moduleType, description: `确认导入 ${count || ''} 条数据`, ip }).catch(() => {});
        const msg = result.outcome === 'imported'
          ? `入库成功: 新增${result.inserted}, 更新${result.updated}`
          : result.outcome === 'partial'
            ? `部分入库完成: 新增${result.inserted}, 更新${result.updated}, 跳过${result.skipped}`
            : '入库失败，未写入记录';
        return { __t: 'json', payload: result, message: msg };
      } else {
        return { __t: 'error', code: -2, message: result.error || '入库失败', data: result };
      }
    }
    const args = [
      PARSER_SCRIPT, '--action=confirm', `--job-id=${jobId}`, `--file-record-id=${fileRecordId}`, `--operator=${operator || 'web-user'}`,
    ];
    const result = await callPython(args);
    if (result.success) {
      const count = (result.inserted || 0) + (result.updated || 0);
      auditLog({ userId: operator?.id, username: operator?.username, action: 'import', module: 'import', description: `确认导入 ${count || ''} 条数据`, ip }).catch(() => {});
      return { __t: 'json', payload: result, message: `入库成功: 新增${result.inserted}, 更新${result.updated}, 跳过${result.skipped}` };
    } else {
      return { __t: 'error', code: -2, message: result.error || '入库失败', data: result };
    }
  } catch (err) {
    console.error('[Import] confirm error:', err.message);
    return { __t: 'error', code: -3, message: '入库异常: ' + err.message };
  }
}

// ============================================================
// POST /api/import/rollback — 回滚
// ============================================================
async function rollback({ jobId, operator, ip }) {
  try {
    if (!jobId) {
      return { __t: 'error', code: -1, message: '缺少必要参数: jobId' };
    }
    const args = [PARSER_SCRIPT, '--action=rollback', `--job-id=${jobId}`];
    const result = await callPython(args);
    if (result.success) {
      auditLog({ userId: operator?.id, username: operator?.username, action: 'rollback', module: 'import', description: '回滚导入', ip }).catch(() => {});
      return { __t: 'json', payload: result, message: `回滚成功: 删除${result.deleted_rows}行数据` };
    } else {
      return { __t: 'error', code: -2, message: result.error || '回滚失败', data: result };
    }
  } catch (err) {
    console.error('[Import] rollback error:', err.message);
    return { __t: 'error', code: -3, message: '回滚异常: ' + err.message };
  }
}

// ============================================================
// GET /api/import/template/:module — 下载模板
// ============================================================
async function template({ module, format }) {
    const moduleTemplates = {
      hazards: [
        { 序号: 1, 隐患描述: '柴胡店收运车570Q左刹车灯不亮、右转向不亮', 整改措施: '立即前往车辆维修厂修理', 检查时间: '2026.6.16', 检查人员: '刘金涛、刘菲、王明轩', 整改人员: '张康', 整改时间: '2026.6.18', 是否整改完成: '是' },
      ],
      accidents: [
        { 事故日期: '2026-01-10', 事故类型: '交通事故', 事故等级: '一般', 发生地点: 'Highway 101', 事故描述: '车辆碰撞', 损失金额: 5000, 处理状态: '处理中' },
      ],
      training: [
        { 姓名: '王五', 部门: '市政部', 岗位: '司机', 培训类型: '安全培训', 培训日期: '2026-01-05', 培训时长分钟: 120, 培训内容: '交通安全知识', 考核结果: '合格', 分数: 90, 讲师: '赵六' },
      ],
      personnel: [
        // 任务7：模板表头必须与 personnel fieldMapping 一一对应（可被当前预处理成功解析）。
        // 工号/员工编号为核心关联列；姓名仅附加校验；删除会误导用户依赖身份证/姓名关联的旧示例。
        { 工号: 'E001', 姓名: '张三', 保险类型: '雇主责任险', 保单号: 'POL001', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保额: 800000, 保费: 500, 是否当前: '是', 备注: '示例行' },
      ],
      objectives: [
        { 年度: 2026, 季度: 1, 部门: '市政部', 责任人: '张三', 考核分数: 95, 等级: '优秀', 状态: '有效' },
      ],
      emergency: [
        { 预案名称: '火灾应急预案', 类型: 'fire', 级别: 'level1', 状态: 'active', 责任部门: '安全部', 责任人: '李四', 联系电话: '13900139000', 描述: '火灾应急处理流程', 版本: '1.0' },
      ],
      drill: [
        { 预案名称: '火灾应急预案', 演练类型: 'tabletop', 演练日期: '2026-01-15', 演练地点: '厂区A区', 参加人数: 50, 时长分钟: 60, 演练结果: 'excellent', 评估人: '评估组-张组长', 总结: '演练组织有序，达到预期目标', 改进建议: '建议加强初期处置训练' },
      ],
      // 应急演练页由 useGenericImport('emergency-drill') 请求模板，列名对齐应急演练列表/导入字段。
      'emergency-drill': [
        { 演练名称: '火灾应急演练', 关联预案: '火灾应急预案', 演练类型: '实战演练', 演练级别: '二级', 演练日期: '2026-01-15', 演练地点: '厂区A区', 组织单位: '安全管理部', 参演人数: 50, 时长: 60, 演练结果: '合格', 演练状态: '已完成', 备注: '' },
      ],
      insurance: [
        { 姓名: '张三', 身份证号: '110101199001011234', 部门: '市政部', 岗位: '司机', 保险状态: '已参保', 保险类型: '意外险', 保单号: 'POL001', 保险起期: '2026-01-01', 保险到期: '2027-01-01', 保费: 500 },
      ],
      vehicle: [
        {
          序号: 1,
          '投保人、被保险人': '宁津北控城市环境服务有限公司',
          '行驶证车主': '宁津北控城市环境服务有限公司',
          车牌号: '鲁ND1021',
          车架号: 'LZ0BFPD42J1017981',
          发动机号: 'BD10143525',
          初次登记年月: '2019-01-24',
          厂牌车型: '飞碟FD5161GXWP63K5吸污车',
          交强险保险起期: '2026-02-27',
          交强险保险止期: '2027-02-26',
          商业险保险起期: '2026-02-27',
          商业险保险止期: '2027-02-26',
          车损险保额: '200万',
          车损险保费: 3826.53,
          三者险保额: '200万',
          三者险保费: 3826.53,
          司乘险保额: '',
          司乘险保费: 0,
          商业险合计: 3826.53,
          交强险: 1944,
          车船税: 105.68,
          合计: 5876.21,
        },
      ],
      other: [
        { 保险类型: '公众责任险', 保单号: 'POL-OTHER-001', 投保标的: '厂区公共区域', 保额: 500000, 保费: 1200, 保险起期: '2026-01-01', 保险止期: '2027-01-01', 保险公司: '中国人民财产保险', 部门: '安全管理部', 联系人: '张三', 联系电话: '13800138000', 状态: '有效', 备注: '示例行' },
      ],
      regulations: [
        { 制度名称: '安全生产责任制', 制度编号: 'HSE-001', 制度类型: '管理制度', 发布日期: '2026-01-01', 实施日期: '2026-01-15', 制定部门: '安全管理部', 状态: '已发布', 版本: '1.0' },
      ],
      workflow: [
        { 流程编码: 'WF001', 流程名称: '隐患整改审批', 流程描述: '隐患发现→整改→验收闭环', 状态: '启用', 排序: 1 },
      ],
      inspection: [
        { 检查项目: '消防设施检查', 检查类型: '月度检查', 检查日期: '2026-01-15', 责任部门: '安全管理部', 检查结果: '合格', 整改期限: '2026-01-20', 备注: '' },
      ],
      audit: [
        { 操作人: 'admin', 操作类型: '登录', 操作对象: '系统', 操作时间: '2026-01-15 08:30:00', IP地址: '127.0.0.1', 操作结果: '成功', 备注: '' },
      ],
      'risk-control': [
        { 风险名称: '高处坠落', 风险等级: '重大', 风险类型: '作业风险', 责任部门: '安全管理部', 控制措施: '佩戴安全带、设置防护网', 状态: '管控中' },
      ],
      committee: [
        { 姓名: '张三', 部门: '安全管理部', 职务: '主任', 联系电话: '13800138000', 委员会类型: '安委会', 任职日期: '2026-01-01', 状态: '在职' },
      ],
      assessment: [
        { 考核名称: '年度安全考核', 考核周期: '2026年度', 被考核部门: '市政部', 考核分数: 95, 考核等级: '优秀', 考核人: '李四', 考核日期: '2026-12-25' },
      ],
      budget: [
        { '预算年度': 2026, '措施项目': '安全培训费用', '预算科目': '费用化', '名称': '年度安全培训', '用途及依据': '年度培训计划', '计划使用时间': '2026-03-15', '使用部门/地点': '安全管理部', '规格/品牌': '', '计划-数量': 1, '计划-单价(万)': 5, '计划-总价(万)': 5, '支出-数量': 0, '支出-单价(万)': 0, '使用状态': '未支出', '备注': '' },
      ],
      ledger: [
        { 姓名: '王五', 身份证号: '371422199001011234', 部门: '市政部', 岗位: '司机', 网格层级: '三级', 培训频次: '年度', 培训类型: '安全培训', 培训日期: '2026-01-05', 培训时长: 120, 培训内容: '交通安全知识', 考核结果: '合格', 分数: 90, 讲师: '赵六', 备注: '' },
      ],
      // 培训记录页（web-naive ledger）实际以 module='training-ledger' 请求模板，
      // 此前不在本表导致落到兜底「字段1/字段2」。列名对齐 ledger/training fieldMapping 中文表头，保证可按模板填表后正确导入。
      'training-ledger': [
        { 姓名: '王五', 身份证号: '371422199001011234', 部门: '市政部', 岗位: '司机', 网格层级: '三级', 培训频次: '年度', 培训类型: '安全培训', 培训日期: '2026-01-05', 培训时长: 120, 培训内容: '交通安全知识', 考核结果: '合格', 分数: 90, 讲师: '赵六', 备注: '' },
      ],
      // 培训系列各页面由 useGenericImport('training-*') 请求模板，列名对齐各实体列表/导入字段中文表头。
      'training-requirements': [
        { 岗位名称: '司机', 培训名称: '交通安全培训', 培训周期: '年度', 是否必须: '必须', 培训时长: 120, 备注: '' },
      ],
      'training-plans': [
        { 培训名称: '年度安全培训', 培训时间: '2026-01-15', 培训对象: '全体员工', 培训内容: '交通安全知识', 责任部门: '安全管理部', 培训学时: 8, 计划类型: '年度培训计划', 培训类型: '安全培训', 培训师: '赵六', 计划人数: 50, 培训地点: '会议室', 状态: '已审批', 备注: '' },
      ],
      'training-new-employee': [
        { 姓名: '王五', 身份证号: '371422199001011234', 部门: '市政部', 岗位: '司机', 培训日期: '2026-01-05', 培训时长: 120, 培训内容: '交通安全知识', 成绩: 90, 培训结果: '合格', 备注: '' },
      ],
      'training-driver': [
        { 姓名: '赵六', 驾驶证类型: 'A2', 驾驶证号: '371422199001011234', 培训车辆: '鲁ND1021', 实操项目: '倒车入库', 培训日期: '2026-01-10', 培训时长: 120, 教练员: '张教练', 成绩: 95, 培训结果: '合格', 培训内容: '叉车实操' },
      ],
      'training-records': [
        { 姓名: '王五', 培训类型: '安全培训', 所属部门: '市政部', 职位: '司机', 人员类型: '在岗', 考试日期: '2026-01-05', 有效期: '2027-01-05', 培训结果: '合格' },
      ],
      'new-employee': [
        { 姓名: '王五', 部门: '运营一部', 岗位: '保洁员', 入职日期: '2026-01-01', 培训完成: '是', 考试分数: 92, 师傅姓名: '张师傅', 考核结果: '合格' },
      ],
      driver: [
        { 姓名: '赵六', 部门: '车队', 岗位: '司机', 驾驶证号: '371422199001011234', 准驾车型: 'A2', 入职日期: '2020-01-01', 实操考核日期: '2026-01-10', 考核结果: '优秀', 安全行驶里程: 120000 },
      ],
      // 驾驶员管理三模块：模板表头必须与各自 fieldMapping 的中文源表头一一对应，否则用户按模板填表后导入字段无法映射
      'driver-assessment': [
        { 档案编号: '', 姓名: '', 驾驶证件号: '', 准驾车型: '', 所属部门: '', 车辆编号: '', 评估日期: '', 评估结果: '', 评估等级: '', 有效期至: '', 联系电话: '', 备注: '' },
      ],
      'driver-violation': [
        { 姓名: '', 车牌号: '', 违章时间: '', 违章地点: '', 违章类别: '', 违章事实描述: '', 扣分: '', 罚款金额: '', 处理状态: '', 处理方式: '', 处理结果: '', 备注: '' },
      ],
      // 三违扣分记录：模板表头对齐「司机交通安全专项行动档案表」档案表格式（导入仅落库 日期/违章事由/扣分，
      // 违规类型/违规等级/违章照片 列暂不存储，留空即可）
      'driver-three-violation': [
        { 序号: 1, 日期: '2026-08-31', 驾驶员姓名: '杨占刚', 违章类别: '车辆安全管理——违反劳动纪律', 违章照片: '', 违章行为描述: '关闭/遮挡/移动车辆驾驶室内摄像头', 违规类型: '违反劳动纪律', 违规等级: '一般违规', 扣分值: '10分' },
      ],
      'driver-monthly': [
        { 考核月份: '', 姓名: '', 所属部门: '', 安全驾驶得分: '', 遵章守纪得分: '', 培训学习得分: '', 得分: '', 考核等级: '', 主要问题: '', 评定人: '', 备注: '' },
      ],
      violation: [
        { 违章标题: '未佩戴安全帽', 违章类型: '违章作业', 违章级别: '一般', 违章状态: '待整改', 违章人员: '张三', 所属部门: '生产运行部', 发现区域: '生产车间A', 发现人: '李四', 发现日期: '2026-01-15', 整改措施: '立即停止作业，进行安全教育', 整改期限: '2026-01-22', 整改人: '王五' },
      ],
      'fire-facility': [
        { 设施名称: '灭火器-001', 设施类型: '灭火器', 型号规格: 'MFZ/ABC4', 安装位置: '办公楼1层', 设施状态: '正常', 数量: 4, 安装日期: '2025-01-01', 有效期至: '2027-01-01', 上次检查: '2026-01-10', 下次检查: '2026-02-10', 负责人: '赵消防', 联系电话: '13800001234' },
      ],
      // 网格管理导入模板（检查记录/三违检查记录表，依据用户上传 Excel 列结构定制）
      // 用于任务四导入 grid_inspection_records 并计算完成率：
      //   姓名(完成率统计) = 检查人姓名；检查日期(年月筛选/完成率) = 上传时间；网格关联 = 片区/班组 + 网格等级
      grid: [
        {
          '片区/班组': '大柳镇',
          '上传时间': '2026-07-01 07:09:12',
          '检查人姓名': '李新国',
          '网格等级': '三级网格长',
          '所属岗位': '管理员',
          '违章人姓名': '贾吨林',
          '违章人性别': '男',
          '违章人年龄': 65,
          '车辆类型/保洁员': '',
          '上报状态': '已完成',
          '图片内容': '1782860835349.jpg',
          '"三违"行为': '未穿工作服',
          '三违类型.输出结果': '无',
          '需要整改': '否',
          '整改执行人': '无',
          '整改后的照片': '1782860658027.jpg',
          '示意图': '',
        },
      ],
      'over-age': [
        { 姓名: '张大爷', 身份证号: '371422196001011234', 部门: '运营一部', 岗位: '保洁员', 年龄: 66, 超龄年限: 6, 管控类型: '一般超龄', 审批状态: '已审批', 保险状态: '已参保' },
      ],
      cockpit: [
        { 指标名称: '事故发生率', 指标值: 0.05, 目标值: 0.1, 单位: '‰', 状态: '达标', 同比变化: '-15%' },
      ],
      bi: [
        { 报表名称: '安全趋势分析', 报表类型: '趋势图', 统计周期: '月度', 数据维度: '部门', 生成日期: '2026-01-15', 状态: '已生成' },
      ],
      'ai-analysis': [
        { 分析名称: '隐患预测分析', 分析类型: '预测模型', 数据源: '隐患数据库', 模型版本: 'v2.0', 分析日期: '2026-01-15', 准确率: '92%', 状态: '完成' },
      ],
      iot: [
        { 设备编号: 'IOT001', 设备名称: '温湿度传感器', 设备类型: '传感器', 安装位置: '转运站一号车间', 状态: '在线', 最后上报: '2026-01-15 10:30:00', 信号强度: '强' },
      ],
      'supply-chain': [
        { 供应商名称: '劳保用品批发公司', 供应类型: '劳保用品', 评估日期: '2026-01-10', 评估结果: '合格', 风险等级: '低', 联系人: '王经理', 联系电话: '13900139000' },
      ],
      reports: [
        { 报表名称: '月度安全报告', 报表类型: '定期报告', 统计周期: '2026年1月', 生成日期: '2026-02-01', 状态: '已生成', 负责人: '李四', 备注: '' },
      ],
      // 标准化条款页由 useGenericImport('standard-clauses') 请求模板，列名对齐条款导入字段。
      'standard-clauses': [
        { 条款编码: 'HSE-01-01-001', 层级: '三级（条款）', 父级条款: 'HSE-01-01', 要素名称: '安全生产责任制', 条款标题: '责任落实', 条款要求内容: '明确各级岗位安全生产责任', 检查方法: '现场检查资料', 分值权重: 10, 排序: 1, 状态: '启用' },
      ],
    };
    const templateData = moduleTemplates[module] || [
      { 字段1: '', 字段2: '', 字段3: '', 字段4: '', 字段5: '' },
    ];
    const fmt = (format || 'xlsx').toLowerCase();
    if (fmt === 'csv') {
      const headers = Object.keys(templateData[0]).join(',') + '\n';
      const rows = templateData.map(row =>
        Object.values(row).map(v => {
          if (typeof v === 'string') return `"${v}"`;
          return v;
        }).join(',')
      ).join('\n');
      const hdr = {};
      hdr['Content-Type'] = 'text/csv; charset=utf-8';
      hdr['Content-Disposition'] = `attachment; filename="${module}_template.csv"`;
      return { __t: 'file', headers: hdr, buffer: '\uFEFF' + headers + rows };
    } else {
      const ws = XLSX.utils.json_to_sheet(templateData);
      const colWidths = Object.keys(templateData[0]).map(k => ({ wch: Math.max(k.length * 2, 12) }));
      ws['!cols'] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const hdr = {};
      hdr['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const tplDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const tplFileName =
        module === 'grid'
          ? `网格管理导入模板_${tplDateStr}.xlsx`
          : module === 'training-ledger' || module === 'ledger'
            ? `培训台账导入模板_${tplDateStr}.xlsx`
            : `${module}_template.xlsx`;
      // Node http 头校验不允许 header 值含非 Latin-1 字符（ERR_INVALID_CHAR）。
      // filename 用 ASCII 回退名，中文名经 RFC 5987 filename* 百分号编码，浏览器仍显示中文名。
      hdr['Content-Disposition'] = `attachment; filename="${module}_template.xlsx"; filename*=UTF-8''${encodeURIComponent(tplFileName)}`;
      return { __t: 'file', headers: hdr, buffer };
    }
}

// ============================================================
// POST /api/import/upload — 上传 Excel 并解析（multer 已在路由绑定，此处处理落库+解析）
// ============================================================
async function upload({ file, module, originalFilename }) {
  try {
    if (!file) {
      return { __t: 'error', code: -1, message: '请选择要上传的文件' };
    }
    const filePath = file.path.replace(/\\/g, '/');
    let fileName = file.originalname;
    const fileSize = file.size;
    const backupName = originalFilename || '';
    fileName = repairMojibakeFileName(fileName, backupName);
    const fileType = (path.extname(fileName) || '').toLowerCase().replace(/^\./, '') || 'xlsx';
    const insertRes = await pool.query(
      `INSERT INTO file_records (filename, filepath, original_name, file_type, size, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'uploaded', NOW()) RETURNING id`,
      [file.filename, filePath, fileName, fileType, fileSize]
    );
    const fileRecordId = insertRes.rows[0].id;
    const mod = module || '';
    const nativeConfig = NATIVE_IMPORT_MODULES[mod];
    if (nativeConfig) {
      try {
        const parseResult = parseExcelNative(file.path, nativeConfig);
        if (!parseResult.success) {
          return { __t: 'error', code: -2, message: parseResult.error || '文件解析失败', data: parseResult };
        }
        await pool.query(
          `UPDATE file_records SET module_type = $1, status = 'parsed' WHERE id = $2`,
          [mod, fileRecordId]
        );
        const payload = {
          jobId: String(fileRecordId),
          totalRows: parseResult.total_rows + (parseResult.error_count || 0),
          validRows: parseResult.total_rows,
          invalidRows: parseResult.error_count || 0,
          errors: parseResult.errors || [],
          preview: parseResult.preview,
          moduleType: mod,
          moduleName: nativeConfig.moduleName,
          targetTable: nativeConfig.targetTable,
          sheets: parseResult.sheets || [],
        };
        return { __t: 'json', payload, message: `文件上传并解析成功: ${fileName}${parseResult.error_count ? `（错误${parseResult.error_count}行，已跳过）` : ''}` };
      } catch (nativeErr) {
        console.error('[Import] native parse failed:', nativeErr.message);
      }
    }
    const args = [
      PARSER_SCRIPT, '--action=parse', `--file-path=${filePath}`, `--file-name=${fileName}`, `--file-record-id=${fileRecordId}`,
    ];
    let parseResult;
    try {
      parseResult = await callPython(args);
    } catch (pyErr) {
      console.error('[Import] parse spawn failed:', pyErr.message);
      return { __t: 'error', code: -2, message: '文件解析失败（解析引擎异常）: ' + pyErr.message };
    }
    if (!parseResult || !parseResult.success) {
      return { __t: 'error', code: -2, message: parseResult?.error || '文件解析失败', data: parseResult || null };
    }
    const payload = buildFrontendPreview(parseResult, fileRecordId);
    return { __t: 'json', payload, message: `文件上传并解析成功: ${fileName}` };
  } catch (err) {
    console.error('[Import] upload error:', err.message);
    return { __t: 'error', code: -1, message: '上传失败: ' + err.message };
  }
}

// ============================================================
// confirmImportNative（自 routes/import.js 逐字迁移，行为保持）
// ============================================================
async function confirmImportNative(fileRecordId, moduleType, operator, insuranceType) {
  const moduleConfig = NATIVE_IMPORT_MODULES[moduleType];
  if (!moduleConfig) {
    return { success: false, error: `不支持的模块: ${moduleType}` };
  }

  // ---- 内存模式模块（fire-facility / violation 等）：导入到内存存储 ----
  if (moduleConfig.memoryMode) {
    return confirmImportMemory(fileRecordId, moduleType, moduleConfig, operator);
  }

  // ---- 网格管理双模式：数据库不可用时降级到内存存储 ----
  if (moduleType === 'grid' && !isConnected()) {
    return confirmImportMemory(fileRecordId, moduleType, { ...moduleConfig, memoryMode: true }, operator);
  }

  const fr = await pool.query(
    'SELECT filepath, original_name FROM file_records WHERE id = $1',
    [fileRecordId]
  );
  if (!fr.rows.length) {
    return { success: false, error: '文件记录不存在' };
  }

  const filePath = fr.rows[0].filepath;
  const parseResult = parseExcelNative(filePath, moduleConfig);
  if (!parseResult.success) {
    return parseResult;
  }

  let data = parseResult.sample_data || [];
  console.log('[NativeImport] 初始数据量:', data.length);

  // 数据清洗：移除空值字段，转换数字字段类型
  const numericFields = moduleConfig.numericFields || ['duration_minutes', 'score', 'premium', 'amount', 'quantity'];
  data = data.map(row => {
    const cleaned = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }
      if (numericFields.includes(key)) {
        const num = Number(value);
        if (!isNaN(num)) {
          cleaned[key] = num;
        }
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  });

  // P3-04-00.2 (F-03)：隐患生命周期状态与 Excel 彻底隔离（第二道锁）。
  // 即便将来有人移除 hazards 模块的 dbColumns 白名单，这条删除仍能保证
  // Excel「是否整改完成」列的取值不会流向数据库。服务端随后按常量注入初始状态。
  if (moduleType === 'hazards') {
    for (const row of data) {
      if (row && Object.prototype.hasOwnProperty.call(row, 'status')) {
        delete row.status;
      }
    }
  }

  // 人员保险导入：若指定了保险类型（导入雇主险 / 导入工伤险），
  // 对未填写保险类型的行自动补齐默认值，确保列表按险种 Tab 正确筛选。
  if (moduleType === 'personnel' && insuranceType) {
    data = data.map((row) => ({ ...row, insurance_type: row.insurance_type || insuranceType }));
  }

  // 安全费用预算：补齐必填/默认值，保证旧模板或无年度列也能正常写入。
  if (moduleType === 'budget') {
    const currentYear = new Date().getFullYear();
    data = data.map((row) => {
      const next = { ...row };
      if (next.budget_year === undefined || next.budget_year === null || next.budget_year === '') {
        let derivedYear = currentYear;
        if (next.plan_time) {
          const pt = String(next.plan_time);
          const m = pt.match(/^(\d{4})/);
          if (m) derivedYear = parseInt(m[1], 10);
        }
        next.budget_year = derivedYear;
      }
      if (next.use_status === undefined || next.use_status === null || next.use_status === '') {
        next.use_status = '未支出';
      }
      // 计划总价未填写时自动计算（单价单位为万元）
      if ((next.plan_total === undefined || next.plan_total === null) && typeof next.plan_quantity === 'number' && typeof next.plan_unit_price === 'number') {
        next.plan_total = Number((next.plan_quantity * next.plan_unit_price).toFixed(4));
      }
      // 未提供预算金额/已用金额时，用计划/支出总价推导（单位均为万元）
      if ((next.budget_amount === undefined || next.budget_amount === null) && typeof next.plan_total === 'number') {
        next.budget_amount = next.plan_total;
      }
      if ((next.spent_amount === undefined || next.spent_amount === null) && typeof next.actual_quantity === 'number' && typeof next.actual_unit_price === 'number') {
        next.spent_amount = Number((next.actual_quantity * next.actual_unit_price).toFixed(4));
      }
      return next;
    });
  }

  // 过滤掉缺少必填字段（name）的记录，避免数据库 NOT NULL 报错
  if (moduleType === 'ledger') {
    const before = data.length;
    data = data.filter(row => row.name && String(row.name).trim() !== '');
    const filtered = before - data.length;
    console.log('[NativeImport] name过滤前:', before, '过滤后:', data.length, '过滤掉:', filtered);
    if (data.length > 0) {
      console.log('[NativeImport] 第一条数据:', JSON.stringify(data[0]));
      console.log('[NativeImport] 字段列表:', Object.keys(data[0]).join(', '));
    }
  }

  // 网格管理（任务四）：写入 grid_inspection_records
  // 1) 由 upload_time 派生 inspection_date（取日期部分）
  // 2) 按 片区/班组 + 网格等级 模糊关联 grid_areas.id（匹配不上留空仍计入该检查人次数）
  if (moduleType === 'grid') {
    data = data.map((row) => {
      let inspectionDate = null;
      // 优先取「日期」列映射的 inspection_date，兼容 Excel 日期序列号(如 46276)与各类日期字符串
      const direct = fixDateValue(row.inspection_date);
      if (direct && direct !== 'Invalid Date') inspectionDate = direct;
      // 无有效「日期」列时才回退回 upload_time 派生（取日期部分）
      if (!inspectionDate && row.upload_time) {
        const d = fixDateValue(row.upload_time);
        if (d && d !== 'Invalid Date') inspectionDate = String(d).slice(0, 10);
      }
      return { ...row, inspection_date: inspectionDate };
    });

    // —— 清洗内嵌图片公式 ——
    // 来源 Excel 的浮动图片被单元格锚定时，会在文本列（典型如「违章人年龄」）留下
    // `=DISPIMG("ID_...")` 一类的公式文本（可长达数百字符）。它是图片引用的残留，并非真实数据，
    // 超出对应 varchar(20) 字段长度限制会导致整行「值太长」写入失败而丢弃。
    // 真实照片内容已由 attachGridImages 从内嵌图片独立抽取，这里将其清空而非入库。
    data = data.map((row) => {
      const clean = {};
      for (const [k, v] of Object.entries(row)) {
        clean[k] = typeof v === 'string' && /^\s*=\s*(?:_xlfn\.)?[A-Za-z]*DISPIMG\s*\(/i.test(v) ? '' : v;
      }
      return clean;
    });

    // —— 姓名模糊匹配自动生成/校正「网格等级」与「职务」 ——
    // 台账仅为网格长巡查记录；人员导入时可能把网格级别、职务写错。
    // 故将检查人姓名(personal_name)与「网格长巡查管理」(grid_areas.name)模糊匹配（防错字），
    // 命中后按其所在网格的 grid_level/position 覆盖生成；未命中则保留导入原值（后续可单元格编辑）。
    // 预取全部在用网格（含 网格等级/职务/片区），JS 侧一次加载 + 逐行模糊匹配，避免逐行查库。
    let importedGridAreas = [];
    try {
      const _ga = await pool.query(
        `SELECT id, name, grid_level, position, area
         FROM grid_areas
         WHERE is_deleted = false AND name IS NOT NULL AND name <> ''`
      );
      importedGridAreas = _ga.rows;
    } catch (_err) {
      importedGridAreas = [];
    }
    // 编辑距离（中文姓名按字符级计算，距离<=1 可捕获单字写错/漏字）
    function _gridLevenshtein(a, b) {
      const m = a.length;
      const n = b.length;
      if (!m) return n;
      if (!n) return m;
      const dp = new Array(n + 1).fill(0).map((_, j) => j);
      for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
          const tmp = dp[j];
          dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
          prev = tmp;
        }
      }
      return dp[n];
    }
    // 模糊匹配：完全相等 / 相互包含（防多字、漏字）/ 3字符及以上且编辑距离<=1（防单字写错）。
    // 2字符姓名不做「编辑距离<=1」匹配——任意两个字都与共享一字的另一人仅差1，易误配；宁缺勿错。
    function _pickGridAreaByName(inputName, areaTeam, providedLevel) {
      const name = String(inputName || '').trim();
      if (!name) return null;
      const cands = importedGridAreas.filter((g) => {
        const gn = String(g.name || '').trim();
        if (!gn) return false;
        if (name === gn) return true;
        if (name.includes(gn) || gn.includes(name)) return true;
        if (Math.max(name.length, gn.length) >= 3 && _gridLevenshtein(name, gn) <= 1) return true;
        return false;
      });
      if (cands.length === 0) return null;
      if (cands.length === 1) return cands[0];
      // 多候选（同名/近名不同级或片）时按 完全相等 > 网格等级 > 片区 消歧，取最贴合者
      let best = cands[0];
      let bestScore = -1;
      for (const g of cands) {
        let score = 0;
        if (String(g.name || '').trim() === name) score += 10;
        if (providedLevel && g.grid_level === providedLevel) score += 3;
        if (
          areaTeam &&
          g.area &&
          (g.area.includes(areaTeam) || areaTeam.includes(g.area))
        ) score += 2;
        if (score > bestScore) {
          bestScore = score;
          best = g;
        }
      }
      return best;
    }
    let nameMatchedCount = 0;
    for (let i = 0; i < data.length; i++) {
      const matched = _pickGridAreaByName(data[i].personnel_name, data[i].area_team, data[i].grid_level);
      if (matched) {
        data[i].grid_level = matched.grid_level;
        if (matched.position) data[i].position = matched.position;
        nameMatchedCount++;
      }
      data[i]._matchedGridArea = matched || null;
    }
    console.log(`[NativeImport] 网格台账按姓名匹配到网格: ${nameMatchedCount}/${data.length}`);

    // —— grid_id 关联 ——
    // 优先采用姓名匹配命中的网格 id；未命中者回退按 片区/班组 + 网格等级 模糊关联（留空仍计入检查次数）。
    const distinctCombos = [...new Set(data.map((r) => `${r.area_team || ''}|||${r.grid_level || ''}`))];
    const gridMatchMap = new Map();
    for (const combo of distinctCombos) {
      const [area, level] = combo.split('|||');
      if (!area) { gridMatchMap.set(combo, null); continue; }
      try {
        const r = await pool.query(
          `SELECT id FROM grid_areas
           WHERE is_deleted = false AND grid_level = $1 AND (name = $2 OR name ILIKE $3)
           ORDER BY id LIMIT 1`,
          [level || '', area, `%${area}%`]
        );
        gridMatchMap.set(combo, r.rows.length ? r.rows[0].id : null);
      } catch (e) {
        gridMatchMap.set(combo, null);
      }
    }
    data = data.map((row) => {
      const combo = `${row.area_team || ''}|||${row.grid_level || ''}`;
      const gridId =
        row._matchedGridArea && row._matchedGridArea.id != null
          ? row._matchedGridArea.id
          : gridMatchMap.get(combo) ?? null;
      const { _matchedGridArea, ...cleanRow } = row;
      return { ...cleanRow, grid_id: gridId };
    });

    // 网格管理：抽取来源 Excel 内嵌图片（三违照片/整改后照片）并按源物理行号关联到各数据行，
    // 回填 image_content / rectified_photo。抽取失败不影响数据主体导入。
    if (data.length > 0) {
      try {
        const imgResult = await attachGridImages(filePath, data);
        console.log('[NativeImport] 网格台账图片关联:', imgResult);
      } catch (imgErr) {
        console.warn('[NativeImport] 网格台账图片关联异常（不影响数据导入）:', imgErr.message);
      }
    }
  }

  // 人员保险（任务8）：共享 employeeResolver 解析 employee.id 并注入服务端快照。
  // 姓名不单独自动匹配；ID/工号矛盾、姓名不一致、零/多候选、缺员工、日期错误、险种不支持、
  // 重复当前保单均逐行标记 _import_error（保留原始行号供 rowErrors 定位），错误行不写入。
  if (moduleType === 'personnel') {
    const rows = [];
    for (let idx = 0; idx < data.length; idx++) {
      const row = { ...data[idx], _import_row_no: idx + 1 };
      const fail = (reason) => { row._import_error = reason; };
      // 日期起止顺序校验
      if (row.start_date && row.expire_date && String(row.start_date) > String(row.expire_date)) {
        fail('date_order_invalid');
        rows.push(row);
        continue;
      }
      // 险种规范化（任务4）：工伤险->工伤保险；意外伤害险/五险/未知 -> unsupported（阻止写库）
      const canonicalType = normalizeInsuranceType(row.insurance_type);
      if (!canonicalType) {
        fail('unsupported_insurance_type');
        rows.push(row);
        continue;
      }
      row.insurance_type = canonicalType;
      // 共享人员解析（任务2）：单条创建/直接导入/通用导入复用同一生产解析器。
      // idCard（证件号码，明文）经 employeeResolver 按 id_card_hash 解析员工（雇主险清单无工号场景）
      const resolved = await resolveEmployee({
        employeeId: row.employee_id,
        employeeCode: row.employee_code,
        idCard: row.id_card,
      });
      if (!resolved.employee) {
        fail(resolved.reason || 'employee_not_found');
        rows.push(row);
        continue;
      }
      const employee = resolved.employee;
      // 姓名附加一致性校验：提供姓名且与主数据不一致 → 逐行失败（姓名不能单独命中）
      if (!isNameConsistent(row.person_name, employee)) {
        fail('name_mismatch');
        rows.push(row);
        continue;
      }
      // 险种必填（规范化后为空即未提供）
      if (!row.insurance_type || String(row.insurance_type).trim() === '') { fail('missing_insurance_type'); rows.push(row); continue; }
      // is_current 值规范化（'是'/'否'/true/false）
      if (row.is_current !== undefined && row.is_current !== null) {
        row.is_current = (row.is_current === true || row.is_current === 1 || String(row.is_current).trim() === '是' || String(row.is_current).trim() === '1');
      } else {
        row.is_current = true;
      }
      // 任务9：当前有效冲突检查不在预处理阶段执行——必须在确认 UPDATE 目标（employee_id+险种+保单号）
      // 之后再以 excludeId=目标ID 检查，否则会把自己识别为冲突导致正常 UPDATE 不可达。
      // 冲突检查由 confirmImportNative 的 personnel 专用阶段执行（见下方模块Type分支）。
      row.employee_id = employee.employee_id;
      row.person_name = employee.name;
      row.department = employee.org_name || '';
      row.position = employee.position_name || '';
      // 内部元数据：_import_row_no / employee_code 仅用于错误定位，写库前由列白名单投影剔除（任务1）
      rows.push(row);
    }
    data = rows;
  }

  // 三违管理：根据花名册岗位自动判断三违类型（仅当为空时填充）+ 按姓名落 violator_id（阶段2）
  let violatorResolveStats = null;
  if (moduleType === 'violation' && data.length > 0) {
    const targetPositions = ['保洁员', '驾驶员', '挂桶工', '转运站操作工', '转运站管理员', '转运站操作员'];
    const allNames = [...new Set(data.map(r => r.violator_name).filter(Boolean))];
    // 姓名 → 候选员工（含 employee_id，用于唯一/重名判定与落键）
    const empByName = new Map();
    if (allNames.length > 0) {
      const placeholders = allNames.map((_, i) => `$${i + 1}`).join(',');
      const empResult = await pool.query(
        `SELECT employee_id, name, org_name, position_name FROM v_employee_org_full
         WHERE name = ANY($1) AND is_deleted = false AND is_current = true`,
        [allNames]
      );
      for (const row of empResult.rows) {
        if (!empByName.has(row.name)) empByName.set(row.name, []);
        empByName.get(row.name).push(row);
      }
    }
    const resolveStats = { resolved: 0, ambiguous: 0, unmatched: 0 };
    data = data.map(row => {
      const name = row.violator_name || '';
      const area = row.area_team || '';
      const candidates = empByName.get(name) || [];
      // 三违类型自动判定（仅当为空）
      let position = null;
      if (area) {
        const hit = candidates.find(e => e.org_name && e.org_name.includes(area));
        if (hit) position = hit.position_name;
      }
      if (!position && candidates.length) position = candidates[0].position_name;
      if ((!row.violation_type_result || row.violation_type_result.trim() === '') &&
          position && targetPositions.some(tp => position.includes(tp))) {
        row.violation_type_result = '违反劳动纪律';
      }
      // 阶段2：按姓名落 violator_id（唯一存活匹配才落键；重名/未匹配保留原文、不落键、不报错）
      if (name) {
        if (candidates.length === 1) {
          const emp = candidates[0];
          row.violator_id = emp.employee_id;
          row.violator_name = emp.name; // 写回标准姓名
          resolveStats.resolved++;
        } else if (candidates.length > 1) {
          resolveStats.ambiguous++; // 重名，不落键，保留原文
        } else {
          resolveStats.unmatched++; // 未匹配，不落键，保留原文
        }
      }
      return row;
    });
    violatorResolveStats = resolveStats;
    console.log('[NativeImport] 三违 violator_id 落键统计:', JSON.stringify(resolveStats));
  }

  // 培训模块（培训考核 training / 培训台账 ledger）：人员落键 employee_id + personnel_id
  // 口径与三违一致：① 身份证 hash 命中 employee.id_card_hash ② 姓名在 v_employee_org_full
  // 唯一存活匹配；重名/未匹配保留原文、不落键、不报错。落键成功写回标准姓名。
  let trainingResolveStats = null;
  if ((moduleType === 'training' || moduleType === 'ledger') && data.length > 0) {
    // ① 身份证 hash → employee
    const empByIdCardHash = new Map();
    const idCards = [...new Set(data.map((r) => String(r.id_card || '').trim()).filter(Boolean))];
    if (idCards.length > 0) {
      try {
        for (const card of idCards) {
          const hash = hashSensitive(card);
          if (!hash) continue;
          const r = await pool.query(
            `SELECT id, name FROM employee WHERE id_card_hash = $1 AND is_deleted = false LIMIT 1`,
            [hash]
          );
          if (r.rows.length > 0) empByIdCardHash.set(card, r.rows[0]);
        }
      } catch (e) {
        console.error('[NativeImport] 培训 id_card hash 查询失败:', e.message);
      }
    }

    // ② 姓名 → v_employee_org_full（唯一存活匹配才落键）
    const empByName = new Map();
    const allNames = [...new Set(data.map((r) => String(r.name || '').trim()).filter(Boolean))];
    if (allNames.length > 0) {
      try {
        const empResult = await pool.query(
          `SELECT employee_id, name, org_name, position_name FROM v_employee_org_full
            WHERE name = ANY($1) AND is_deleted = false AND is_current = true`,
          [allNames]
        );
        for (const row of empResult.rows) {
          if (!empByName.has(row.name)) empByName.set(row.name, []);
          empByName.get(row.name).push(row);
        }
      } catch (e) {
        console.error('[NativeImport] 培训姓名匹配查询失败:', e.message);
      }
    }

    const resolveStats = { resolved: 0, resolvedByIdCard: 0, ambiguous: 0, unmatched: 0 };
    data = data.map((row) => {
      const rawName = String(row.name || '').trim();
      const rawCard = String(row.id_card || '').trim();
      let emp = null;
      let byIdCard = false;
      if (rawCard && empByIdCardHash.has(rawCard)) {
        emp = empByIdCardHash.get(rawCard);
        byIdCard = true;
      } else if (rawName) {
        const candidates = empByName.get(rawName) || [];
        if (candidates.length === 1) emp = candidates[0];
      }
      if (emp) {
        // v_employee_org_full 用 employee_id，employee 表用 id，统一取先者
        const employeeId = emp.employee_id != null ? emp.employee_id : emp.id;
        row.employee_id = employeeId;
        row.personnel_id = employeeId;
        if (emp.name) row.name = emp.name; // 写回标准姓名
        resolveStats.resolved++;
        if (byIdCard) resolveStats.resolvedByIdCard++;
      } else if (rawName) {
        const candidates = empByName.get(rawName) || [];
        if (candidates.length > 1) resolveStats.ambiguous++; // 重名：不落键、保留原文
        else resolveStats.unmatched++;                       // 未匹配：不落键、保留原文
      }
      return row;
    });
    trainingResolveStats = resolveStats;
    console.log('[NativeImport] 培训 employee_id 落键统计:', JSON.stringify(resolveStats));

    // ③ 培训人员(讲师)落键 trainer_id：讲师姓名与员工档案唯一存活匹配
    //    口径与受训人一致：唯一才落键，重名/未匹配保留原文、不落键、不报错。
    let trainerResolveStats = { resolved: 0, ambiguous: 0, unmatched: 0 };
    // 先保证所有行都有 trainer_id 键，维持 INSERT 列集合稳定
    data.forEach((row) => { if (row.trainer_id === undefined) row.trainer_id = null; });
    const allTrainers = [...new Set(data.map((r) => String(r.trainer || '').trim()).filter(Boolean))];
    if (allTrainers.length > 0) {
      const empByTrainer = new Map();
      try {
        const empResult = await pool.query(
          `SELECT employee_id, name FROM v_employee_org_full
            WHERE name = ANY($1) AND is_deleted = false AND is_current = true`,
          [allTrainers]
        );
        for (const row of empResult.rows) {
          if (!empByTrainer.has(row.name)) empByTrainer.set(row.name, []);
          empByTrainer.get(row.name).push(row.employee_id);
        }
        data.forEach((row) => {
          const tname = String(row.trainer || '').trim();
          if (!tname) return;
          const candidates = empByTrainer.get(tname) || [];
          if (candidates.length === 1) {
            row.trainer_id = candidates[0];
            trainerResolveStats.resolved++;
          } else if (candidates.length > 1) {
            trainerResolveStats.ambiguous++;
          } else {
            trainerResolveStats.unmatched++;
          }
        });
      } catch (e) {
        console.error('[NativeImport] 培训讲师姓名匹配查询失败:', e.message);
      }
      console.log('[NativeImport] 培训讲师 trainer_id 落键统计:', JSON.stringify(trainerResolveStats));
    }
  }

  // 三违管理：初始化可选字段键，确保 INSERT 列集合稳定（首行缺字段会导致后续行不写入）
  // 并抽取 Excel 内嵌图片关联到数据行（通用化，复用 extract_violation_images.py）
  if (moduleType === 'violation' && data.length > 0) {
    for (const row of data) {
      if (row.nickname === undefined) row.nickname = null;
      if (row.mark === undefined) row.mark = null;
      if (row.is_supplementary === undefined) row.is_supplementary = null;
      if (row.image_content === undefined) row.image_content = '';
      if (row.rectification_photos === undefined) row.rectification_photos = '';
    }
    try {
      const imgResult = await attachViolationImages(filePath, data);
      console.log('[NativeImport] 三违图片关联:', imgResult);
    } catch (imgErr) {
      console.warn('[NativeImport] 三违图片关联异常（不影响数据导入）:', imgErr.message);
    }
  }

  // 车辆保险：导入落库前清洗厂牌车型 + 兜底商业险合计 + 兜底保费合计，保证重导后存储值与列表展示/筛选一致
  if (moduleType === 'vehicle') {
    for (const row of data) {
      if (row.model) row.model = cleanModel(row.model);
      // 车牌规范化：去除连字符（「鲁N-C7742」与「鲁NC7742」视为同一车牌），
      // 保证冲突匹配（见 conflict 查询 REPLACE 分支）能命中库内带连字符的旧记录并合并更新，
      // 避免同车因格式差异产生重复记录；UPDATE 时规范化后的 plate 也会回写统一格式。
      if (row.plate) row.plate = String(row.plate).replace(/-/g, '').trim();
      // 源表无「商业险合计」列时，按商业险子项（三者/车损/司乘保费）汇总
      const ct = parseFloat(row.commercial_total);
      if (!(ct > 0)) {
        row.commercial_total = (parseFloat(row.third_party_premium) || 0)
          + (parseFloat(row.vehicle_damage_premium) || 0)
          + (parseFloat(row.passenger_premium) || 0);
      }
      // 源表「合计」常仅含交强险+车船税（漏加商业险）；按 交强险+商业险合计+车船税 重算
      const tp = parseFloat(row.total_premium);
      const expectedTp = (parseFloat(row.compulsory_premium) || 0)
                       + (parseFloat(row.commercial_total) || 0)
                       + (parseFloat(row.vehicle_tax) || 0);
      if (!(tp > 0) && expectedTp > 0) {
        row.total_premium = expectedTp;
      }
    }
  }

  const tableName = moduleConfig.targetTable;
  const conflictKey = moduleConfig.conflictKey;

  // 目标表是否含 is_deleted 软删列由真实表结构动态判定（按表缓存）。
  // grid_inspection_records 等无该列的表不拼软删条件，否则批量冲突查询报“列不存在”，
  // 会降级为逐条插入绕过去重，导致重复导入。
  const softDeleteColCache = new Map();
  async function hasSoftDeleteCol(tbl) {
    if (softDeleteColCache.has(tbl)) return softDeleteColCache.get(tbl);
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'is_deleted' LIMIT 1`,
        [tbl]
      );
      const hit = r.rows.length > 0;
      softDeleteColCache.set(tbl, hit);
      return hit;
    } catch (e) {
      // 结构未知时保守跳过软删条件，避免该表无此列导致整条查询失败
      softDeleteColCache.set(tbl, false);
      return false;
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // personnel 模块：预处理标记的错误行（missing/multiple/not_found/id_code_conflict/name_mismatch/
  // date_order_invalid/missing_insurance_type 等）进入逐行错误结果（含原始行号与标识），不写入。
  // 任务9：rowErrors 为稳定结构化对象 {row, reason, message, employeeCode}，不再返回自由文本数组。
  const importRowErrors = [];
  let totalRowsBeforeFilter = data.length;
  if (moduleType === 'personnel') {
    const valid = [];
    for (const row of data) {
      if (row._import_error) {
        importRowErrors.push({
          row: row._import_row_no != null ? row._import_row_no : null,
          reason: row._import_error,
          message: row._import_error,
          employeeCode: row.employee_code != null ? String(row.employee_code) : null,
        });
        continue;
      }
      valid.push(row);
    }
    data = valid;
  }

  console.log('[NativeImport] data length:', data.length);
  if (data.length > 0) {
    console.log('[NativeImport] first row keys:', Object.keys(data[0]));
  }

  const conflictKeys = Array.isArray(conflictKey) ? conflictKey : conflictKey ? [conflictKey] : [];
  // personnel 保留原语义（空组件行走 INSERT 分支，由其专属重复检测判定）；其余模块空/NULL 组件也参与查重
  const requireAllNonEmpty = moduleType === 'personnel';

  const rowsWithConflict = [];
  const rowsWithoutConflict = [];
  for (const row of data) {
    const hasConflictValue = conflictKeys.length > 0 && (!requireAllNonEmpty || conflictKeys.every((k) => row[k] !== undefined && row[k] !== ''));
    if (hasConflictValue) {
      rowsWithConflict.push(row);
    } else {
      rowsWithoutConflict.push(row);
    }
  }

  const existingMap = new Map();
  if (rowsWithConflict.length > 0 && conflictKeys.length > 0) {
    try {
      const values = [];
      const conditions = rowsWithConflict.map((row, rowIdx) => {
        const rowConditions = conflictKeys.map((k, colIdx) => {
          // 空串/undefined 统一按 NULL 传入：IS NOT DISTINCT FROM 能与库内 NULL 匹配，且 NULL 类型无关避免数值列转型错误
          const raw = row[k];
          values.push((raw === null || raw === undefined || raw === '') ? null : raw);
          const paramIdx = rowIdx * conflictKeys.length + colIdx + 1;
          // personnel 保留原 `=`；其余模块用 IS NOT DISTINCT FROM 做 NULL 安全等值匹配
          const op = moduleType === 'personnel' ? '=' : 'IS NOT DISTINCT FROM';
          // vehicle 车牌连字符规范化匹配：库内「鲁N-C7742」与导入值「鲁NC7742」视为同一车牌
          // （导入行 plate 已在 vehicle 预处理分支去连字符）
          const colExpr =
            moduleType === 'vehicle' && k === 'plate'
              ? `REPLACE(${k}, '-', '')`
              : k;
          return `${colExpr} ${op} $${paramIdx}`;
        });
        return `(${rowConditions.join(' AND ')})`;
      }).join(' OR ');
      const hasSoft = await hasSoftDeleteCol(tableName);
      const softDeletedClause = (moduleConfig.reactivateSoftDeleted || !hasSoft) ? '' : ' AND is_deleted = false';
      const existingResult = await pool.query(
        `SELECT * FROM ${tableName} WHERE (${conditions})${softDeletedClause}`,
        values
      );
      for (const row of existingResult.rows) {
        // vehicle：existingMap 的 key 用去连字符后的 plate 构造，与导入行规范化后的 key 对齐
        const key = buildConflictKey(
          moduleType === 'vehicle' && conflictKeys.includes('plate')
            ? { ...row, plate: String(row.plate || '').replace(/-/g, '').trim() }
            : row,
          conflictKeys
        );
        existingMap.set(key, row);
      }
    } catch (e) {
      // 任务9：personnel 模块冲突目标批量查询失败必须 fail-closed——不得把 existingMap 当空继续
      // INSERT（会绕过 UPDATE 目标识别产生重复记录）。其他模块保持原有降级行为。
      if (moduleType === 'personnel') {
        console.error('[NativeImport] 人员保险冲突目标批量查询失败（fail-closed，本次导入中止）:', e.message);
        return {
          success: false,
          inserted: 0,
          updated: 0,
          skipped: data.length,
          total: totalRowsBeforeFilter,
          rowErrors: importRowErrors.concat([{ row: null, reason: 'duplicate_check_failed', message: '冲突目标查询失败，请稍后重试', employeeCode: null }]),
        };
      }
      console.error('[NativeImport] 批量查询失败，降级为逐条处理:', e.message);
    }
  }

  let toInsert = [];
  let toUpdate = [];

  // 任务1（提示词08）：写库对象由显式列白名单投影生成。
  // dbColumns 存在时（如 personnel），批量/逐条/UPDATE 只用白名单列，内部元数据
  // （_import_row_no/_import_error/employee_code 等）绝不进入 SQL 标识符；
  // 列顺序稳定（不依赖第一行偶然拥有的 key），缺失可选字段以 NULL 占位。
  // 任务9：行上下文（原始行号/安全员工标识）与 dbRow 分离，投影后不丢失。
  const dbColumns = Array.isArray(moduleConfig.dbColumns) ? moduleConfig.dbColumns : null;

  function projectToDbColumns(row) {
    if (!dbColumns) return { ...row };
    const out = {};
    for (const col of dbColumns) {
      const v = row[col];
      // 空字符串/undefined/null 统一为 null 占位，保持列顺序与值位置稳定
      out[col] = (v === undefined || v === null || v === '') ? null : v;
    }
    return out;
  }

  /** 构造带行上下文与 dbRow 的写库项（personnel 模块使用；其他模块保持 dbRow 直存） */
  function buildWriteItem(row, extra = {}) {
    const dbRow = projectToDbColumns(row);
    if (!dbColumns) return dbRow;
    return {
      dbRow,
      sourceRowNo: row._import_row_no != null ? row._import_row_no : null,
      sourceEmployeeCode: row.employee_code != null ? String(row.employee_code) : null,
      ...extra,
    };
  }

  // accidents 等模块：批内去重（同一文件/多 sheet 内重复行只插一条），配合 conflictKey 防止重叠导入重复
  const dedupInBatch = moduleConfig.dedupInBatch === true;
  const batchInsertKeys = new Set();
  function pushInsert(row) {
    const item = buildWriteItem(row);
    if (dedupInBatch && conflictKeys.length > 0) {
      const dbRow = item.dbRow || item;
      const key = buildConflictKey(dbRow, conflictKeys);
      if (batchInsertKeys.has(key)) { skipped++; return; }
      batchInsertKeys.add(key);
    }
    toInsert.push(item);
  }

  for (const row of rowsWithoutConflict) {
    pushInsert(row);
  }

  for (const row of rowsWithConflict) {
    const key = buildConflictKey(row, conflictKeys);
    const existing = existingMap.get(key);
    if (existing) {
      if (moduleType === 'violation') {
        skipped++;
      } else {
        toUpdate.push(buildWriteItem(row, { id: existing.id, reactivate: existing.is_deleted === true }));
      }
    } else {
      pushInsert(row);
    }
  }

  // 任务9：personnel 模块专用冲突检查阶段（必须在识别 UPDATE 目标之后执行）。
  //  - 命中明确 UPDATE 目标（同 employee_id + 规范险种 + policy_no）→ 冲突查询 excludeId=目标ID
  //  - 无 UPDATE 目标（INSERT）→ 检查全部当前有效保单（无 excludeId）
  //  - 空保单号不能作为不稳定 UPDATE 标识 → 按 INSERT 场景查重并拒绝并行当前有效记录
  //  - 查询异常 fail-closed（duplicate_check_failed），该行不写库
  // 任务1（提示词11）：批内集合必须是"已接受最终事实"，不是"开始检查"：
  //  - 统一候选列表 { operation, item, sourceRowNo } 按原始源行号稳定排序逐行校验，
  //    不再先全部 INSERT 再全部 UPDATE（文件靠后的 INSERT 不得抢占靠前 UPDATE 的判定）
  //  - active key 仅在全部通过（active 纯函数 true + 无已接受批内同 key + DB 冲突查询成功
  //    + 无外部 active 冲突）后才加入；被 duplicate_active_policy/duplicate_check_failed/
  //    duplicate_target_in_batch 拒绝的行不占用 accepted key，也不阻断后续独立校验
  //  - 同一 UPDATE 目标以源行顺序为准只接受首个"完整通过"的行；首行失败不占位
  //  - 预处理已把 is_current 规范为 boolean（未提供默认 true），此处直接传规范值，
  //    禁止用 !== false 把 null/undefined 提升为 true
  if (moduleType === 'personnel') {
    const batchActiveKeys = new Set();       // 已接受且完整通过校验的 active 最终事实（employee_id + canonicalType）
    const acceptedUpdateTargets = new Set(); // 已接受且完整通过校验的 UPDATE 目标（employee_id + type + policy_no）

    const candidates = [
      ...toInsert.map((item) => ({ operation: 'insert', item, sourceRowNo: item.sourceRowNo != null ? item.sourceRowNo : Number.MAX_SAFE_INTEGER })),
      ...toUpdate.map((item) => ({ operation: 'update', item, sourceRowNo: item.sourceRowNo != null ? item.sourceRowNo : Number.MAX_SAFE_INTEGER })),
    ].sort((a, b) => a.sourceRowNo - b.sourceRowNo);

    const checkedInsert = [];
    const checkedUpdate = [];
    for (const cand of candidates) {
      const { operation, item } = cand;
      const r = item.dbRow || item;
      const failRow = (reason, message) => {
        importRowErrors.push({ row: item.sourceRowNo, reason, message, employeeCode: item.sourceEmployeeCode });
        skipped++;
      };
      // UPDATE 目标重复：仅首个"完整通过"的目标占用；首行失败时后续行独立校验
      if (operation === 'update') {
        const targetKey = `${r.employee_id}|${r.insurance_type}|${String(r.policy_no || '')}`;
        if (acceptedUpdateTargets.has(targetKey)) {
          failRow('duplicate_target_in_batch', '同一续保/更新目标（员工+险种+保单号）在文件中重复出现，仅接受第一条');
          continue;
        }
      }
      const isActive = r.employee_id != null && r.insurance_type != null
        && isPolicyActiveOnBusinessDay({ isCurrent: r.is_current, startDate: r.start_date, expireDate: r.expire_date });
      if (isActive) {
        const key = `${r.employee_id}|${r.insurance_type}`;
        if (batchActiveKeys.has(key)) {
          failRow('duplicate_active_policy_in_batch', `本批次已接受同一员工同险种（${r.insurance_type}）的当前有效保单`);
          continue;
        }
        // 数据库冲突查询成功且无外部冲突后才可视为"已接受"（失败行不占 key）
        const conflict = operation === 'update'
          ? await findActivePolicyConflict({ employeeId: r.employee_id, insuranceType: r.insurance_type, excludeId: item.id })
          : await findActivePolicyConflict({ employeeId: r.employee_id, insuranceType: r.insurance_type });
        if (conflict.error) {
          failRow('duplicate_check_failed', '重复保单检查失败，请稍后重试');
          continue;
        }
        if (conflict.conflict) {
          failRow('duplicate_active_policy', operation === 'update'
            ? `排除更新目标后仍存在当前有效${r.insurance_type}（保单ID ${conflict.conflict.id}）`
            : `已存在当前有效${r.insurance_type}（保单ID ${conflict.conflict.id}）`);
          continue;
        }
        batchActiveKeys.add(key); // 完整通过后才占用 accepted key
      }
      if (operation === 'update') {
        acceptedUpdateTargets.add(`${r.employee_id}|${r.insurance_type}|${String(r.policy_no || '')}`);
        checkedUpdate.push(item);
      } else {
        checkedInsert.push(item);
      }
    }
    toInsert = checkedInsert;
    toUpdate = checkedUpdate;
  }
  console.log('[NativeImport] 待插入:', toInsert.length, '待更新:', toUpdate.length, '已跳过:', skipped);

  const BATCH_SIZE = 100;

  if (toInsert.length > 0) {
    // 白名单优先：列顺序稳定；无白名单的模块保留旧行为（Object.keys 首行）
    // 任务9：personnel 写库项为 { dbRow, sourceRowNo, sourceEmployeeCode }，取值用 item.dbRow
    const firstItem = toInsert[0];
    // P3-04-00.2 (F-03)：隐患新建行的生命周期状态只由服务端常量注入。
    // 1) dbColumns 已排除 status ⇒ Excel 的任何取值都进不了列清单；
    // 2) 这里为 INSERT 显式补 canonical 初始态，避免落回列默认值 '未完成'（历史词汇，F-05）；
    // 3) UPDATE 分支仍只用 dbColumns，不注入 ⇒ 重导入绝不会把已整改隐患打回初始态。
    const insertConstants = (moduleType === 'hazards') ? { status: HAZARD_STATUS.DISCOVERED } : {};
    const constantKeys = Object.keys(insertConstants);
    const columns = [
      ...(dbColumns || Object.keys(firstItem.dbRow || firstItem)),
      ...constantKeys,
    ];
    const getRow = (item) => (item && item.dbRow) ? item.dbRow : item;
    const valueFor = (row, col) => (
      Object.prototype.hasOwnProperty.call(insertConstants, col)
        ? insertConstants[col]
        : (row[col] === undefined ? null : row[col])
    );
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const placeholders = [];
      const values = [];
      let paramIdx = 1;
      for (const item of batch) {
        const row = getRow(item);
        const rowPlaceholders = columns.map((_, ci) => `$${paramIdx + ci}`).join(', ');
        placeholders.push(`(${rowPlaceholders})`);
        for (const col of columns) {
          values.push(valueFor(row, col));
        }
        paramIdx += columns.length;
      }
      try {
        await pool.query(
          `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
          values
        );
        inserted += batch.length;
      } catch (e) {
        console.error(`[NativeImport] 批量插入失败 (batch ${i}-${i + batch.length}):`, e.message);
        console.error('[NativeImport] 失败批次第一条数据:', JSON.stringify(batch[0]));
        console.error('[NativeImport] 列名:', columns.join(', '));
        let firstRowErrorLogged = false;
        for (const item of batch) {
          const row = getRow(item);
          try {
            // 逐条降级 INSERT 同样使用白名单列（与批量路径一致），内部元数据不泄漏
            const cols = columns;
            const ph = cols.map((_, ci) => `$${ci + 1}`).join(', ');
            await pool.query(
              `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${ph})`,
              cols.map(c => valueFor(row, c))
            );
            inserted++;
          } catch (e2) {
            if (!firstRowErrorLogged) {
              console.error('[NativeImport] 逐条插入第一条失败数据:', JSON.stringify(row));
              console.error('[NativeImport] 逐条插入错误:', e2.message);
              firstRowErrorLogged = true;
            }
            // 任务9：保留原始行号并返回结构化安全错误（不泄漏 e2.message 的列名/连接信息）
            if (moduleType === 'personnel') {
              importRowErrors.push({ row: item.sourceRowNo, reason: 'write_failed', message: '写入失败，请稍后重试', employeeCode: item.sourceEmployeeCode });
            } else {
              importRowErrors.push(`${item.sourceRowNo != null ? `第${item.sourceRowNo}行` : ''} 逐条写入失败: ${e2.message}`);
            }
            skipped++;
          }
        }
      }
    }
  }

  for (const item of toUpdate) {
    // 任务9：personnel 写库项为 { dbRow, sourceRowNo, id, reactivate }
    const row = (item && item.dbRow) ? item.dbRow : item;
    const id = item.id;
    const reactivate = item.reactivate;
    const sourceRowNo = item.sourceRowNo;
    const sourceEmployeeCode = item.sourceEmployeeCode;
    try {
      const setClauses = [];
      const values = [];
      let idx = 0;
      // UPDATE 同样只使用白名单列（personnel 等有 dbColumns 的模块）；
      // 无白名单模块保留旧行为（Object.entries 全字段）
      // P3-04-00.2 (F-03)：第三道锁——即便将来有人把 status 加回 dbColumns，
      // 重导入也绝不改写隐患生命周期（否则会把已整改/已关闭的隐患打回初始态）。
      const updateKeys = (dbColumns || Object.keys(row))
        .filter(k => !(moduleType === 'hazards' && k === 'status'));
      for (const key of updateKeys) {
        const value = row[key];
        if (key !== 'id' && value !== undefined && value !== null && value !== '') {
          idx++;
          setClauses.push(`${key} = $${idx}`);
          values.push(value);
        }
      }
      if (reactivate) {
        idx++;
        setClauses.push(`is_deleted = $${idx}`);
        values.push(false);
      }
      if (setClauses.length) {
        idx++;
        values.push(id);
        await pool.query(
          `UPDATE ${tableName} SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
          values
        );
      }
      updated++;
    } catch (e) {
      // 任务9：UPDATE 失败保留行号并返回结构化安全错误（不泄漏 e.message）
      console.error(`[NativeImport] 更新失败:`, e.message);
      if (moduleType === 'personnel') {
        importRowErrors.push({ row: sourceRowNo, reason: 'update_failed', message: '更新失败，请稍后重试', employeeCode: sourceEmployeeCode });
      }
      skipped++;
    }
  }

  // 任务4（提示词11）：导入结果状态诚实表达 imported/partial/failed。
  //  - imported：有成功写入且无跳过/错误
  //  - partial：有成功写入且有跳过/错误
  //  - failed：零成功写入（存在跳过/错误或空结果），不得虚报为完整成功
  const wroteCount = inserted + updated;
  const hasErrors = skipped > 0 || importRowErrors.length > 0;
  const outcome = (!hasErrors && wroteCount > 0) ? 'imported' : (wroteCount > 0 ? 'partial' : 'failed');

  try {
    await pool.query(
      `UPDATE file_records SET module_type = $1, status = $2 WHERE id = $3`,
      [moduleType, outcome, fileRecordId]
    );
  } catch (e) {
    // 文件状态更新失败：不得先返回成功；仅服务端日志 + 安全错误（不泄漏 SQL/host/port 文本）
    console.error('[NativeImport] file_records 状态更新失败（不向前端泄漏）:', e.message);
    return {
      success: false,
      error: '文件状态更新失败，请稍后重试',
      inserted,
      updated,
      skipped,
      total: totalRowsBeforeFilter,
      outcome,
      ...(importRowErrors.length > 0 ? { rowErrors: importRowErrors } : {}),
      ...(violatorResolveStats ? { violatorResolve: violatorResolveStats } : {}),
    };
  }

  // 任务四：网格检查记录导入完成后，触发完成率重算（写回 grid_areas.completion_rate）
  if (moduleType === 'grid' && isConnected()) {
    try {
      const recalc = await gridCompletionService.recalculateAllCompletionRates();
      console.log(`[NativeImport] 网格完成率重算完成，影响 ${recalc.updated} 个网格`);
    } catch (e) {
      console.warn('[NativeImport] 网格完成率重算失败（不影响导入结果）:', e.message);
    }
    // 网格长月度缺巡扣分：台账刚导入，立即对「本次台账对应月份」的在评/待审核周期做幂等扫描
    // （补传台账可让缺次归零回退扣分；该月无台账由服务内 no-ledger-data 守卫跳过，不写扣分）
    // 仅扫 in_progress/pending_review，绝不自动改动 reviewed/frozen 周期
    try {
      const months = new Set(
        (data || [])
          .map((row) => (row.inspection_date ? String(row.inspection_date).slice(0, 7) : null))
          .filter(Boolean)
      );
      for (const month of months) {
        const [year, m] = String(month).split('-').map(Number);
        if (!year || !m) continue;
        const cycles = (
          await pool.query(
            `SELECT id FROM hse_assessment_cycle
             WHERE is_deleted=FALSE
               AND assessment_year=$1 AND assessment_month=$2
               AND status IN ('in_progress','pending_review')
             ORDER BY id DESC`,
            [year, m]
          )
        ).rows;
        for (const c of cycles) {
          const r = await gridUncheckedDeduction.syncGridUncheckedDeductions(c.id);
          if (r && r.ok && r.affected > 0) {
            console.log(`[NativeImport] 周期#${c.id}（${month}）网格缺巡扣分同步完成，受影响 ${r.affected} 个对象`);
          }
        }
      }
    } catch (e) {
      console.warn('[NativeImport] 网格缺巡扣分同步失败（不影响导入结果）:', e.message);
    }
  }

  return {
    success: true,
    inserted,
    updated,
    skipped,
    total: totalRowsBeforeFilter,
    outcome,
    ...(importRowErrors.length > 0 ? { rowErrors: importRowErrors } : {}),
    // 人员落键统计（响应 + 日志双输出，便于业务核对落键率）
    ...(violatorResolveStats ? { violatorResolve: violatorResolveStats } : {}),
    ...(trainingResolveStats ? { trainingResolve: trainingResolveStats } : {}),
  };
}

module.exports = {
  parse,
  confirm,
  rollback,
  template,
  upload,
  confirmImportNative,
};

