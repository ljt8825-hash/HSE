-- ============================================================
-- 类别扣分上限（一期） hse_assessment_category_limit
-- 目的：把「最大扣分」从规则层(每个规则自设)上移到「类别」层。
--       类别（如 三违管理）统一承载扣分上限（默认取自考核标准类的满分，
--       + 如 三违管理=40 / HSE教育培训=30 / 安全文化建设=20 / 现场管理=50）。
--       类别下所有规则的扣分合计计入该上限，规则自身不再必须配置上限。
-- ============================================================

CREATE TABLE IF NOT EXISTS hse_assessment_category_limit (
    id          BIGSERIAL     PRIMARY KEY,
    category    VARCHAR(100)  NOT NULL,          -- 类别名（唯一，如 三违管理）
    max_deduct  NUMERIC(6,2),                    -- 类别扣分上限（空=不设上限）
    remark      TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_category_limit UNIQUE (category)
);

COMMENT ON TABLE  hse_assessment_category_limit IS '考核扣分规则库-类别扣分上限';
COMMENT ON COLUMN hse_assessment_category_limit.max_deduct IS '类别最大扣分（如三违管理40分），该类别下所有规则扣分合计不超过此上限；空=不设上限';

-- 初始化：从现有规则表类别去重生成，填入默认上限（取自考核标准类满分）
INSERT INTO hse_assessment_category_limit (category, max_deduct)
SELECT r.category, v.max_deduct
FROM (
    SELECT category FROM hse_assessment_rule
    WHERE is_deleted = FALSE AND category IS NOT NULL AND category <> ''
    GROUP BY category
) r
JOIN (VALUES
    ('三违管理',              40),
    ('HSE教育培训',           30),
    ('安全文化建设',          20),
    ('现场管理-驾驶员管理',   50),
    ('现场管理-转运站管理',   50),
    ('消防管理',              50)
) v(category, max_deduct) ON v.category = r.category
ON CONFLICT (category) DO NOTHING;

-- 若规则表里还有未在默认映射中的类别，则先建一条不设上限的记录
INSERT INTO hse_assessment_category_limit (category, max_deduct)
SELECT r.category, NULL
FROM (
    SELECT category FROM hse_assessment_rule
    WHERE is_deleted = FALSE AND category IS NOT NULL AND category <> ''
    GROUP BY category
) r
WHERE NOT EXISTS (
    SELECT 1 FROM hse_assessment_category_limit c WHERE c.category = r.category
);