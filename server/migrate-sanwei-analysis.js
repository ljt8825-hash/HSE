/**
 * 迁移：三违分析「三违照片信息统计台账」月度分数 —— 乡镇作业中心经理版
 *  1) 建表 hse_sanwei_score_monthly（月度三违考核分数台账）
 * 幂等：IF NOT EXISTS / (month,town) 唯一约束，可重复执行
 * 执行：node migrate-sanwei-analysis.js
 *
 * 数据来源：<根>/<YYYY>年/<M>月/*乡镇作业中心经理*.xlsx 的「三违照片信息统计台账」工作表
 *   - 第 1 行为乡镇表头（12 乡镇，位于奇数列 B,D,F,…），每乡镇下挂「照片」/「违章信息」两子列
 *   - 倒数第 2 行「总」= 各镇照片/违章信息未完成(×)次数
 *   - 最后一行「扣分」= 各镇当月三违考核扣分（照片列×2分、违章信息列×1分，三违考核分数=照片扣分+违章扣分）
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS hse_sanwei_score_monthly (
  id            SERIAL PRIMARY KEY,
  month         VARCHAR(7)        NOT NULL,             -- 'YYYY-MM'
  town          VARCHAR(100)      NOT NULL,             -- 乡镇名（如 柴胡店镇）
  manager_name  VARCHAR(64)                NULL,        -- 回填的乡镇作业中心经理姓名
  employee_id   INT                        NULL,        -- 回填的考核对象员工id
  defect_count  INT             NOT NULL DEFAULT 0,     -- 「总」未完成(×)次数（未完成项数，2026-08 后列表列）
  photo_defect  INT             NOT NULL DEFAULT 0,     -- 「照片」子列未完成(×)次数
  info_defect   INT             NOT NULL DEFAULT 0,     -- 「违章信息」子列未完成(×)次数
  score         NUMERIC(8,2)    NOT NULL DEFAULT 0,     -- 「扣分」当月三违考核分数（照片扣分+违章扣分）
  not_assessed  BOOLEAN         NOT NULL DEFAULT FALSE, -- 该月三违考核未实施（分数列标「不考核」，保留成绩数据）
  is_deleted    BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP       DEFAULT NOW(),
  UNIQUE (month, town)
);`;

(async () => {
  await pool.query(CREATE_TABLE);
  await pool.query(`ALTER TABLE hse_sanwei_score_monthly
    ADD COLUMN IF NOT EXISTS photo_defect INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS info_defect  INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS not_assessed BOOLEAN NOT NULL DEFAULT FALSE
  `);
  console.log('表就绪: hse_sanwei_score_monthly（含 photo_defect / info_defect / not_assessed）');
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });