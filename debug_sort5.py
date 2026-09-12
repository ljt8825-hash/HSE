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
      for(let i=0;i<10 && c;i++){
        if(c.type && c.type.name==='VxeGrid'){ vxeGrid=c; break; }
        c = c.parent;
      }
      if(!vxeGrid) return {err:'no VxeGrid'};
      const api = vxeGrid.proxy;
      const hasSort = typeof api.sort==='function';
      const hasGetData = typeof api.getData==='function';
      const getData = () => hasGetData ? api.getData().map(r=>r.code) : 'no getData';
      const before = getData();
      const out = {hasSort, hasGetData, before};
      try {
        api.sort('code','asc');
        out.afterAsc = getData();
        out.sortColsAsc = api.getSortColumns ? api.getSortColumns() : 'n/a';
        out.sortStateAsc = api.getSortConfig ? api.getSortConfig() : 'n/a';
        api.sort('code','desc');
        out.afterDesc = getData();
        out.sortColsDesc = api.getSortColumns ? api.getSortColumns() : 'n/a';
        api.clearSort();
        out.afterClear = getData();
        out.sortColsClear = api.getSortColumns ? api.getSortColumns() : 'n/a';
      } catch(e){ out.err = e.message + ' | ' + (e.stack||'').split('\\n')[1]; }
      return out;
    }""")
    print("PROGRAMMATIC THREE-STATE:", res)

    # Also check DOM row order after programmatic asc
    card = page.locator(".n-card", has_text="HseDataGrid")
    def codes():
        rows = card.locator(".vxe-body--row")
        return [rows.nth(i).locator(".vxe-cell").first.inner_text().strip() for i in range(rows.count())]
    print("DOM codes after programmatic asc:", codes())
    browser.close()
print("DEBUG5 DONE")
