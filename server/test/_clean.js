const { pool } = require('../config/db');

async function main() {
  await pool.query(
    `UPDATE safety_standard_clauses SET is_deleted = TRUE
     WHERE code LIKE 'T-%' OR code LIKE 'TEST-%' OR code LIKE 'DEBUG-%'`
  );
  console.log('Test data cleaned');
  await pool.end();
}
main();
