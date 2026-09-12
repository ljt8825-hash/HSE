const { pool, testConnection } = require('./config/db');

async function init() {
  await testConnection();
  console.log('[TrainingInit] 开始培训考核模块初始化...\n');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ========== 1. 动态筛选器 ==========
    console.log('【1】动态筛选器');
    const filterDefs = [
      // 培训计划
      { mc:'training_plan', fn:'keyword', label:'关键词', ct:'input', ds:null, do:[], ph:'请输入计划名称/编号', hc:'hse_training_plan', so:1, w:220 },
      { mc:'training_plan', fn:'status', label:'计划状态', ct:'select', ds:'enum', do:[{v:'draft',l:'草稿'},{v:'pending_approval',l:'待审批'},{v:'approved',l:'已批准'},{v:'in_progress',l:'进行中'},{v:'completed',l:'已完成'}], ph:'请选择状态', hc:'hse_training_plan', so:2, w:180 },
      { mc:'training_plan', fn:'plan_type', label:'计划类型', ct:'select', ds:'api', do:[], ph:'请选择类型', hc:'hse_training_plan', so:3, w:180 },
      { mc:'training_plan', fn:'target_dept_id', label:'目标部门', ct:'select', ds:'api', do:[], ph:'请选择部门', hc:'hse_training_plan', so:4, w:200 },
      { mc:'training_plan', fn:'date_range', label:'计划时间', ct:'range', ds:'date', do:[], ph:'请选择时间范围', hc:'hse_training_plan', so:5, w:260 },

      // 培训记录
      { mc:'training_record', fn:'keyword', label:'关键词', ct:'input', ds:null, do:[], ph:'请输入培训标题/员工姓名', hc:'hse_training_record', so:1, w:220 },
      { mc:'training_record', fn:'employee_id', label:'参训人员', ct:'select', ds:'api', do:[], ph:'请选择人员', hc:'hse_training_record', so:2, w:200 },
      { mc:'training_record', fn:'dept_id', label:'所属部门', ct:'select', ds:'api', do:[], ph:'请选择部门', hc:'hse_training_record', so:3, w:200 },
      { mc:'training_record', fn:'training_type', label:'培训类型', ct:'select', ds:'api', do:[], ph:'请选择类型', hc:'hse_training_record', so:4, w:180 },
      { mc:'training_record', fn:'has_checkin', label:'签到状态', ct:'select', ds:'enum', do:[{v:'true',l:'已签到'},{v:'false',l:'未签到'}], ph:'请选择', hc:'hse_training_record', so:5, w:160 },
      { mc:'training_record', fn:'date_range', label:'培训日期', ct:'range', ds:'date', do:[], ph:'请选择日期范围', hc:'hse_training_record', so:6, w:260 },

      // 考核管理
      { mc:'assessment', fn:'keyword', label:'关键词', ct:'input', ds:null, do:[], ph:'请输入考核标题/员工姓名', hc:'hse_assessment', so:1, w:220 },
      { mc:'assessment', fn:'assessment_type', label:'考核类型', ct:'select', ds:'enum', do:[{v:'theory',l:'理论考试'},{v:'practical',l:'实操考核'},{v:'comprehensive',l:'综合考核'}], ph:'请选择类型', hc:'hse_assessment', so:2, w:180 },
      { mc:'assessment', fn:'grade', label:'考核等级', ct:'select', ds:'enum', do:[{v:'excellent',l:'优秀'},{v:'good',l:'良好'},{v:'pass',l:'合格'},{v:'fail',l:'不合格'}], ph:'请选择等级', hc:'hse_assessment_grade', so:3, w:180 },
      { mc:'assessment', fn:'is_pass', label:'是否合格', ct:'select', ds:'enum', do:[{v:'true',l:'合格'},{v:'false',l:'不合格'}], ph:'请选择', hc:'hse_assessment', so:4, w:160 },
      { mc:'assessment', fn:'employee_id', label:'考核人员', ct:'select', ds:'api', do:[], ph:'请选择人员', hc:'hse_assessment', so:5, w:200 },
      { mc:'assessment', fn:'dept_id', label:'所属部门', ct:'select', ds:'api', do:[], ph:'请选择部门', hc:'hse_assessment', so:6, w:200 },
      { mc:'assessment', fn:'date_range', label:'考核日期', ct:'range', ds:'date', do:[], ph:'请选择日期范围', hc:'hse_assessment', so:7, w:260 },

      // 证书管理
      { mc:'certificate', fn:'keyword', label:'关键词', ct:'input', ds:null, do:[], ph:'请输入证书编号/名称/员工姓名', hc:'hse_certificate', so:1, w:240 },
      { mc:'certificate', fn:'cert_type', label:'证书类型', ct:'select', ds:'api', do:[], ph:'请选择类型', hc:'hse_certificate', so:2, w:200 },
      { mc:'certificate', fn:'status', label:'证书状态', ct:'select', ds:'enum', do:[{v:'valid',l:'有效'},{v:'expiring',l:'临期'},{v:'expired',l:'已过期'},{v:'revoked',l:'已吊销'}], ph:'请选择状态', hc:'hse_certificate_expiry', so:3, w:180 },
      { mc:'certificate', fn:'employee_id', label:'持证人', ct:'select', ds:'api', do:[], ph:'请选择人员', hc:'hse_certificate', so:4, w:200 },
      { mc:'certificate', fn:'dept_id', label:'所属部门', ct:'select', ds:'api', do:[], ph:'请选择部门', hc:'hse_certificate', so:5, w:200 },
      { mc:'certificate', fn:'valid_range', label:'有效期', ct:'range', ds:'date', do:[], ph:'请选择有效期范围', hc:'hse_certificate_expiry', so:6, w:260 },

      // 综合考核
      { mc:'comprehensive', fn:'keyword', label:'关键词', ct:'input', ds:null, do:[], ph:'请输入员工姓名/部门', hc:'hse_comprehensive', so:1, w:220 },
      { mc:'comprehensive', fn:'grade', label:'综合等级', ct:'select', ds:'enum', do:[{v:'A',l:'优秀(A)'},{v:'B',l:'良好(B)'},{v:'C',l:'合格(C)'},{v:'D',l:'不合格(D)'}], ph:'请选择等级', hc:'hse_comprehensive', so:2, w:180 },
      { mc:'comprehensive', fn:'period_year', label:'考核年度', ct:'select', ds:'enum', do:[{v:'2026',l:'2026年'},{v:'2025',l:'2025年'}], ph:'请选择年度', hc:'hse_comprehensive', so:3, w:160 },
      { mc:'comprehensive', fn:'dept_id', label:'所属部门', ct:'select', ds:'api', do:[], ph:'请选择部门', hc:'hse_comprehensive', so:4, w:200 },
    ];

    for (const f of filterDefs) {
      const exist = await client.query('SELECT id FROM hse_filter_config WHERE module_code=$1 AND field_name=$2', [f.mc, f.fn]);
      if (exist.rows.length > 0) { console.log(`  ⏭  ${f.mc}.${f.fn}`); continue; }
      await client.query(`
        INSERT INTO hse_filter_config (module_code,field_name,label,control_type,data_source,data_options,placeholder,help_code,sort_order,width,is_visible,is_required,status,remark)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [f.mc,f.fn,f.label,f.ct,f.ds,JSON.stringify(f.do),f.ph,f.hc,f.so,f.w,true,false,'active','']);
      console.log(`  ✅ ${f.mc}.${f.fn}`);
    }

    // ========== 2. 统计卡片 ==========
    console.log('\n【2】统计卡片');
    const cardDefs = [
      { cc:'training_plan_total', ct:'培训计划总数', mc:'training_plan', dc:'overview', icon:'lucide:calendar-days', sc:'info', api:'/api/training-assessment/stats/overview', params:{field:'plans.total'}, ca:'route', tr:'/training/plans', fc:{}, hc:'hse_training_plan', so:40, w:1 },
      { cc:'training_plan_in_progress', ct:'进行中计划', mc:'training_plan', dc:'overview', icon:'lucide:play-circle', sc:'warning', api:'/api/training-assessment/stats/overview', params:{field:'plans.byStatus',key:'in_progress'}, ca:'filter', tr:'/training/plans', fc:{status:'in_progress'}, hc:'hse_training_plan', so:41, w:1 },
      { cc:'training_plan_completed', ct:'已完成计划', mc:'training_plan', dc:'overview', icon:'lucide:check-circle', sc:'success', api:'/api/training-assessment/stats/overview', params:{field:'plans.byStatus',key:'completed'}, ca:'filter', tr:'/training/plans', fc:{status:'completed'}, hc:'hse_training_plan', so:42, w:1 },
      { cc:'training_hours_total', ct:'年度培训学时', mc:'training_record', dc:'overview', icon:'lucide:clock', sc:'info', api:'/api/training-assessment/stats/overview', params:{field:'training.totalHours'}, ca:'route', tr:'/training/records', fc:{}, hc:'hse_training_record', so:43, w:1 },
      { cc:'training_record_count', ct:'培训记录数', mc:'training_record', dc:'overview', icon:'lucide:book-open', sc:'info', api:'/api/training-assessment/stats/overview', params:{field:'training.recordCount'}, ca:'route', tr:'/training/records', fc:{}, hc:'hse_training_record', so:44, w:1 },
      { cc:'assessment_pass', ct:'考核合格数', mc:'assessment', dc:'overview', icon:'lucide:check-circle-2', sc:'success', api:'/api/training-assessment/stats/overview', params:{field:'assessments.pass'}, ca:'filter', tr:'/training/assessments', fc:{is_pass:'true'}, hc:'hse_assessment', so:45, w:1 },
      { cc:'assessment_fail', ct:'考核不合格数', mc:'assessment', dc:'overview', icon:'lucide:x-circle', sc:'danger', api:'/api/training-assessment/stats/overview', params:{field:'assessments.fail'}, ca:'filter', tr:'/training/assessments', fc:{is_pass:'false'}, hc:'hse_assessment', so:46, w:1 },
      { cc:'assessment_excellent', ct:'优秀(≥90分)', mc:'assessment', dc:'overview', icon:'lucide:award', sc:'success', api:'/api/training-assessment/stats/overview', params:{field:'assessments.byGrade',key:'excellent'}, ca:'filter', tr:'/training/assessments', fc:{grade:'excellent'}, hc:'hse_assessment_grade', so:47, w:1 },
      { cc:'cert_valid', ct:'有效证书数', mc:'certificate', dc:'overview', icon:'lucide:badge-check', sc:'success', api:'/api/training-assessment/stats/overview', params:{field:'certificates.valid'}, ca:'filter', tr:'/training/certificates', fc:{status:'valid'}, hc:'hse_certificate', so:48, w:1 },
      { cc:'cert_expiring', ct:'临期证书数', mc:'certificate', dc:'overview', icon:'lucide:alert-triangle', sc:'warning', api:'/api/training-assessment/stats/overview', params:{field:'certificates.expiring'}, ca:'filter', tr:'/training/certificates', fc:{status:'expiring'}, hc:'hse_certificate_expiry', so:49, w:1 },
      { cc:'cert_expired', ct:'过期证书数', mc:'certificate', dc:'overview', icon:'lucide:alert-octagon', sc:'danger', api:'/api/training-assessment/stats/overview', params:{field:'certificates.expired'}, ca:'filter', tr:'/training/certificates', fc:{status:'expired'}, hc:'hse_certificate_expiry', so:50, w:1 },
      { cc:'comprehensive_A', ct:'综合考核A级', mc:'comprehensive', dc:'overview', icon:'lucide:trophy', sc:'success', api:'/api/training-assessment/comprehensive', params:{field:'list',filter:{grade:'A'}}, ca:'filter', tr:'/training/comprehensive', fc:{grade:'A'}, hc:'hse_comprehensive', so:51, w:1 },
    ];

    for (const c of cardDefs) {
      const exist = await client.query('SELECT id FROM hse_dashboard_card_config WHERE card_code=$1', [c.cc]);
      if (exist.rows.length > 0) { console.log(`  ⏭  ${c.cc}`); continue; }
      await client.query(`
        INSERT INTO hse_dashboard_card_config (card_code,card_title,module_code,dashboard_code,card_type,icon,semantic_color,data_source_api,data_source_params,click_action,target_route,filter_conditions,help_code,sort_order,width,is_visible,status,remark)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `, [c.cc,c.ct,c.mc,c.dc,'stat',c.icon,c.sc,c.api,JSON.stringify(c.params),c.ca,c.tr,JSON.stringify(c.fc),c.hc,c.so,c.w,true,'active','']);
      console.log(`  ✅ ${c.cc}`);
    }

    // ========== 3. 帮助知识库 ==========
    console.log('\n【3】帮助知识库');
    const helpDefs = [
      { mc:'hse_training_control', title:'培训考核模块概述', c:'培训考核是HSE系统的核心业务模块之一，实现培训计划制定、培训实施记录、考核评价、证书管理、综合考核结果的全流程管理。支持与人员管理、三违记录、隐患整改、风险管控等模块数据联动，形成人员能力评价的多源数据汇聚。', fd:'', cr:'综合得分=培训学时(加权)+考核成绩(加权)+三违(可选)+隐患(可选)+风险(可选)，全部配置化可调整', gr:'培训计划：年度/季度/月度计划自动编号；培训记录：签到+学时自动汇总；考核：四级等级制(优秀≥90/良好≥75/合格≥60/不合格<60)；证书：有效期自动计算+临期/过期状态标记', rr:'培训考核↔人员管理(员工ID)；培训考核↔三违记录(扣分来源)；培训考核↔隐患整改(加分依据)；培训考核↔风险管控(责任落实)；培训考核→安全总览(统计卡片)', pr:'公司总经理：全权限+综合考核审批；部门负责人：本部门培训计划与考核管理；乡镇主管：本中心培训与考核；管理员：数据维护与流程跟踪；员工：查看个人培训/考核/证书', so:1 },
      { mc:'hse_training_plan', title:'培训计划说明', c:'培训计划模块支持制定年度、季度、月度培训计划，包括计划名称、类型、对象、时间、学时、讲师、地点等信息。支持按部门、岗位、人员范围发布。', fd:'计划名称、计划类型(新员工/常规/专项/季节/复审/应急/驾驶员/岗位)、目标部门/岗位/人员、计划起止日期、计划学时、讲师、地点、培训大纲、考核方式', cr:'计划状态机：草稿→待审批→已批准→进行中→已完成/已取消', gr:'计划编号自动生成TP+时间戳；计划状态流转需按权限审批', rr:'培训计划→培训记录(一对多)；培训计划→考核记录(关联)', pr:'乡镇主管/管理员可创建；部门负责人可审批二级及以下计划；公司总经理可审批一级计划', so:2 },
      { mc:'hse_training_record', title:'培训记录说明', c:'培训记录模块记录每次培训的实际实施情况，包括参训人员、签到情况、实际学时、培训照片/附件等。支持从培训计划生成培训记录，也支持独立创建。', fd:'培训标题、培训类型、培训日期、起止时间、计划学时、实际学时、地点、讲师、参训人员(EmployeeSelector)、签到状态、考核结果、考核成绩、证书编号', cr:'实际学时=结束时间-开始时间(向下取整到0.5小时)；年度最低学时：安全员48h/特种作业24h/一般员工16h/新员工24h', gr:'签到状态自动标记；学时自动汇总；培训照片附件支持批量上传', rr:'培训记录→培训计划(多对一)；培训记录→员工(多对一)；培训记录→附件(一对多)', pr:'管理员/乡镇主管可创建培训记录；员工可签到并查看个人记录', so:3 },
      { mc:'hse_assessment', title:'考核管理说明', c:'考核管理模块支持理论考试、实操考核、综合评价三种考核类型。考核结果采用四级等级制，考核成绩可关联三违记录、隐患整改结果作为加分或扣分依据。', fd:'考核标题、考核类型(理论/实操/综合)、关联培训计划/记录、考核日期、考核人员(EmployeeSelector)、原始分数、合格线、三违扣分、隐患加分、风险落实分、最终得分、等级、考核人', cr:'最终得分=原始分数-三违扣分+隐患加分+风险落实分；合格判定：最终得分≥合格线；等级划分：≥90优秀/≥75良好/≥60合格/<60不合格', gr:'考核编号自动生成AS+时间戳；补考最多3次，补考间隔7天；三违每次扣5分，季度最多扣20分；隐患及时整改每条加5分', rr:'考核记录→员工(多对一)；考核记录→三违记录(扣分来源关联)；考核记录→隐患记录(加分依据关联)；考核记录→综合考核(数据源)', pr:'管理员负责考核录入与评分；部门负责人可查看本部门考核结果；公司总经理可查看全公司考核', so:4 },
      { mc:'hse_assessment_grade', title:'考核等级划分规则', c:'考核结果采用四级等级制，所有等级判定规则完全配置化，可通过 training-assessment-rule.json 调整。', fd:'', cr:'等级判定基于最终得分：优秀≥90分，良好≥75分且<90分，合格≥60分且<75分，不合格<60分。合格线默认60分，实操考核默认70分。', gr:'等级与语义色映射：优秀=success(绿)，良好=info(蓝)，合格=warning(黄)，不合格=danger(红)。', rr:'考核等级→综合考核(占权重40%)', pr:'', so:5 },
      { mc:'hse_certificate', title:'证书管理说明', c:'证书管理模块支持各类安全生产相关证书的全生命周期管理，包括证书颁发、有效期管理、复审提醒、状态标记。支持证书附件上传。', fd:'证书编号、证书类型(安全管理人员证/特种作业操作证/岗位作业许可证/急救证/消防安全证/危化品上岗证/培训合格证)、持证人(EmployeeSelector)、发证机关、发证日期、生效日期、失效日期、有效期年限、复审日期、是否长期有效、证书附件', cr:'证书状态自动计算：有效=当前日期<失效日期-30天；临期=距离失效日期≤30天；过期=已超过失效日期；吊销=手动标记。', gr:'证书状态每天自动刷新；临期提前30天开始提醒，临期30天→每周1次，15天→每周2次，7天→每天1次，过期→每天2次；复审提前90天提醒。', rr:'证书→员工(多对一)；证书→附件(一对多)；证书→培训记录(关联发证培训)', pr:'管理员负责证书录入与维护；员工可查看个人证书并申请复审；乡镇主管可提醒本中心证书临期人员', so:6 },
      { mc:'hse_certificate_expiry', title:'证书有效期与临期规则', c:'证书有效期与临期/过期状态计算完全配置化，支持按证书类型设置不同有效期年限和提前提醒时间。', fd:'', cr:'临期阈值默认30天；各证书类型有效期：安全管理人员证3年/特种作业6年/岗位作业许可1年/急救证2年/消防安全证3年/危化品上岗证2年/培训合格证长期有效。', gr:'提醒频率配置化：临期30天每周1次，15天每周2次，7天每天1次，过期每天2次。复审提前90天提醒。', rr:'临期/过期状态→安全总览(统计卡片展示)；临期提醒→通知中心推送', pr:'', so:7 },
      { mc:'hse_comprehensive', title:'综合考核说明', c:'综合考核模块汇聚多源业务数据，形成员工的综合安全能力评价。体现"考核不是单一模块数据"的原则，所有数据来源均可追溯。', fd:'考核周期(季度/年度)、员工信息、各维度得分(培训学时/考核成绩/三违/隐患/风险)、综合得分、综合等级(A/B/C/D)、各维度数据来源、计算详情', cr:'综合得分=培训学时得分×权重(默认40%) + 考核成绩×权重(默认40%) + 隐患整改×权重(默认10%) + 风险落实×权重(默认10%)。三违维度默认关闭可配置开启。等级：A≥90/B≥75/C≥60/D<60。所有权重配置化可调整。', gr:'每季度自动计算或手动触发重算；计算过程保留详细日志，每一项得分可追溯到具体业务记录；支持审批后锁定结果。', rr:'数据源：培训记录(学时)、考核记录(成绩)、三违记录(可选扣分)、隐患记录(整改及时性)、风险点(责任落实率)。结果→安全总览(统计卡片)。', pr:'管理员可触发重算；公司总经理可审批综合考核结果；部门负责人可查看本部门；员工可查看个人结果。', so:8 },
      { mc:'hse_training_import', title:'数据导入说明', c:'培训考核模块支持培训记录、考核记录、证书信息的Excel批量导入。', fd:'', cr:'', gr:'复用统一导入能力；支持模板下载；支持错误记录下载与追溯；支持批量跳过错误行。人员关联优先使用员工编号，禁止仅依赖姓名。', rr:'', pr:'管理员具备导入权限', so:9 },
      { mc:'hse_training_data_source', title:'数据来源与联动说明', c:'培训考核模块的数据来源涵盖多个业务模块，形成完整的人员安全能力评价数据链。', fd:'', cr:'', gr:'1. 培训计划：管理员/乡镇主管创建；2. 培训记录：培训实施后登记，签到可由员工自助完成；3. 考核成绩：考核后录入评分，三违/隐患自动联动加减分；4. 证书信息：管理员录入或批量导入，状态自动计算；5. 综合考核：汇聚上述所有数据按规则计算。', rr:'培训考核→人员管理(员工ID主关联)；培训考核→三违(扣分)；培训考核→隐患(加分)；培训考核→风险(责任落实)；培训考核→安全总览(12张统计卡片)。', pr:'', so:10 },
    ];

    for (const h of helpDefs) {
      const exist = await client.query('SELECT id FROM hse_business_help WHERE menu_code=$1', [h.mc]);
      if (exist.rows.length > 0) { console.log(`  ⏭  ${h.mc}`); continue; }
      await client.query(`
        INSERT INTO hse_business_help (menu_code,title,content,field_description,calculate_rule,generate_rule,relation_rule,permission_rule,sort_order,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [h.mc,h.title,h.c,h.fd,h.cr,h.gr,h.rr,h.pr,h.so,'active']);
      console.log(`  ✅ ${h.mc}`);
    }

    await client.query('COMMIT');
    console.log('\n[TrainingInit] ✅ 培训考核模块初始化完成！');
    pool.end();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[TrainingInit] ❌ 失败:', err.message);
    pool.end();
    throw err;
  } finally {
    client.release();
  }
}

init().catch(err => { console.error(err); process.exit(1); });
