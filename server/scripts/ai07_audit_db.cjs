const { pool } = require('../config/db');

(async () => {
  try {
    const id = await pool.query("SELECT current_database() db, current_user usr");
    console.log('IDENTITY:', JSON.stringify(id.rows[0]));

    const t = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    );
    const names = t.rows.map((x) => x.table_name);
    console.log('TABLE_COUNT:', names.length);
    console.log('TABLES:', names.join(', '));
    console.log('HAS_ai_analysis_tasks:', names.includes('ai_analysis_tasks'));
    console.log('HAS_document_ai_analysis:', names.includes('document_ai_analysis'));

    const g = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='ai_generation_records' ORDER BY ordinal_position"
    );
    console.log('--- ai_generation_records ---');
    g.rows.forEach((x) => console.log(' ', x.column_name, x.data_type));

    const d = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='document_ai_analysis' ORDER BY ordinal_position"
    );
    console.log('--- document_ai_analysis (参考模式) ---');
    d.rows.forEach((x) => console.log(' ', x.column_name, x.data_type));
  } catch (e) {
    console.error('ERR', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
