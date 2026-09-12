const express = require('express');
const router = express.Router();
const { success } = require('../middleware/response');

router.get('/', (req, res) => {
  res.json(success({ list: [], total: 0 }, '隐患基线列表(占位)'));
});

router.get('/:id', (req, res) => {
  res.json(success(null, '隐患基线详情(占位)'));
});

router.post('/', (req, res) => {
  res.json(success({ id: 1, ...req.body }, '创建隐患基线(占位)'));
});

router.put('/:id', (req, res) => {
  res.json(success({ id: req.params.id, ...req.body }, '更新隐患基线(占位)'));
});

router.delete('/:id', (req, res) => {
  res.json(success(null, '删除隐患基线(占位)'));
});

module.exports = router;