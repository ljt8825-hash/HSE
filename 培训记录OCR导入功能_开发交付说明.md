# 培训记录「导入」OCR 识别功能 —— 开发交付说明

- 日期：2026-08-28
- 涉及页面：二级菜单「培训考核 → 培训记录」（web-naive `/training/records`）
- 需求：「导入」按钮新增功能 —— 上传 PDF / 图片后，识别为结构化数据，一键转成 Excel 文档并入台账。

## 一、功能概述

在原「导入培训台账」通用导入弹窗基础上，新增 **PDF/图片 → Excel** 识别能力：

1. 用户点击「导入」，在上传区可直接拖拽/选择 **PDF / PNG / JPG / BMP / WebP** 文件；
2. 后端调用 **本地 Tesseract**（中文 chi_sim）识别为结构化表格行；
3. 弹窗内**预览识别结果**（姓名/部门/岗位/培训类型/培训日期/培训内容/成绩等列）；
4. 两种落地方式（用户要求**两者都要**）：
   - **下载 Excel**：点击「下载识别Excel」按钮，把识别结果导出为标准 `.xlsx`；
   - **确认入库**：点击「导入」按钮，把识别到的行写入 `training_records` 台账表；
5. 识别为尽力而为，入库前请人工核对预览。

> 说明：原有的 Excel/CSV 上传导入、下载模板流程**保持不变**，仅在训练台账模块启用 OCR 扩充。

## 二、依赖与环境

| 项 | 说明 |
|---|---|
| 识别引擎 | 本地 Tesseract，中文语言包 `chi_sim.traineddata` 已就绪 |
| Python | `server/.env` 中 `PYTHON_PATH=C:/Users/honey/.workbuddy/binaries/python/versions/3.13.12/python.exe` |
| Python 依赖 | `pytesseract`、`pymupdf(fitz)`、`Pillow`、`openpyxl`（本次已安装） |
| Node 依赖 | 复用 `server/package.json` 中的 `xlsx`（SheetJS）生成 Excel |

## 三、后端实现

### 3.1 新增文件 `server/routes/training-ocr.js`
已挂载到 `app.js`：`app.use('/api/training-ocr', trainingOcrRoutes);`。三个端点均要求 `admin / safety_manager` 角色：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/training-ocr/recognize` | 接收 `multipart file`，写入临时目录后调用 `scripts/ocr_ledger.py`，返回 `{ sourceType, columns, rows, message, sourceName }` |
| GET | `/api/training-ocr/export` | 接收 `rows / columns / sourceName`（base64 JSON 经 query 传入），用 SheetJS 生成 `.xlsx` 返回下载 |
| POST | `/api/training-ocr/confirm` | 接收 `{ rows }`，逐行写入 `training_records`，支持按 `id_card` 自动解析 `employee_id`，返回 `{ inserted }` |

- `resolvePythonPath()`：优先取 `process.env.PYTHON_PATH`，回退读取 `server/.env`，最后回退 `python`。
- 上传临时目录：`os.tmpdir()/hse-training-ocr`，识别结束后自动清理临时文件。
- `/export` 命名为 `{sourceName}_YYYYMMDD.xlsx`，通过 `filename*=UTF-8''` 支持中文文件名。

### 3.2 识别脚本 `scripts/ocr_ledger.py`
- **数字型 PDF**：优先用 PyMuPDF 直接抽文本（准确率最高）。
- **扫描件 PDF / 图片**：
  1. 放大位图 → 检测表格**竖线/横线**重建行列（规整表格识别最准）；
  2. 按格子逐个用 Tesseract `--psm 7` 单行识别；
  3. 表头词通过 `HEADER_ALIASES` 映射到台账字段；姓名字样兜底、空行/噪声过滤；
  4. 无网格线时回退按词的 top/left 聚类最佳重建。
- 输出单行 JSON：`{ ok, sourceType, columns, rows, message }`。

## 四、前端实现

| 文件 | 改动 |
|---|---|
| `apps/web-naive/src/api/trainingOcr.ts`（新增） | 封装 `ocrRecognize / ocrExportExcel / ocrConfirm` |
| `apps/web-naive/src/views/hse/_shared/useGenericImport.ts` | 新增可选的 OCR 模式：`useGenericImport(module, { ocr: true })`；上传 PDF/图片自动走识别接口，新增 `ocrActive / ocrRows / ocrColumns / ocrSourceName / onExportOcr`；`onConfirmImport` 在 OCR 态直接入库。**向后兼容**：其他模块不传 `{ocr:true}` 不受影响 |
| `apps/web-naive/src/components/hse/HseImportDialog.vue` | 新增可选 `ocr-enabled / ocr-active` props：OCR 态扩展 accept（含 pdf/图片）、新增「下载识别Excel」按钮。**默认不启用**，不影响其他模块 |
| `apps/web-naive/src/views/training/ledger/index.vue` | 传入 `useGenericImport('training-ledger', { ocr: true })`，绑定 `ocr-enabled / ocr-active / @export-ocr` |

> 前端三个基础模块均经 Vite 编译校验为 HTTP 200，无类型/编译错误。按钮文案用字面量「下载识别Excel」，未侵入共享 i18n。

## 五、识别与验证结果（受控 E2E）

- 使用 `scripts/_gen_sample.py` 生成的规整培训表格样例 PNG 验证：
  - `POST /recognize` → `code 0`，识别 **3 行**，识别列：姓名 / 部门 / 岗位 / 培训类型 / 培训日期 / 培训内容 / 成绩；
  - `GET /export` → `200`，返回合法 `.xlsx`（约 16KB），`Content-Disposition` 中文文件名正确；
  - `POST /confirm` → `成功入库 N 条`，并在 `/api/training/ledger` 列表查询到对应记录（字段一一对应，`training_date` 时区换算正确）；
  - 识别后已通过软删除清理全部测试数据，台账无残留。
- 不支持的扩展名上传 → 返回 `仅支持 PDF / PNG / JPG / BMP / WebP 文件`。
- 说明：OCR 存在识别噪声（如「消防」可能识别为「肖防」），属正常成像误差，入库前人工核对。

## 六、注意点与说明

1. **登录页存在滑块验证码**：自动化冒烟测试被其拦截，无法在浏览器内自动完成全流程；已用 curl 对后端三接口做等价端到端验证。请人工登录后手动上传一张样例 PDF/图片复核 UI。
2. `scripts/_sample_training.png`、`scripts/_gen_sample.py` 为开发期样例/生成器，供手工测试使用，可删除。
3. 后端本次由我重启加载新路由（原进程未热更）。若你之后用 `start-hse-naive.bat` 或自建脚本重启后端，需确保 `server/routes/training-ocr.js` 存在且 `app.js` 已挂载。

## 七、后续建议

- 若实际业务文件版式更复杂（合并单元格、多表头、无网格线报表），可扩展 `ocr_ledger.py` 的聚列/表头识别策略。
- 可将 OCR 识别能力下沉为通用服务，供其他需 PDF 导入的模块复用。