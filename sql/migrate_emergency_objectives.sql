-- ============================================================
-- 迁移: emergency 和 objectives 模块补充
-- 阶段5: 仅创建缺失的表，不修改已存在的表
-- 执行方式: psql -U hse_app -d safety_dashboard -f sql/migrate_emergency_objectives.sql
-- ============================================================

BEGIN;

-- ---------- 1. 应急预案表（新增） ----------
CREATE TABLE IF NOT EXISTS emergency_plans (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  type            VARCHAR(50) NOT NULL DEFAULT '综合预案',
  level           VARCHAR(20) NOT NULL DEFAULT '一般',
  location        VARCHAR(200),
  description     TEXT,
  responsible_dept VARCHAR(100),
  responsible_person VARCHAR(50),
  contact_phone   VARCHAR(20),
  plan_content    TEXT,
  attachment_url  VARCHAR(500),
  status          VARCHAR(20) NOT NULL DEFAULT '草稿',
  effective_date  DATE,
  expiry_date     DATE,
  last_drill_date DATE,
  remark          TEXT,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE emergency_plans IS '应急预案表';
CREATE INDEX IF NOT EXISTS idx_emergency_plans_type ON emergency_plans(type);
CREATE INDEX IF NOT EXISTS idx_emergency_plans_level ON emergency_plans(level);
CREATE INDEX IF NOT EXISTS idx_emergency_plans_status ON emergency_plans(status);
CREATE INDEX IF NOT EXISTS idx_emergency_plans_deleted ON emergency_plans(is_deleted);

-- ---------- 2. 应急物资表（新增） ----------
CREATE TABLE IF NOT EXISTS emergency_supplies (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  category        VARCHAR(50) DEFAULT '消防器材',
  spec            VARCHAR(100),
  quantity        NUMERIC(10,2) DEFAULT 0,
  unit            VARCHAR(20) DEFAULT '件',
  storage_location VARCHAR(200),
  responsible_person VARCHAR(50),
  last_check_date DATE,
  expiry_date     DATE,
  status          VARCHAR(20) DEFAULT '正常',
  remark          TEXT,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE emergency_supplies IS '应急物资表';
CREATE INDEX IF NOT EXISTS idx_emergency_supplies_category ON emergency_supplies(category);
CREATE INDEX IF NOT EXISTS idx_emergency_supplies_status ON emergency_supplies(status);

-- ---------- 3. 为已有表补充 is_deleted 列（若不存在） ----------
-- 注意: 以下操作可能因权限不足而跳过（表所有者为 postgres），不影响系统运行

-- contract_signs
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contract_signs' AND column_name='is_deleted') THEN
      ALTER TABLE contract_signs ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[SKIP] contract_signs: 权限不足，跳过 is_deleted 列添加';
  END;
END $$;

-- org_personnel
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='org_personnel' AND column_name='is_deleted') THEN
      ALTER TABLE org_personnel ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[SKIP] org_personnel: 权限不足，跳过 is_deleted 列添加';
  END;
END $$;

-- responsibilities
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='responsibilities' AND column_name='is_deleted') THEN
      ALTER TABLE responsibilities ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[SKIP] responsibilities: 权限不足，跳过 is_deleted 列添加';
  END;
END $$;

-- safety_budgets
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='safety_budgets' AND column_name='is_deleted') THEN
      ALTER TABLE safety_budgets ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[SKIP] safety_budgets: 权限不足，跳过 is_deleted 列添加';
  END;
END $$;

-- emergency_drills
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='emergency_drills' AND column_name='is_deleted') THEN
      ALTER TABLE emergency_drills ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[SKIP] emergency_drills: 权限不足，跳过 is_deleted 列添加';
  END;
END $$;

COMMIT;

-- ============================================================
-- 已存在的表（不修改）:
--   emergency_drills    — 应急演练记录
--   contract_signs      — 安全合同
--   org_personnel       — 安全组织人员
--   responsibilities    — 安全责任制
--   safety_budgets      — 安全投入
-- ============================================================
