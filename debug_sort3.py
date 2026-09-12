from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome",
        args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
    page = browser.new_page(viewport={"width":1440,"height":1600})
    page.goto(BASE + "/hse/overview", wait_until="networkidle")
    page.wait_for_selector(".vxe-table", timeout=30000)
    page.wait_for_timeout(1500)

    card = page.locator(".n-card", has_text="HseDataGrid")
    th = card.locator("th", has_text="编号").first
    box = th.bounding_box()
    cx = box["x"] + box["width"]/2
    cy = box["y"] + box["height"]/2
    print("th center:", cx, cy)

    # What element is actually at that point?
    top = page.evaluate("([x,y]) => { const el=document.elementFromPoint(x,y); return el? (el.tagName+'.'+el.className+' | path='+ (el.closest('th')?'TH':el.closest('td')?'TD':'other')) : 'none'; }", [cx, cy])
    print("elementFromPoint at th center:", top)

    # Get the vxe-grid instance and inspect sortConfig + try programmatic sort
    info = page.evaluate("""() => {
      const gridEl = document.querySelector('.vxe-grid');
      if(!gridEl) return {err:'no .vxe-grid'};
      const comp = gridEl.__vueParentComponent;
      // walk up to find component with getGrid or gridApi
      let c = comp;
      let found=null;
      for(let i=0;i<8 && c;i++){
        if(c.proxy && (c.proxy.getGrid || c.proxy.gridApi || c.proxy.grid)) { found=c; break; }
        c = c.parent;
      }
      if(!found) return {err:'no grid component found', hasComp: !!comp};
      const inst = found.proxy;
      let grid = inst.getGrid ? inst.getGrid() : (inst.grid || (inst.gridApi && inst.gridApi.grid));
      if(!grid) return {err:'no grid instance', keys: Object.keys(inst).slice(0,20)};
      const sc = grid.getSortConfig ? grid.getSortConfig() : (grid.sortConfig);
      // try programmatic sort
      let before = grid.getData ? grid.getData().map(r=>r.code) : 'n/a';
      try { grid.sort('code','asc'); } catch(e){ return {err:'sort call failed: '+e.message, sortConfig: sc}; }
      let afterAsc = grid.getData ? grid.getData().map(r=>r.code) : 'n/a';
      return {sortConfig: sc, before, afterAsc, sortColumns: grid.getSortColumns ? grid.getSortColumns() : 'n/a'};
    }""")
    print("GRID INFO:", info)
    browser.close()
print("DEBUG3 DONE")
