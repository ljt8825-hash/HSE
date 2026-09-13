/**
 * 风险管控路由 — 简化版（内存存储）
 * 文件: src/routes/risk-control.ts
 */

import { Router, Request, Response } from 'express';
import type { RiskRecord, RiskStats } from '../types';

const router = Router();

// 内存数据存储
let riskRecords: RiskRecord[] = [];
let nextId = 1;

// 获取所有风险记录
router.get('/', (req: Request, res: Response): void => {
  try {
    res.json({
      success: true,
      data: riskRecords,
      total: riskRecords.length,
    });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// 获取单条记录
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const record = riskRecords.find(r => r.id === req.params.id);
    if (!record) {
      res.json({ success: false, message: '记录不存在' });
      return;
    }
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// 创建记录
router.post('/', (req: Request, res: Response): void => {
  try {
    const newRecord: RiskRecord = {
      id: String(nextId++),
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    riskRecords.push(newRecord);
    res.json({ success: true, data: newRecord });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// 更新记录
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const index = riskRecords.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      res.json({ success: false, message: '记录不存在' });
      return;
    }
    riskRecords[index] = {
      ...riskRecords[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    res.json({ success: true, data: riskRecords[index] });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// 删除记录
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const index = riskRecords.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      res.json({ success: false, message: '记录不存在' });
      return;
    }
    riskRecords.splice(index, 1);
    res.json({ success: true, message: '删除成功' });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// 批量导入
router.post('/import', (req: Request, res: Response): void => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records)) {
      res.json({ success: false, message: 'records 必须是数组' });
      return;
    }

    const imported = records.map((r: any) => ({
      id: String(nextId++),
      ...r,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    riskRecords.push(...imported);

    res.json({
      success: true,
      data: { imported: imported.length, total: riskRecords.length },
    });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// 统计接口 - 全部
router.get('/stats/all', (req: Request, res: Response): void => {
  try {
    const stats: RiskStats = {
      total: riskRecords.length,
      byLevel: {
        '一级': riskRecords.filter(r => r.level === '一级').length,
        '二级': riskRecords.filter(r => r.level === '二级').length,
        '三级': riskRecords.filter(r => r.level === '三级').length,
        '四级': riskRecords.filter(r => r.level === '四级').length,
      },
      byType: {},
      byArea: {},
    };

    riskRecords.forEach(r => {
      if (r.type) {
        stats.byType[r.type] = (stats.byType[r.type] || 0) + 1;
      }
      if (r.area) {
        stats.byArea[r.area] = (stats.byArea[r.area] || 0) + 1;
      }
    });

    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// 统计接口 - 按等级
router.get('/stats/level', (req: Request, res: Response): void => {
  try {
    const byLevel = {
      '一级': riskRecords.filter(r => r.level === '一级').length,
      '二级': riskRecords.filter(r => r.level === '二级').length,
      '三级': riskRecords.filter(r => r.level === '三级').length,
      '四级': riskRecords.filter(r => r.level === '四级').length,
    };
    res.json({ success: true, data: byLevel });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// 统计接口 - 按类型
router.get('/stats/type', (req: Request, res: Response): void => {
  try {
    const byType: Record<string, number> = {};
    riskRecords.forEach(r => {
      if (r.type) {
        byType[r.type] = (byType[r.type] || 0) + 1;
      }
    });
    res.json({ success: true, data: byType });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

export default router;
