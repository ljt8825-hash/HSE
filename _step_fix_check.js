const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    database: 'safety_dashboard',
    user: 'postgres',
    password: 'postgres'
  });
  await c.connect();

  // Check uk_emp_assign_primary
  const idx = await c.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'employee_assignment' AND indexname = 'uk_emp_assign_primary'"
  );
  console.log('=== Constraint Check (uk_emp_assign_primary) ===');
  console.log(JSON.stringify(idx.rows, null, 2));

  // Check status distribution
  const status = await c.query(
    "SELECT status, COUNT(*) AS cnt FROM hse_employee_relation WHERE is_deleted = false GROUP BY status ORDER BY cnt DESC"
  );
  console.log('\n=== Status Distribution ===');
  console.log(JSON.stringify(status.rows, null, 2));

  // Check if employee_assignment has any records
  const ea = await c.query("SELECT COUNT(*) FROM employee_assignment WHERE is_deleted = false");
  console.log('\n=== employee_assignment active count ===');
  console.log(ea.rows[0]);

  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
