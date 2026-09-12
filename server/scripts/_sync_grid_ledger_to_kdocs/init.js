/**
 * 初始化 WPS 文档表头（首次运行前执行一次）
 *   node init.js
 * 多维表格：补齐字段；普通表格：写首行表头。
 */
'use strict';

const sink = require('./kdocsSink');

sink.ensureHeader()
  .then(() => console.log('[init] 表头已就绪（noop 模式仅打印操作）'))
  .catch((e) => {
    console.error('[init] 失败:', e.message);
    process.exitCode = 1;
  });
