from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome",
        args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
    page = browser.new_page(viewport={"width":1440,"height":1600})
    page.goto(BASE + "/hse/overview", wait_until="networkidle")
    page.wait_for_selector(".vxe-table", timeout=30000)
    page.wait_for_timeout(1500)

    # attach sort-change listener and expose a capture array
    page.evaluate("""() => {
      window.__sortEvents = [];
      const gridEl = document.querySelector('.vxe-grid');
      let c = gridEl.__vueParentComponent;
      let vxeGrid=null;
      for(let i=0;i<10 && c;i++){ if(c.type && c.type.name==='VxeGrid'){ vxeGrid=c; break;} c=c.parent; }
      const api = vxeGrid.proxy;
      if(typeof api.on==='function'){
        api.on('sort-change', (...a)=>{ window.__sortEvents.push(JSON.parse(JSON.stringify(a.map(x=>x&&x.field!==undefined?{field:x.field,order:x.order,prop:x.property}:x)))); });
      }
      window.__hasOn = typeof api.on==='function';
      window.__api = api;
    }""")

    card = page.locator(".n-card", has_text="HseDataGrid")
    th = card.locator("th", has_text="编号").first
    box = th.bounding_box()
    cx = box["x"] + box["width"]/2
    cy = box["y"] + box["height"]/2

    def codes():
        rows = card.locator(".vxe-body--row")
        return [rows.nth(i).locator(".vxe-cell").first.inner_text().strip() for i in range(rows.count())]
    def sortcols():
        return page.evaluate("() => { const g=window.__api; return g.getSortColumns? g.getSortColumns().map(c=>({field:c.field,order:c.order})) : 'n/a'; }")

    print("before codes:", codes(), "sortcols:", sortcols(), "hasOn:", page.evaluate("()=>window.__hasOn"))
    for i in range(1,4):
        page.mouse.click(cx, cy)
        page.wait_for_timeout(700)
        print(f"click{i}: codes={codes()} sortcols={sortcols()} events={page.evaluate('()=>window.__sortEvents')}")

    # Now test: after a click that fired sort-change, does the parent reorder?
    # Manually call api.sort then check if onSortChange path works by reading gridData via DOM.
    browser.close()
print("DEBUG6 DONE")
