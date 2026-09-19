"""生成 index.js 的 deploy 变体：把「供测试复用的具名导出」抽掉。

背景（CF-WPS-31b）：
  本机 wrangler 3.114.17 启动时报
    Uncaught TypeError: Incorrect type for map entry 'ORG_MAX_DEPTH':
    the provided value is not of type 'function or ExportedHandler'
  index.js 末尾有 61 个非函数具名导出（只为 Node 离线测试复用），
  新运行时的严格模块校验会拒绝它们与 `export default { fetch }` 共存。

做法：原 index.js 不动（离线测试仍 import 它）；另生成 worker/deploy.js =
  index.js 删掉「顶部 re-export 行」+「末尾的多行 export 块」，
  只留 `export default { fetch }`。wrangler.toml 的 main 指向 deploy.js。
"""
import pathlib, re

W = pathlib.Path('.')
src = (W / 'index.js').read_text(encoding='utf-8')
lines = src.split('\n')

# ① 先定位 `export default {` 块结束（避免把它的收尾 `};` 当成具名导出块的收尾）
def_i = next(i for i, l in enumerate(lines) if l.strip().startswith('export default'))
# default 块：从 default 行起，找配平到 0 的那一行
d = 0
def_end = None
for i in range(def_i, len(lines)):
    d += lines[i].count('{') - lines[i].count('}')
    if d == 0:
        def_end = i
        break
assert def_end is not None, 'cannot find end of export default block'
print('export default 块: 行 %d..%d' % (def_i + 1, def_end + 1))

# ② 具名导出块一定在 default 块之后
end = None
for i in range(len(lines) - 1, def_end, -1):
    if lines[i].strip() == '};':
        end = i
        break
assert end is not None, 'no closing }; after default block'

start = None
for i in range(end, def_end, -1):
    if re.fullmatch(r'export\s*\{', lines[i].strip()):
        start = i
        break
assert start is not None, 'no opening export { after default block'
assert start > def_end, 'opening export { is before default block end'
print('删除具名导出块: 行 %d..%d' % (start + 1, end + 1))

# ③ 顶部单行 re-export（export { a, b } from './x.js';）
reexp = [i for i, l in enumerate(lines)
         if re.match(r"^export\s*\{[^}]*\}\s*from\s*['\"]\./", l.strip())]
print('删除顶部 re-export 行:', [i + 1 for i in reexp] or '无')

drop = set(range(start, end + 1))          # ⚠️ 整段都要删（含中间的 60 行名单），不是只删首尾
drop.update(reexp)
# 连带删掉具名导出块紧邻的注释行
for i in range(max(def_end + 1, start - 4), start):
    if i not in drop and lines[i].strip().startswith('//'):
        drop.add(i)

out = [l for i, l in enumerate(lines) if i not in drop]
# 去掉尾部多余空行
while out and not out[-1].strip():
    out.pop()

js = '\n'.join(out) + '\n'
assert 'export default' in js, 'lost default export'
left = [l for l in out if re.match(r'^\s*export\s*\{', l)]
assert not left, 'leftover named export: %r' % left

# ⚠️ 必须用二进制写入再附加校验：
#   Windows 上 write_text() 会把 '\n' 转成 '\r\n'（newline 默认 None → os.linesep 转换），
#   导致「deploy.js 与 index.js 前 N 行逐字节一致」的承诺不成立，且 CRLF 混入大文件有解析隐患。
#   本文件全 LF（源 index.js 实测首行尾 0a），必须原样保持。
data = js.encode('utf-8')
(W / 'deploy.js').write_bytes(data)

# 校验：真实落盘字节里不得出现 CR
raw = (W / 'deploy.js').read_bytes()
assert b'\r' not in raw, 'CRLF leaked into deploy.js (offset %d)' % raw.find(b'\r')
print('已生成 deploy.js (%d 行, 原 %d 行, %d 字节, 纯 LF)' % (len(out), len(lines), len(raw)))

# 校验：与源文件「保留行」逐字节一致（这次是真的逐字节）
src_raw = src.encode('utf-8')
keep_raw = ('\n'.join(out) + '\n').encode('utf-8')
assert raw == keep_raw, 'byte mismatch'
# 再验：index.js 的前 len(out) 行 = deploy.js 全部行
head_raw = '\n'.join(src.split('\n')[:len(out)]).encode('utf-8') + b'\n'
print('前 %d 行与 index.js 逐字节一致: %s' % (len(out), head_raw == raw))
