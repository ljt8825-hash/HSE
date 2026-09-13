/**
 * 审批流程管理路由 - PostgreSQL + 内存降级双模式
 * 端点: GET /definitions  POST /definitions  PUT /definitions/:id  DELETE /definitions/:id
 *      GET /instances  POST /instances/start  GET /tasks
 * 对应前端: api/hse/workflow.ts → store/workflow.ts
 */

import { Router, Request, Response } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储 ==========
let memoryDefs: any[] = [];
let memoryInstances: any[] = [];
let memoryTasks: any[] = [];
let defIdCounter = 1;
let instIdCounter = 1;
let taskIdCounter = 1;
let pgDefsChecked = false; let pgDefsExists = false;

async function usePgDefs(): Promise<boolean> {
  if (!isConnected()) return false;
  if (!pgDefsChecked) {
    try { await pool.query("SELECT 1 FROM workflow_definitions LIMIT 0"); pgDefsExists = true; }
    catch { pgDefsExists = false; }
    pgDefsChecked = true;
  }
  return pgDefsExists;
}

function initMemoryData(): void {
  if (memoryDefs.length > 0) return;
  const defNames = ['隐患整改审批流程', '事故上报审批流程', '培训计划审批流程', '采购申请流程', '请假审批流程', '费用报销流程', '合同审批流程', '项目立项流程'];
  const defCodes = ['HAZARD_RECTIFY', 'ACCIDENT_REPORT', 'TRAINING_PLAN', 'PURCHASE_REQ', 'LEAVE_APPROVAL', 'EXPENSE_REIMBURSE', 'CONTRACT_APPROVAL', 'PROJECT_INIT'];
  for (let i = 0; i < 8; i++) {
    memoryDefs.push({ id: defIdCounter++, code: defCodes[i], name: defNames[i], description: `用于${defNames[i]}的标准化审批流程`, isActive: i % 4 !== 0, sortOrder: i + 1, createdAt: new Date(Date.now() - i * 86400000 * 2).toISOString(), createdBy: 'admin' });
  }
  const wfNames = ['隐患整改审批', '事故上报', '培训计划', '采购申请', '费用报销'];
  const wfTypes = ['hazard', 'accident', 'training', 'purchase', 'expense'];
  for (let i = 0; i < 30; i++) {
    const statuses = ['pending', 'processing', 'approved', 'rejected'];
    memoryInstances.push({ id: instIdCounter++, workflowId: (i % 5) + 1, workflowName: wfNames[i % 5], businessKey: `BUS-${1000 + i}`, businessType: wfTypes[i % 5], status: statuses[i % statuses.length], currentNode: ['部门负责人审批', '安全主管审批', '总经理审批'][i % 3], initiator: ['张三', '李四', '王五', '赵六'][i % 4], startedAt: new Date(Date.now() - i * 86400000).toISOString(), endedAt: undefined });
  }
  for (let i = 0; i < 15; i++) {
    const tStatuses = ['pending', 'approved', 'rejected'];
    memoryTasks.push({ id: taskIdCounter++, instanceId: Math.floor(i / 2) + 1, nodeName: ['部门负责人审批', '安全主管审批', '总经理审批'][i % 3], assignee: i % 3 === 0 ? '张三' : undefined, status: tStatuses[i % tStatuses.length], createdAt: new Date(Date.now() - i * 3600000 * 3).toISOString(), approvedAt: undefined, remark: i % 2 === 0 ? '同意' : '请补充材料' });
  }
}

// ========== GET /definitions — 流程定义列表 ==========
router.get('/definitions', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePgDefs())) {
      initMemoryData();
      let data = [...memoryDefs];
      const { keyword } = req.query as any;
      if (keyword) { const kw = String(keyword).toLowerCase(); data = data.filter(d => d.name.toLowerCase().includes(kw) || d.code.toLowerCase().includes(kw)); }
      const { page = 1, pageSize = 10 } = req.query as any;
      return res.json(success({ list: data.slice((Number(page) - 1) * Number(pageSize), Number(page) * Number(pageSize)), total: data.length }, '查询成功(内存模式)'));
    }

    let whereSql = ''; const params: any[] = [];
    const { page = 1, pageSize = 10, keyword } = req.query as any;
    if (keyword) { whereSql += " WHERE (name ILIKE $1 OR code ILIKE $1)"; params.push(`%{keyword}%`); }
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM workflow_definitions${whereSql}`, params);
    const offset = (Number(page) - 1) * Number(pageSize);
    params.push(Number(pageSize), offset);
    const result = await pool.query(`SELECT * FROM workflow_definitions${whereSql} ORDER BY sort_order, id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json(success({ list: result.rows.map(formatDef), total: countResult.rows[0].total }, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ========== POST /definitions — 创建 ==========
router.post('/definitions', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePgDefs())) {
      initMemoryData();
      const record = { id: defIdCounter++, ...req.body, createdAt: new Date().toISOString(), createdBy: 'admin' };
      memoryDefs.push(record); return res.json(success(record, '创建成功(内存模式)'));
    }
    const b = req.body;
    const result = await pool.query('INSERT INTO workflow_definitions(code,name,description,is_active,sort_order,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [b.code, b.name, b.description || '', b.isActive !== false, b.sortOrder || 1, b.createdBy || 'admin']);
    res.json(success(formatDef(result.rows[0]), '创建成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ========== PUT /definitions/:id — 更新 ==========
router.put('/definitions/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePgDefs())) {
      initMemoryData();
      const idx = memoryDefs.findIndex((d) => d.id === Number(req.params.id));
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      Object.assign(memoryDefs[idx], req.body); return res.json(success(memoryDefs[idx], '更新成功(内存模式)'));
    }
    const b = req.body;
    const result = await pool.query("UPDATE workflow_definitions SET code=COALESCE($2,code),name=COALESCE($3,name),description=COALESCE($4:description),is_active=COALESCE($5,is_active),sort_order=COALESCE($6,sort_order) WHERE id=$1 RETURNING *", [req.params.id, b.code, b.name, b.description, b.isActive, b.sortOrder]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatDef(result.rows[0]), '更新成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ========== DELETE /definitions/:id — 删除 ==========
router.delete('/definitions/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePgDefs())) {
      initMemoryData(); const idx = memoryDefs.findIndex((d) => d.id === Number(req.params.id));
      if (idx === -1) return res.json(error(-2, '记录不存在')); memoryDefs.splice(idx, 1);
      return res.json(success(null, '删除成功'));
    }
    await pool.query('DELETE FROM workflow_definitions WHERE id=$1', [req.params.id]);
    res.json(success(null, '删除成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ========== GET /instances — 流程实例列表 ==========
router.get('/instances', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePgDefs())) {
      initMemoryData();
      let data = [...memoryInstances];
      const { status, initiator } = req.query as any;
      if (status) data = data.filter(r => r.status === status);
      if (initiator) data = data.filter(r => r.initiator === initiator);
      const { page = 1, pageSize = 10 } = req.query as any;
      return res.json(success({ list: data.slice((Number(page) - 1) * Number(pageSize), Number(page) * Number(pageSize)), total: data.length }, '查询成功(内存模式)'));
    }

    let whereSql = ''; const params: any[] = [];
    const { page = 1, pageSize = 10, status, workflowId, initiator } = req.query as any;
    if (status) { params.push(status); whereSql += ` WHERE status = $${params.length}`; }
    if (workflowId) { params.push(workflowId); whereSql += `${whereSql ? ' AND' : ' WHERE'} workflow_id = $${params.length}`; }
    if (initiator) { params.push(initiator); whereSql += `${whereSql ? ' AND' : ' WHERE'} initiator = $${params.length}`; }
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM workflow_instances${whereSql}`, params);
    const offset = (Number(page) - 1) * Number(pageSize); params.push(Number(pageSize), offset);
    const result = await pool.query(`SELECT * FROM workflow_instances${whereSql} ORDER BY started_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json(success({ list: result.rows.map(formatInst), total: countResult.rows[0].total }, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ========== POST /instances/start — 启动流程 ==========
router.post('/instances/start', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePgDefs())) {
      initMemoryData();
      const record = { id: instIdCounter++, ...req.body, status: 'pending', currentNode: '部门负责人审批', startedAt: new Date().toISOString() };
      memoryInstances.push(record); return res.json(success(record, '启动成功(内存模式)'));
    }
    const b = req.body;
    const result = await pool.query("INSERT INTO workflow_instances(workflow_id,workflow_name,business_key,business_type,status,current_node,initiator,started_at) VALUES($1,'',$2,$3,'pending',$4,CURRENT_TIMESTAMP) RETURNING *", [b.workflowId, b.businessKey, b.businessType || '', b.initiator || '']);
    res.json(success(formatInst(result.rows[0]), '启动成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ========== GET /tasks — 任务列表 ==========
router.get('/tasks', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePgDefs())) {
      initMemoryData();
      let data = [...memoryTasks];
      const { status, assignee } = req.query as any;
      if (status) data = data.filter(r => r.status === status);
      if (assignee) data = data.filter(r => r.assignee === assignee);
      const { page = 1, pageSize = 10 } = req.query as any;
      return res.json(success({ list: data.slice((Number(page) - 1) * Number(pageSize), Number(page) * Number(pageSize)), total: data.length }, '查询成功(内存模式)'));
    }

    let whereSql = ''; const params: any[] = [];
    const { page = 1, pageSize = 10, status, assignee } = req.query as any;
    if (status) { params.push(status); whereSql += ` WHERE status = $${params.length}`; }
    if (assignee) { params.push(assignee); whereSql += `${whereSql ? ' AND' : ' WHERE'} assignee = $${params.length}`; }
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM workflow_tasks${whereSql}`, params);
    const offset = (Number(page) - 1) * Number(pageSize); params.push(Number(pageSize), offset);
    const result = await pool.query(`SELECT * FROM workflow_tasks${whereSql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json(success({ list: result.rows.map(formatTask), total: countResult.rows[0].total }, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

function formatDef(row: any) {
  return { id: row.id, code: row.code, name: row.name, description: row.description, isActive: row.is_active, sortOrder: row.sort_order, createdAt: row.created_at?.toISOString?.() || row.created_at, createdBy: row.created_by };
}
function formatInst(row: any) {
  return { id: row.id, workflowId: row.workflow_id, workflowName: row.workflow_name, businessKey: row.business_key, businessType: row.business_type, status: row.status, currentNode: row.current_node, initiator: row.initiator, startedAt: row.started_at?.toISOString?.() || row.started_at, endedAt: row.ended_at?.toISOString?.() || row.ended_at };
}
function formatTask(row: any) {
  return { id: row.id, instanceId: row.instance_id, nodeName: row.node_name, assignee: row.assignee, status: row.status, createdAt: row.created_at?.toISOString?.() || row.created_at, approvedAt: row.approved_at?.toISOString?.() || row.approved_at, remark: row.remark };
}

export default router;
