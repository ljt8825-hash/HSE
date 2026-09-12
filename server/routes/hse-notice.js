const express = require('express');
const router = express.Router();
const { success } = require('../middleware/response');

router.get('/', (req, res) => {
  res.json(success({ list: [], total: 0 }, '通知列表(占位)'));
});

router.get('/stats', (req, res) => {
  res.json(success({ total: 0, unread: 0 }, '通知统计(占位)'));
});

router.get('/unread-count', (req, res) => {
  res.json(success({ count: 0 }, '未读数量(占位)'));
});

router.get('/:id', (req, res) => {
  res.json(success(null, '通知详情(占位)'));
});

router.put('/:id/read', (req, res) => {
  res.json(success(null, '已标记为已读(占位)'));
});

router.put('/mark-all-read', (req, res) => {
  res.json(success(null, '全部已读(占位)'));
});

module.exports = router;