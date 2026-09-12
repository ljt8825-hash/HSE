import zipfile, re, json, os
from collections import defaultdict

SRC = "Y:/月度考核/三违/9月/2026-09-1-6新版-按日期排序.xlsx"
BASE = "G:/hse-dashboard/server/scripts/_sync_0908_dbt"
MEDIA = os.path.join(BASE, "media")
MAPJSON = os.path.join(BASE, "img_map.json")
os.makedirs(MEDIA, exist_ok=True)

z = zipfile.ZipFile(SRC)

# 1) cellimages.xml: ID_xxx -> rId ; rels rId -> media
cixml = z.read('xl/cellimages.xml').decode('utf-8')
cid_map = {}
for blk in re.findall(r'<etc:cellImage>.*?</etc:cellImage>', cixml, re.S):
    nm = re.search(r'name="(ID_[0-9A-F]+)"', blk)
    rid = re.search(r'r:embed="(rId\d+)"', blk)
    if nm and rid:
        cid_map[nm.group(1)] = rid.group(1)
rels = z.read('xl/_rels/cellimages.xml.rels').decode('utf-8')
rid_to_media = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(media/[^"]+)"', rels))

# 2) worksheet: cell ref -> image ID  (handle &quot; entities)
sheet = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
cells = []
for m in re.finditer(r'<c r="([A-Z]+\d+)"[^>]*>(.*?)</c>', sheet, re.S):
    ref, inner = m.group(1), m.group(2)
    fid = re.search(r'DISPIMG\((?:&quot;|")?(ID_[0-9A-F]+)(?:&quot;|")?,1\)', inner)
    if fid:
        cells.append((ref, fid.group(1)))
print("DISPIMG cells:", len(cells))

def col_to_idx(s):
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - 64)
    return n

COLMAP = {8: "三违照片图片1", 9: "三违照片图片2", 10: "三违照片图片3", 15: "整改后照片图片1"}
rec_imgs = defaultdict(dict)
missing = 0
for ref, cid in cells:
    col = col_to_idx(re.match(r'([A-Z]+)', ref).group(1))
    row = int(re.match(r'[A-Z]+(\d+)', ref).group(1))
    rid = cid_map.get(cid)
    media = rid_to_media.get(rid) if rid else None
    if not media:
        missing += 1
        continue
    fname = COLMAP.get(col)
    if fname:
        rec_imgs[row].setdefault(fname, []).append(media)

# 3) read 编号/姓名/日期 per row
import openpyxl
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb["2026-09详细数据"]
def cv(row, col):
    return ws.cell(row=row, column=col).value

# 4) extract media bytes to disk, map media path -> local file
seen = set()
def local_name(media):
    return os.path.basename(media)
for d in rec_imgs.values():
    for lst in d.values():
        for media in lst:
            if media in seen:
                continue
            seen.add(media)
            data = z.read('xl/' + media)
            with open(os.path.join(MEDIA, os.path.basename(media)), 'wb') as f:
                f.write(data)

# 5) build final mapping for upload
out = []
for row in sorted(rec_imgs.keys()):
    d = rec_imgs[row]
    rec = {
        "row": row,
        "bianhao": cv(row, 20),
        "xingming": cv(row, 4),
        "riqi": cv(row, 7),
        "imgs": {k: [os.path.basename(m) for m in v] for k, v in d.items()},
    }
    out.append(rec)

with open(MAPJSON, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

n_images = sum(len(v) for d in rec_imgs.values() for v in d.values())
print("rows with images:", len(rec_imgs))
print("total image placements:", n_images)
print("unique media files:", len(seen), "/ media in zip:", 449)
print("missing (no media):", missing)
# count per field
from collections import Counter
fc = Counter()
for d in rec_imgs.values():
    for k in d:
        fc[k] += 1
print("rows per field:", dict(fc))
# rows without 编号
no_bh = [r for r in out if not r["bianhao"]]
print("rows without 编号:", len(no_bh), [(r["row"], r["xingming"]) for r in no_bh])
print("wrote", MAPJSON)
