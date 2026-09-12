from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome",
        args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
    page = browser.new_page(viewport={"width":1440,"height":1600})
    page.goto(BASE + "/hse/overview", wait_until="networkidle")
    page.wait_for_selector(".vxe-table", timeout=30000)
    page.wait_for_timeout(1500)

    res = page.evaluate("""() => {
      const gridEl = document.querySelector('.vxe-grid');
      if(!gridEl) return {err:'no .vxe-grid'};
      let c = gridEl.__vueParentComponent;
      const chain = [];
      for(let i=0;i<10 && c;i++){
        const proxy = c.proxy || {};
        const methods = Object.getOwnPropertyNames(proxy).filter(k=>typeof proxy[k]==='function');
        const hasGrid = !!(proxy.getGrid || proxy.grid || proxy.gridApi || proxy.getVxeGrid);
        chain.push({name: c.type && c.type.name, hasGrid, sample: methods.slice(0,12)});
        c = c.parent;
      }
      return {chain};
    }""")
    print("COMP CHAIN:", res)

    # Try to get grid and do programmatic three-state sort
    res2 = page.evaluate("""() => {
      const gridEl = document.querySelector('.vxe-grid');
      let c = gridEl.__vueParentComponent;
      let gridComp=null;
      for(let i=0;i<10 && c;i++){
        const proxy = c.proxy || {};
        if(proxy.getGrid || proxy.grid || proxy.gridApi){ gridComp=c; break; }
        c = c.parent;
      }
      if(!gridComp) return {err:'no grid comp'};
      const proxy = gridComp.proxy;
      const inst = (proxy.getGrid? proxy.getGrid() : (proxy.grid || (proxy.gridApi && proxy.gridApi.grid)));
      if(!inst) return {err:'no grid instance', proxyKeys: Object.getOwnPropertyNames(proxy).filter(k=>typeof proxy[k]==='function').slice(0,30)};
      const getData = () => inst.getData ? inst.getData().map(r=>r.code) : 'n/a';
      const before = getData();
      const out = {before};
      try {
        inst.sort('code','asc');
        out.afterAsc = getData();
        out.sortColsAsc = inst.getSortColumns ? inst.getSortColumns() : 'n/a';
        inst.sort('code','desc');
        out.afterDesc = getData();
        out.sortColsDesc = inst.getSortColumns ? inst.getSortColumns() : 'n/a';
        inst.clearSort();
        out.afterClear = getData();
        out.sortColsClear = inst.getSortColumns ? inst.getSortColumns() : 'n/a';
      } catch(e){ out.err = e.message; }
      return out;
    }""")
    print("PROGRAMMATIC SORT:", res2)
    browser.close()
print("DEBUG4 DONE")
