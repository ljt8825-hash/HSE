from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome",
        args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
    page = browser.new_page(viewport={"width":1440,"height":1600})
    page.goto(BASE + "/hse/overview", wait_until="networkidle")
    page.wait_for_selector(".vxe-table", timeout=30000)
    page.wait_for_timeout(1500)

    cfg = page.evaluate("""() => {
      const gridEl = document.querySelector('.vxe-grid');
      let c = gridEl.__vueParentComponent;
      let vxeGrid=null;
      for(let i=0;i<10 && c;i++){ if(c.type && c.type.name==='VxeGrid'){ vxeGrid=c; break;} c=c.parent; }
      const api = vxeGrid.proxy;
      const out = {};
      try { out.sortConfig = api.getSortConfig ? api.getSortConfig() : 'no getSortConfig'; } catch(e){ out.sortConfigErr = e.message; }
      // also the full grid options
      try { out.fullOpts = api.getGridOptions ? api.getGridOptions() : 'no getGridOptions'; } catch(e){ out.fullOptsErr=e.message; }
      return out;
    }""")
    import json
    sc = cfg.get('sortConfig')
    print("SORTCONFIG:", json.dumps(sc, ensure_ascii=False) if isinstance(sc,dict) else sc)
    # print trigger-related from fullOpts
    fo = cfg.get('fullOpts')
    if isinstance(fo, dict):
        print("fullOpts.sortConfig:", json.dumps(fo.get('sortConfig'), ensure_ascii=False))
        print("fullOpts.sortable cols:", [c.get('field') for c in fo.get('columns',[]) if c.get('sortable')])

    # Try clicking the caret icon directly with mouse at its box
    card = page.locator(".n-card", has_text="HseDataGrid")
    th = card.locator("th", has_text="编号").first
    asc = th.locator(".vxe-sort--asc-btn")
    b = asc.bounding_box()
    print("asc icon box:", b)
    if b:
        page.mouse.click(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
        page.wait_for_timeout(600)
    sortcols = page.evaluate("() => { const g=document.querySelector('.vxe-grid').__vueParentComponent; let c=g; for(let i=0;i<10&&c;i++){if(c.type&&c.type.name==='VxeGrid')break;c=c.parent;} const api=c.proxy; return api.getSortColumns? api.getSortColumns().map(x=>({field:x.field,order:x.order})):'n/a'; }")
    print("sortcols after caret click:", sortcols)
    browser.close()
print("DEBUG7 DONE")
