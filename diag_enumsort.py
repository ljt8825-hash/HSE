import json, time
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8091/hse/overview"
def main():
    out = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
        page = browser.new_page(viewport={"width":1400,"height":1000})
        page.goto(BASE, wait_until="load")
        page.wait_for_selector(".vxe-header--column.is--sortable", timeout=30000)
        time.sleep(1.5)
        page.evaluate(r"""() => { const th=document.querySelector('.vxe-header--column.is--sortable'); let c=th.__vueParentComponent; while(c){const p=c.proxy; if(p&&typeof p.getSortColumns==='function'){window.__vxe=p;break;} c=c.parent;} }""")
        methods = page.evaluate(r"""() => {
          const inst = window.__vxe;
          const names = Object.getOwnPropertyNames(Object.getPrototypeOf(inst));
          return names.filter(n => /sort/i.test(n));
        }""")
        out["sort_methods"] = methods
        # also check gridOptions sortConfig currently
        out["remote"] = page.evaluate(r"""() => { const inst=window.__vxe; try { return inst.getSortConfig ? inst.getSortConfig() : 'no'; } catch(e){ return 'err:'+e.message; } }""")
        browser.close()
    print(json.dumps(out, ensure_ascii=False, indent=2))
main()
