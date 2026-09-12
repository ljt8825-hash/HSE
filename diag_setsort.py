"""Does inst.setSort emit sort-change (loop risk)? And does it show order?"""
import json, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8091/hse/overview"

def main():
    out = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=[
            "--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
            "--single-process","--no-zygote"])
        page = browser.new_page(viewport={"width":1400,"height":1000})
        page.goto(BASE, wait_until="load")
        page.wait_for_selector(".vxe-header--column.is--sortable", timeout=30000)
        time.sleep(1.5)
        page.evaluate(r"""
        () => {
          const th = document.querySelector('.vxe-header--column.is--sortable');
          let comp = th.__vueParentComponent;
          while (comp) { const p = comp.proxy; if (p && typeof p.getSortColumns === 'function') { window.__vxe = p; break; } comp = comp.parent; }
        }""")

        # current tbody order
        def tbody():
            return page.evaluate(r"""() => Array.from(document.querySelectorAll('.vxe-table--body tbody tr')).map(r=>{const c=r.querySelector('td .vxe-cell');return c?c.textContent.trim():'';})""")

        out["before"] = {"sort": page.evaluate("() => window.__vxe.getSortColumns().map(c=>({field:c.field,order:c.order}))"), "tbody": tbody()}

        # call setSort desc; check if data reorders (loop) and if order set
        page.evaluate(r"""() => { window.__vxe.setSort('code','desc'); }""")
        time.sleep(0.8)
        out["after_setSort_desc"] = {"sort": page.evaluate("() => window.__vxe.getSortColumns().map(c=>({field:c.field,order:c.order}))"), "tbody": tbody()}

        browser.close()
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
