-- ============================================================
-- HSE 安全管理系统 — 智能导入功能数据库架构
-- 文件: import_schema.sql
-- 说明: 增强 file_records、新建 import_logs / field_mapping_config、
--       为所有业务表增加通用字段
-- 执行方式: psql -U postgres -d safety_dashboard -f import_schema.sql
-- ============================================================

-- ============ 0. 扩展 ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ============ 1. 增强 file_records 表 ============
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS module_type VARCHAR(50);
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS data_period DATE;
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS file_hash CHAR(64);
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'uploaded';
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS import_job_id UUID;
ALTER TABLE file_records ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 给 file_records 加索引
CREATE INDEX IF NOT EXISTS idx_file_records_module_type ON file_records(module_type);
CREATE INDEX IF NOT EXISTS idx_file_records_data_period ON file_records(data_period);
CREATE INDEX IF NOT EXISTS idx_file_records_file_hash ON file_records(file_hash);
CREATE INDEX IF NOT EXISTS idx_file_records_status ON file_records(status);
CREATE INDEX IF NOT EXISTS idx_file_records_import_job_id ON file_records(import_job_id);

-- ============ 2. 新建 import_logs 表 ============
CREATE TABLE IF NOT EXISTS import_logs (
    id SERIAL PRIMARY KEY,
    file_record_id INTEGER REFERENCES file_records(id) ON DELETE SET NULL,
    job_id UUID DEFAULT gen_random_uuid() NOT NULL,
    module_type VARCHAR(50) NOT NULL,
    data_period DATE NOT NULL,
    target_table VARCHAR(200) NOT NULL,
    total_rows INTEGER DEFAULT 0,
    inserted_rows INTEGER DEFAULT 0,
    updated_rows INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    operator VARCHAR(100) DEFAULT '',
    error_details JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_logs_job_id ON import_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_module_type ON import_logs(module_type);
CREATE INDEX IF NOT EXISTS idx_import_logs_data_period ON import_logs(data_period);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);
CREATE INDEX IF NOT EXISTS idx_import_logs_file_record_id ON import_logs(file_record_id);

-- ============ 3. 新建 field_mapping_config 表 ============
CREATE TABLE IF NOT EXISTS field_mapping_config (
    id SERIAL PRIMARY KEY,
    module_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(200) NOT NULL,
    file_pattern VARCHAR(500),
    sheet_name VARCHAR(200) DEFAULT '',
    header_row INTEGER DEFAULT 0,
    column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    conflict_keys TEXT[] DEFAULT '{}',
    data_cleaning_rules JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(module_type, table_name)
);

CREATE INDEX IF NOT EXISTS idx_fmc_module_type ON field_mapping_config(module_type);
CREATE INDEX IF NOT EXISTS idx_fmc_is_active ON field_mapping_config(is_active);

-- ============ 4. 为所有业务表增加通用字段 ============
-- 使用 DO 块批量处理，避免逐表手写
DO $$
DECLARE
    t_name TEXT;
    col_exists BOOLEAN;
BEGIN
    FOR t_name IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name LIKE 't_%'
    LOOP
        -- data_period
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name=%L AND column_name=%L)', t_name, 'data_period') INTO col_exists;
        IF NOT col_exists THEN
            EXECUTE format('ALTER TABLE public."%s" ADD COLUMN data_period DATE', t_name);
        END IF;

        -- source_file_id
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name=%L AND column_name=%L)', t_name, 'source_file_id') INTO col_exists;
        IF NOT col_exists THEN
            EXECUTE format('ALTER TABLE public."%s" ADD COLUMN source_file_id INTEGER REFERENCES file_records(id) ON DELETE SET NULL', t_name);
        END IF;

        -- import_job_id
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name=%L AND column_name=%L)', t_name, 'import_job_id') INTO col_exists;
        IF NOT col_exists THEN
            EXECUTE format('ALTER TABLE public."%s" ADD COLUMN import_job_id UUID', t_name);
        END IF;

        -- row_hash
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name=%L AND column_name=%L)', t_name, 'row_hash') INTO col_exists;
        IF NOT col_exists THEN
            EXECUTE format('ALTER TABLE public."%s" ADD COLUMN row_hash CHAR(64)', t_name);
        END IF;

        -- last_updated_at
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name=%L AND column_name=%L)', t_name, 'last_updated_at') INTO col_exists;
        IF NOT col_exists THEN
            EXECUTE format('ALTER TABLE public."%s" ADD COLUMN last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', t_name);
        END IF;

        -- version
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name=%L AND column_name=%L)', t_name, 'version') INTO col_exists;
        IF NOT col_exists THEN
            EXECUTE format('ALTER TABLE public."%s" ADD COLUMN version INTEGER DEFAULT 1', t_name);
        END IF;

        -- 创建 import_job_id 索引
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_import_job_id ON public."%s"(import_job_id)', replace(t_name, '.', '_'), t_name);
        -- 创建 row_hash 索引
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_row_hash ON public."%s"(row_hash)', replace(t_name, '.', '_'), t_name);
        -- 创建 data_period 索引
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_data_period ON public."%s"(data_period)', replace(t_name, '.', '_'), t_name);

        RAISE NOTICE '已增强表: %', t_name;
    END LOOP;
END $$;

-- ============ 5. 插入字段映射配置初始数据 ============
INSERT INTO field_mapping_config (module_type, table_name, file_pattern, column_mapping, conflict_keys, data_cleaning_rules) VALUES
-- === 培训模块 (t_01) ===
('training', 't_01_hse教育培训_乡镇教育培训扣分汇总', '培训|教育|考核.*乡镇',
    '{"月份":"月份","经理":"经理","乡镇":"乡镇","应到人数":"应到人数","培训人数":"培训人数","未培训人员数量":"未培训人员数量","缺少签字人数":"缺少签字人数","记录不完整":"记录不完整","总计":"总计"}',
    ARRAY['月份','乡镇','经理'], '{}'::jsonb),
('training', 't_01_hse教育培训_管理员教育培训扣分汇总', '培训|教育.*管理员',
    '{"月份":"月份","乡镇":"乡镇","应到人数":"应到人数","培训人数":"培训人数","未培训人员数量":"未培训人员数量","缺少签字人数":"缺少签字人数","记录不完整":"记录不完整","总计":"总计"}',
    ARRAY['月份','乡镇'], '{}'::jsonb),

-- === 保险模块 (t_02) ===
('insurance', 't_02_保险及人员管理_人员保险', '人员保险|保险.*人员',
    '{"姓名":"姓名","员工编码":"员工编码","身份证号码":"身份证号码","性别":"性别","年龄":"年龄","所属部门":"所属部门","职位":"职位","入职日期":"入职日期","年龄分类":"年龄分类","应缴保险类型":"应缴保险类型","实际投保":"实际投保","工伤保险":"工伤保险","工伤险金额":"工伤险金额","工伤险来源":"工伤险来源","雇主责任险":"雇主责任险","雇主责任险金额":"雇主责任险金额","雇主责任险岗位":"雇主责任险岗位","保险起期":"保险起期","保险止期":"保险止期","是否公益岗":"是否公益岗","合规状态":"合规状态","合规等级":"合规等级"}',
    ARRAY['姓名'], '{"身份证号码":"id_card","入职日期":"date","保险起期":"date","保险止期":"date"}'::jsonb),
('insurance', 't_02_保险及人员管理_员工信息维护', '员工信息|人员.*维护',
    '{"序号":"序号","员工编码":"员工编码","姓名":"姓名","所属部门":"所属部门","职位":"职位","入职日期":"入职日期","身份证号码":"身份证号码","性别":"性别","年龄":"年龄","直接上级":"直接上级","国际区号手机号码":"国际区号手机号码","完整度百分比":"完整度百分比"}',
    ARRAY['员工编码'], '{"身份证号码":"id_card","入职日期":"date"}'::jsonb),
('insurance', 't_02_保险及人员管理_宁津项目车辆保险统计表', '车辆保险|车险',
    '{"车牌号":"车牌号","投保人_被保险人":"投保人_被保险人","行驶证车主":"行驶证车主","车架号":"车架号","发动机号":"发动机号","初次登记年月":"初次登记年月","厂牌车型":"厂牌车型","保险起期":"保险起期","保险止期":"保险止期","保额":"保额","保费":"保费","商业险合计":"商业险合计","交强险":"交强险","车船税":"车船税","合计":"合计","三者险保额":"三者险保额","三者险保费":"三者险保费"}',
    ARRAY['车牌号'], '{"保险起期":"date","保险止期":"date","初次登记年月":"date"}'::jsonb),
('insurance', 't_02_保险及人员管理_车牌号姓名映射', '车牌号.*姓名|姓名.*车牌',
    '{"车牌号":"车牌号","姓名":"姓名"}',
    ARRAY['车牌号','姓名'], '{}'::jsonb),
('insurance', 't_02_保险及人员管理_花名册', '花名册',
    '{"序号":"d_1","员工编码":"d_179501","身份证号码":"d_372425197112167312","姓名":"黄殿兴","所属部门":"项目管理层","职位":"项目总经理","入职日期":"d_2018_09_04","性别":"男"}',
    ARRAY['d_179501'], '{"d_372425197112167312":"id_card","d_2018_09_04":"date"}'::jsonb),
('insurance', 't_02_保险及人员管理_最新雇员清单', '雇员清单|最新雇员',
    '{"雇员姓名":"雇员姓名","证件类型名称":"证件类型名称","证件号码":"证件号码","工种属性_职业类别":"工种属性_职业类别","岗位名称":"岗位名称","保险起期":"保险起期","保险止期":"保险止期","备注":"备注","生效时间":"生效时间"}',
    ARRAY['雇员姓名','证件号码'], '{"证件号码":"id_card","保险起期":"date","保险止期":"date","生效时间":"date"}'::jsonb),

-- === 规章制度模块 (t_03) ===
('regulations', 't_03_规章制度_制度清单', '制度清单',
    '{"序号":"序号","制度名称":"制度名称","版本号":"版本号","状态":"状态","生效日期":"生效日期"}',
    ARRAY['序号','制度名称'], '{"生效日期":"date"}'::jsonb),
('regulations', 't_03_规章制度_全员岗位安全生产责任制清单', '责任制清单|全员岗位',
    '{"序号":"序号","部门":"部门","岗位":"岗位","岗位安全生产职责":"岗位安全生产职责"}',
    ARRAY['序号','部门','岗位'], '{}'::jsonb),
('regulations', 't_03_规章制度_项目安全生产和职业卫生法律法规', '法律法规|安全生产.*职业',
    '{"序号":"序号","法规名称":"法规名称","文件号":"文件号","发布时间":"发布时间","实施时间":"实施时间","分类":"分类"}',
    ARRAY['序号','法规名称'], '{"发布时间":"date","实施时间":"date"}'::jsonb),
('regulations', 't_03_规章制度_宁津项目安全生产网格化管理清单', '网格化.*管理清单|网格.*清单',
    '{"项目名称":"项目名称","总网格长_项目负责人":"总网格长_项目负责人","一级网格长":"一级网格长","二级网格长":"二级网格长","三级网格长":"三级网格长"}',
    ARRAY['项目名称'], '{}'::jsonb),

-- === 事故管理模块 (t_05) ===
('accident', 't_05_事故管理_历史未完成案件', '历史.*未完成|未结.*案件',
    '{"事故时间":"事故时间","事故等级":"事故等级","事故类型":"事故类型","涉事人员":"涉事人员","事故地点与经过":"事故地点与经过","处理状态":"处理状态"}',
    ARRAY['事故时间','事故类型','涉事人员'], '{"事故时间":"date"}'::jsonb),

-- === 三违管理模块 (t_07) ===
('sanwei', 't_07_三违管理_乡镇人员名单_微信', '乡镇.*人员.*名单|人员名单.*微信',
    '{"序号":"序号","乡镇":"乡镇","职务":"职务","姓名":"姓名","微信名":"微信名"}',
    ARRAY['序号','姓名'], '{}'::jsonb),
('sanwei', 't_07_三违管理_宁津项目三违检查清单_表_2_全员', '三违.*检查.*清单|检查清单.*全员',
    '{"人员姓名":"人员姓名","网格等级":"网格等级","所属层级_分组":"所属层级_分组","所属岗位":"所属岗位","巡查频次":"巡查频次"}',
    ARRAY['人员姓名'], '{}'::jsonb),
('sanwei', 't_07_三违管理_拍照巡检_ai_识别', '拍照.*巡检|巡检.*ai',
    '{"现场拍照":"现场拍照","ai_智能巡检识别":"ai_智能巡检识别","责任人":"责任人","巡检日期":"巡检日期","穿拖鞋":"穿拖鞋","未穿工装":"未穿工装","未佩戴安全头盔":"未佩戴安全头盔","创建人":"创建人","上传时间":"上传时间"}',
    ARRAY['责任人','巡检日期'], '{"巡检日期":"date","上传时间":"date"}'::jsonb),

-- === 现场管理模块 (t_08) ===
('site', 't_08_现场管理_宁津项目三违检查清单_三违检查', '三违.*检查.*记录|三违检查',
    '{"片区_班组":"片区_班组","上传时间":"上传时间","检查人姓名":"检查人姓名","网格等级":"网格等级","所属岗位":"所属岗位","违章人姓名":"违章人姓名","违章人性别":"违章人性别","违章人年龄":"违章人年龄","车辆类型_保洁员":"车辆类型_保洁员","上报状态":"上报状态","图片内容":"图片内容","三违_行为":"三违_行为","三违类型_输出结果":"三违类型_输出结果","需要整改":"需要整改","整改执行人":"整改执行人","整改后的照片":"整改后的照片","扣分情况":"扣分情况","示意图":"示意图"}',
    ARRAY['片区_班组','上传时间','违章人姓名'], '{"上传时间":"date"}'::jsonb),
('site', 't_08_现场管理_网格管理人员名单', '网格.*人员.*名单|网格.*管理.*名单',
    '{"姓名":"姓名","网格层级":"网格层级","所属区域":"所属区域","职务":"职务","巡查频率":"巡查频率"}',
    ARRAY['姓名'], '{}'::jsonb),

-- === 风险分级管控模块 (t_09) ===
('risk', 't_09_风险分级管控_宁津项目重大风险管控清单', '风险.*管控|重大风险',
    '{"高风险":"高风险","col_1":"col_1","col_2":"col_2","col_3":"col_3","col_4":"col_4","col_5":"col_5","col_6":"col_6","col_7":"col_7","col_8":"col_8"}',
    ARRAY['高风险','col_1'], '{}'::jsonb),

-- === 隐患排查治理模块 (t_10) ===
('hidden_danger', 't_10_隐患排查治理_隐悦排查登记表_2026_06_21', '隐患.*排查|隐悦.*排查',
    '{"序号":"序号","隐悦描述":"隐悦描述","整改措施":"整改措施","检查时间":"检查时间","检查人员":"检查人员","整改人员":"整改人员","整改时间":"整改时间","是否整改完成":"是否整改完成","备注":"备注","区域":"区域","分类":"分类"}',
    ARRAY['序号'], '{"检查时间":"date","整改时间":"date"}'::jsonb)
ON CONFLICT (module_type, table_name) DO NOTHING;

-- ============ 6. 验证 ============
DO $$
DECLARE
    t_count INTEGER;
    f_count INTEGER;
    i_count INTEGER;
    fmc_count INTEGER;
BEGIN
    SELECT count(*) INTO t_count FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name LIKE 't_%';

    SELECT count(*) INTO f_count FROM information_schema.columns
    WHERE table_schema='public' AND column_name='row_hash' AND table_name LIKE 't_%';

    SELECT count(*) INTO i_count FROM import_logs;

    SELECT count(*) INTO fmc_count FROM field_mapping_config;

    RAISE NOTICE '验证结果: t_表总数=%, 已增加row_hash字段的表数=%, import_logs记录数=%, field_mapping_config记录数=%', t_count, f_count, i_count, fmc_count;
END $$;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
