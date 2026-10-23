/**
 * risk-snapshot-admin 管理接口单元测试（mock service，不连库/不登录）
 * 覆盖：dry(默认不落库) / write(落库) / 非法 action 400 / service 异常 500
 */
const express = require('express');
const request = require('supertest');

jest.mock('../services/riskSnapshotService');
const { rebuildSnapshot } = require('../services/riskSnapshotService');

const router = require('../routes/risk-snapshot-admin');
const app = express();
app.use(express.json());
app.use('/api/hse/risk-snapshot-admin', router);

const mockResult = (mode, extra = {}) => ({
  mode, snapshotDate: '2026-09-29', ratedEmployees: 61,
  levelDistribution: { low: 56, medium: 5, high: 0, critical: 0 },
  counts: {}, identity: { hard: 35, unique: 25, dup: 0, missing: 14, dupNames: [], missNames: [] },
  topRisky: [], ...extra,
});

describe('risk-snapshot-admin POST /rebuild', () => {
  beforeEach(() => jest.clearAllMocks());

  test('缺省 action -> dry，不落库并返回预览', async () => {
    rebuildSnapshot.mockResolvedValue(mockResult('dry'));
    const res = await request(app).post('/api/hse/risk-snapshot-admin/rebuild').send({});
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(rebuildSnapshot).toHaveBeenCalledWith({ write: false });
    expect(res.body.data.mode).toBe('dry');
    expect(res.body.data.ratedEmployees).toBe(61);
  });

  test('action=write -> 落库', async () => {
    rebuildSnapshot.mockResolvedValue(mockResult('write', { wroteRows: 61 }));
    const res = await request(app).post('/api/hse/risk-snapshot-admin/rebuild').send({ action: 'write' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(rebuildSnapshot).toHaveBeenCalledWith({ write: true });
    expect(res.body.data.wroteRows).toBe(61);
  });

  test('非法 action -> 400，不调用 service', async () => {
    const res = await request(app).post('/api/hse/risk-snapshot-admin/rebuild').send({ action: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1);
    expect(rebuildSnapshot).not.toHaveBeenCalled();
  });

  test('service 抛错 -> 500', async () => {
    rebuildSnapshot.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/api/hse/risk-snapshot-admin/rebuild').send({ action: 'dry' });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe(1);
    expect(res.body.message).toBe('boom');
  });
});