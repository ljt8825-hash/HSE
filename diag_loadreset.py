"""Does loadData reset VXE sort order? Test: set sort programmatically, then loadData, check order."""
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

        # resolve VXE instance -> window.__vxe
        page.evaluate(r"""
        () => {
          const th = document.querySelector('.vxe-header--column.is--sortable');
          let comp = th.__vueParentComponent;
          while (comp) {
            const p = comp.proxy;
            if (p && typeof p.getSortColumns === 'function') { window.__vxe = p; break; }
            comp = comp.parent;
          }
        }
        """)

        # programmatic sort asc
        r1 = page.evaluate(r"""() => {
          const inst = window.__vxe;
          inst.sort('code','asc');
          return inst.getSortColumns().map(c=>({field:c.field, order:c.order}));
        }""")
        # now loadData (same data) and re-check
        r2 = page.evaluate(r"""() => {
          const inst = window.__vxe;
          const data = inst.getTableData ? inst.getTableData().fullData : [];
          inst.loadData(data);
          return inst.getSortColumns().map(c=>({field:c.field, order:c.order}));
        }""")
        out["after_sort_asc"] = r1
        out["after_loadData"] = r2
        browser.close()
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
