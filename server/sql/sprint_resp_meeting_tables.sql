-- ============================================================
-- 责任书 + 安全会议 模块建表脚本
-- 版本：v1.0
-- 日期：2026-08-27
-- 数据库：PostgreSQL 15
-- 依据：《月度安全履职自动考核方案.md》+ 事件时效优化遗留建议补齐
-- ============================================================
-- 功能：
--   1. safety_responsibility_forms —— 安全/目标责任书（RESP-002 缺签×1）
--   2. meeting_records —— 安全会议出席记录（RESP-004 缺席×2，交由每日扫描兜底）
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 责任书表 safety_responsibility_forms
--    一行 = 某员工某年度某类型责任书；sign_status 标识是否已签。
--    事件服务 RES_002 消费时以该表为 sourceTable。
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_responsibility_forms (
    id            BIGSERIAL     PRIMARY KEY,
    form_code     VARCHAR(50)   NOT NULL,              -- 责任书编号（如 RESP-2026-0001）
    form_type     VARCHAR(50)   NOT NULL DEFAULT '安全生产责任书', -- 类型：安全生产/目标责任书
    year          INT           NOT NULL,              -- 责任书年度
    employee_id   BIGINT        NOT NULL,              -- 责任书签署员工
    employee_code VARCHAR(50),
    employee_name VARCHAR(50)   NOT NULL,
    position      VARCHAR(50),
    township      VARCHAR(50),
    department    VARCHAR(50),
    sign_status   VARCHAR(20)   NOT NULL DEFAULT 'unsigned', -- unsigned/signed
    sign_date     DATE,                                 -- 实际签署日期
    remark        TEXT,
    is_deleted    BOOLEAN      DEFAULT FALSE,
    created_by    BIGINT,
    created_by_name VARCHAR(50),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_respform_employee ON safety_responsibility_forms (employee_id);
CREATE INDEX IF NOT EXISTS idx_respform_year ON safety_responsibility_forms (year);
CREATE INDEX IF NOT EXISTS idx_respform_type ON safety_responsibility_forms (form_type);
CREATE INDEX IF NOT EXISTS idx_respform_status ON safety_responsibility_forms (sign_status);
-- 同一员工同年同类型仅一份
CREATE UNIQUE INDEX IF NOT EXISTS uq_respform_active
  ON safety_responsibility_forms (year, form_type, employee_id) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS trg_respform_updated_at ON safety_responsibility_forms;
CREATE TRIGGER trg_respform_updated_at
    BEFORE UPDATE ON safety_responsibility_forms
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE safety_responsibility_forms IS '安全/目标责任书（RESP-002 缺签即扣）';
COMMENT ON COLUMN safety_responsibility_forms.sign_status IS '签署状态：unsigned/signed';

-- ============================================================
-- 2. 安全会议出席记录 meeting_records
--    一行 = 某会议下某员工的一条出席记录；
--    attendance_status = attend(出席)/absent(缺席)/not_required(无需参加)。
--    事件服务 RESP-004 消费时以该表为 sourceTable。
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_records (
    id            BIGSERIAL     PRIMARY KEY,
    meeting_code  VARCHAR(50)   NOT NULL,              -- 会议编号（如 MEET-2026-0001）
    meeting_name  VARCHAR(100)  NOT NULL,              -- 会议名称/议题
    meeting_date  DATE          NOT NULL,              -- 会议日期
    meeting_type  VARCHAR(50)   DEFAULT '安全会议',
    organizer     VARCHAR(50),
    employee_id   BIGINT        NOT NULL,              -- 参会员工
    employee_code VARCHAR(50),
    employee_name VARCHAR(50)   NOT NULL,
    position      VARCHAR(50),
    attendance_status VARCHAR(20) NOT NULL DEFAULT 'attend', -- attend/absent/not_required
    sign_time     TIMESTAMPTZ,                          -- 签到时间
    remark        TEXT,
    is_deleted    BOOLEAN      DEFAULT FALSE,
    created_by    BIGINT,
    created_by_name VARCHAR(50),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meet_code ON meeting_records (meeting_code);
CREATE INDEX IF NOT EXISTS idx_meet_date ON meeting_records (meeting_date);
CREATE INDEX IF NOT EXISTS idx_meet_employee ON meeting_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_meet_status ON meeting_records (attendance_status);
CREATE INDEX IF NOT EXISTS idx_meet_meeting_emp ON meeting_records (meeting_code, employee_id);

DROP TRIGGER IF EXISTS trg_meeting_updated_at ON meeting_records;
CREATE TRIGGER trg_meeting_updated_at
    BEFORE UPDATE ON meeting_records
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE meeting_records IS '安全会议出席记录（RESP-004 缺席×2，缺签兜底由每日扫描判定）';
COMMENT ON COLUMN meeting_records.attendance_status IS '出席状态：attend/absent/not_required';

COMMIT;

-- ============================================================
-- 验证：
--   SELECT tablename FROM pg_tables WHERE tablename IN ('safety_responsibility_forms','meeting_records');
-- ============================================================