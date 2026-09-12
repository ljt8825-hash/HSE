# Kdocs 多维表格图片批量上传操作手册（子代理必读，严格照做）

目标：把分配给你的 chunk 清单里的图片上传到 Kdocs 多维表格，并回填到对应记录的附件字段。

## 固定参数
- dbt file_id: `dgEXT2FACrM7BgbNq1gvrx85BsAXpdMwN`
- sheet_id: `2`
- 所需 MCP 工具（先用 ToolSearch 加载 schema，再用 DeferExecuteTool 调用）：
  - `mcp__kdocs__upload_attachment`
  - `mcp__kdocs__dbsheet.update_records`

## 输入文件（只读，不要修改）
- 任务清单：`G:/hse-dashboard/server/scripts/_sync_0908_dbt/chunks/chunk_XXX.json`
  每项格式：`{"media","file","size","placements":[{"bianhao","field","fileName"}]}`
- 编号→记录id 映射：`G:/hse-dashboard/server/scripts/_sync_0908_dbt/chunks/_recmap.json`
  格式：`{"L2521":"T", ...}`

## 对清单中每一项 media，按顺序执行
1. **生成 base64**（Bash，NN 替换为你的 chunk 号）：
   ```
   python -c "import base64;open(r'G:/hse-dashboard/server/scripts/_sync_0908_dbt/_b64tmp_NN.txt','w').write(base64.b64encode(open(r'<item.file>','rb').read()).decode())"
   ```
2. **Read** `G:/hse-dashboard/server/scripts/_sync_0908_dbt/_b64tmp_NN.txt`，得到 base64 字符串。
3. **上传**：`mcp__kdocs__upload_attachment`，参数：
   - `file_id="dgEXT2FACrM7BgbNq1gvrx85BsAXpdMwN"`
   - `filename=` 该项第一个 placement 的 `fileName`
   - `content_type="image/jpeg"`
   - `content_base64=` 上一步的完整 base64 字符串
   从返回中取 object_id（键名 `object_id` 或 `id`），`code` 必须为 0。
4. **回填**：对该项的每个 placement：
   - `rec_id = recmap[bianhao]`（若缺失：记错误、跳过该 placement）
   - 调用 `mcp__kdocs__dbsheet.update_records`：
     - `sheet_id=2`，`file_id` 同上
     - `records=[{"id":"<rec_id>","fields":{"<field>":[{"uploadId":"<object_id>","fileName":"<placement 的 fileName>","size":<item.size>,"source":"Cloud","type":"image/jpeg"}]}}]`
   - 返回 `code` 必须为 0。
5. **记录结果**：成功后立刻追加一行 JSON 到 `G:/hse-dashboard/server/scripts/_sync_0908_dbt/results/up_<NN>.jsonl`：
   `{"media":"<media>","oid":"<object_id>","ok":true}`
   （用 Bash python 以追加模式写，不要整文件重写）

## 失败处理
- 每一步失败重试 1 次；仍失败则追加 `{"media":"<media>","error":"<简短原因>","ok":false}` 到结果文件，然后**继续下一项**，不要中断、不要放弃整个 chunk。

## 纪律
- 严格按清单顺序处理，不跳项、不增加任务、不修改其他记录的其他字段。
- 临时 b64 文件按 chunk 号隔离（`_b64tmp_<NN>.txt`），避免并行冲突。
- 结果文件只追加。

## 最终报告（不超过 3 行）
`chunk_XXX: 成功 N / 失败 M`，失败时列出 media 名。**不要**在报告里粘贴 base64 或长 JSON。
