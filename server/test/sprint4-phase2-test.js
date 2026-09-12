/**
 * Sprint4 Phase 2 测试脚本 - 标准条款管理 API
 * 测试所有 8 个端点
 */

const { pool } = require('../config/db');

const BASE_URL = 'http://localhost:5666/api/hse/standard';

let authToken = null;

async function request(method, path, body, useToken = true) {
  const url = BASE_URL + path;
  const headers = { 'Content-Type': 'application/json' };
  if (useToken && authToken) {
    headers['Authorization'] = 'Bearer ' + authToken;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return await res.json();
}

async function getToken() {
  const res = await fetch('http://localhost:5666/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const data = await res.json();
  return data.data?.token || data.token || null;
}

async function main() {
  console.log('========== Sprint4 Phase 2: 标准条款管理 API 测试 ==========\n');

  let passed = 0;
  let failed = 0;
  const failures = [];

  function test(name, result, expectedSuccess = true) {
    const ok = expectedSuccess ? (result.success === true) : (result.success === false);
    if (ok) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      failures.push({ name, message: result.message || JSON.stringify(result).substring(0, 100) });
      console.log(`  ❌ ${name} - ${result.message || JSON.stringify(result).substring(0, 80)}`);
    }
  }

  try {
    console.log('[0] 获取登录 token...');
    authToken = await getToken();
    if (!authToken) {
      console.log('  ❌ 无法获取 token');
      process.exit(1);
    }
    console.log('  ✅ 获取 token 成功\n');

    // ---- 1. 条款树 ----
    console.log('[1] 条款树查询');
    const tree = await request('GET', '/tree');
    test('GET /tree 返回成功', tree);
    test('GET /tree 包含8个一级要素', {
      success: tree.data && Array.isArray(tree.data) && tree.data.length === 8
    }, true);

    const treeData = tree.data || [];
    let firstL3Id = null;
    let firstL2Id = null;
    if (treeData[0]?.children?.[0]?.children?.[0]) {
      firstL3Id = treeData[0].children[0].children[0].id;
    }
    if (treeData[0]?.children?.[0]) {
      firstL2Id = treeData[0].children[0].id;
    }
    console.log('');

    // ---- 2. 条款统计 ----
    console.log('[2] 条款统计');
    const stats = await request('GET', '/stats');
    test('GET /stats 返回成功', stats);
    test('GET /stats total >= 50', {
      success: stats.data && stats.data.total >= 50
    }, true);
    console.log('');

    // ---- 3. 条款详情 ----
    console.log('[3] 条款详情');
    if (firstL3Id) {
      const detail = await request('GET', `/${firstL3Id}`);
      test('GET /:id 返回成功', detail);
      test('GET /:id id 正确', {
        success: detail.data && String(detail.data.id) === String(firstL3Id)
      }, true);
    } else {
      console.log('  ⚠️  未找到三级条款，跳过详情测试');
    }

    const notFound = await request('GET', '/999999');
    test('GET /:id 不存在返回失败', notFound, false);
    console.log('');

    // ---- 4. 新增条款 ----
    console.log('[4] 新增条款');
    const newClause = {
      code: 'T-TEST-001',
      level: 3,
      parentId: firstL2Id || null,
      clauseTitle: '测试条款',
      clauseContent: '这是一个测试条款的内容描述',
      checkMethod: '查阅测试记录',
      scoreWeight: 1.5,
      keywords: ['测试', '示例'],
      requiredDocTypes: ['测试记录'],
      sortOrder: 99,
    };
    const created = await request('POST', '/', newClause);
    test('POST / 创建成功', created);

    let newId = null;
    if (created.data && created.data.id) {
      newId = created.data.id;
      test('POST / 返回正确的 code', {
        success: created.data.code === 'T-TEST-001'
      }, true);

      // ---- 5. 修改条款 ----
      console.log('\n[5] 修改条款');
      const updated = await request('PUT', `/${newId}`, {
        clauseTitle: '测试条款（已修改）',
        scoreWeight: 2.0,
      });
      test('PUT /:id 修改成功', updated);
      test('PUT /:id 标题已更新', {
        success: updated.data && updated.data.clauseTitle === '测试条款（已修改）'
      }, true);
      test('PUT /:id 权重已更新', {
        success: updated.data && Number(updated.data.scoreWeight) === 2.0
      }, true);

      // ---- 6. 停用/启用 ----
      console.log('\n[6] 启用/停用条款');
      const deactivated = await request('PUT', `/${newId}/status`, { status: 'inactive' });
      test('PUT /:id/status 停用成功', deactivated);
      test('PUT /:id/status 状态为 inactive', {
        success: deactivated.data && deactivated.data.status === 'inactive'
      }, true);

      const activated = await request('PUT', `/${newId}/status`, { status: 'active' });
      test('PUT /:id/status 启用成功', activated);
      test('PUT /:id/status 状态为 active', {
        success: activated.data && activated.data.status === 'active'
      }, true);

      // 状态值错误测试
      const badStatus = await request('PUT', `/${newId}/status`, { status: 'invalid_status' });
      test('PUT /:id/status 非法状态返回失败', badStatus, false);

      // ---- 7. 导出 ----
      console.log('\n[7] 导出条款');
      const exported = await request('GET', '/export');
      test('GET /export 返回成功', exported);
      test('GET /export 包含数据数组', {
        success: exported.data && Array.isArray(exported.data) && exported.data.length > 0
      }, true);

      // ---- 8. 批量导入 ----
      console.log('\n[8] 批量导入');
      const importData = {
        clauses: [
          {
            code: 'T-IMPORT-001',
            level: 3,
            parentId: firstL2Id || null,
            clauseTitle: '导入测试条款1',
            clauseContent: '导入测试内容1',
            scoreWeight: 1.0,
            keywords: ['导入测试'],
            sortOrder: 98,
          },
          {
            code: 'T-IMPORT-002',
            level: 3,
            parentId: firstL2Id || null,
            clauseTitle: '导入测试条款2',
            clauseContent: '导入测试内容2',
            scoreWeight: 1.0,
            keywords: ['导入测试'],
            sortOrder: 97,
          },
        ],
      };
      const imported = await request('POST', '/import', importData);
      test('POST /import 导入成功', imported);
      test('POST /import 成功数=2', {
        success: imported.data && imported.data.success === 2
      }, true);

      // 重复导入应该失败
      const importedAgain = await request('POST', '/import', importData);
      test('POST /import 重复导入失败数=2', {
        success: importedAgain.data && importedAgain.data.failed === 2
      }, true);

      // ---- 9. 编码重复校验 ----
      console.log('\n[9] 编码重复校验');
      const dupClause = {
        code: 'T-TEST-001',
        level: 3,
        parentId: firstL2Id || null,
        clauseTitle: '重复编码测试',
        sortOrder: 96,
      };
      const dupResult = await request('POST', '/', dupClause);
      test('POST / 重复编码返回失败', dupResult, false);

      // ---- 10. 参数校验 ----
      console.log('\n[10] 参数校验');
      const noCode = await request('POST', '/', { level: 1 });
      test('POST / 缺少编码返回失败', noCode, false);

      const badLevel = await request('POST', '/', { code: 'T-BAD-001', level: 99 });
      test('POST / 层级错误返回失败', badLevel, false);

      // ---- 清理测试数据 ----
      console.log('\n[清理] 删除测试数据');
      await pool.query(
        `UPDATE safety_standard_clauses SET is_deleted = TRUE
         WHERE code LIKE 'T-TEST-%' OR code LIKE 'T-IMPORT-%' OR code LIKE 'T-BAD-%'`
      );
      console.log('  ✅ 测试数据已清理');
    }

    console.log('\n========== 测试结果 ==========');
    console.log(`  通过: ${passed}`);
    console.log(`  失败: ${failed}`);
    console.log(`  总计: ${passed + failed}`);

    if (failures.length > 0) {
      console.log('\n失败详情:');
      failures.forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.name}: ${f.message}`);
      });
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('测试执行失败:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
