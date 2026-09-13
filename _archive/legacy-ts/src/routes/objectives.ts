/**
 * 目标管理路由 - PostgreSQL + 内存降级双模式
 * 子路由（均无对应数据库表，使用内存模式）:
 *   /contract        → 安全合同
 *   /org-personnel   → 组织人员
 *   /responsibility  → 安全责任制
 *   /safety-budget   → 安全投入
 * 文件: src/routes/objectives.ts
 */

import { Router, Request, Response } from 'express';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存存储 ==========
const memoryStores: Record<string, any[]> = {
  contract: [],
  orgPersonnel: [],
  responsibility: [],
  safetyBudget: []
};
const memoryCounters: Record<string, number> = { contract: 1, orgPersonnel: 1, responsibility: 1, safetyBudget: 1 };

// ========== 通用内存 CRUD 工厂 ==========
function createMemoryCrud(storeName: string, basePath: string): void {
  // GET /
  router.get(`/${basePath}`, async (req: Request, res: Response): Promise<any> => {
    try {
      let data = memoryStores[storeName].filter((r: any) => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter((r: any) => JSON.stringify(r).toLowerCase().includes(kw));
      }
      const total = data.length;
      const offset = (page - 1) * pageSize;
      const list = data.slice(offset, offset + parseInt(pageSize));
      res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });

  // GET /:id
  router.get(`/${basePath}/:id`, async (req: Request, res: Response): Promise<any> => {
    try {
      const r = memoryStores[storeName].find((r: any) => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) {
        res.json(error(-2, '记录不存在'));
        return;
      }
      res.json(success(r, '查询成功'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });

  // POST /
  router.post(`/${basePath}`, async (req: Request, res: Response): Promise<any> => {
    try {
      const record = { id: memoryCounters[storeName]++, ...req.body, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores[storeName].push(record);
      res.json(success(record, '创建成功(内存模式)'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });

  // PUT /:id
  router.put(`/${basePath}/:id`, async (req: Request, res: Response): Promise<any> => {
    try {
      const idx = memoryStores[storeName].findIndex((r: any) => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) {
        res.json(error(-2, '记录不存在'));
        return;
      }
      Object.assign(memoryStores[storeName][idx], req.body, { updated_at: new Date().toISOString() });
      res.json(success(memoryStores[storeName][idx], '更新成功(内存模式)'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });

  // DELETE /:id
  router.delete(`/${basePath}/:id`, async (req: Request, res: Response): Promise<any> => {
    try {
      const r = memoryStores[storeName].find((r: any) => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) {
        res.json(error(-2, '记录不存在'));
        return;
      }
      r.is_deleted = true;
      res.json(success(null, '删除成功(内存模式)'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });
}

createMemoryCrud('contract', 'contract');
createMemoryCrud('orgPersonnel', 'org-personnel');
createMemoryCrud('responsibility', 'responsibility');
createMemoryCrud('safetyBudget', 'safety-budget');

export default router;
