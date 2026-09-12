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
      let c = gridEl.__vueParentComponent;
      let vxeGrid=null;
      for(let i=0;i<10 && c;i++){ if(c.type && c.type.name==='VxeGrid'){ vxeGrid=c; break;} c=c.parent; }
      const api = vxeGrid.proxy;
      const out = {};
      try {
        const cm = api.getComputeMaps ? api.getComputeMaps() : null;
        out.hasComputeMaps = !!cm;
        if(cm && cm.computeSortOpts){
          const so = cm.computeSortOpts.value;
          out.sortOpts = {trigger: so.trigger, allowBtn: so.allowBtn, remote: so.remote, multiple: so.multiple, orders: so.orders};
        } else { out.cmKeys = cm? Object.keys(cm).slice(0,30):'none'; }
      } catch(e){ out.err = e.message; }
      // also try reading column.order after a programmatic sort to confirm state changes
      try {
        api.sort('code','asc');
        out.afterProgAsc_cols = api.getSortColumns? api.getSortColumns().map(x=>({field:x.field,order:x.order})):'n/a';
      } catch(e){ out.progErr = e.message; }
      return out;
    }""")
    print("RESULT:", res)
    browser.close()
print("DEBUG8 DONE")
