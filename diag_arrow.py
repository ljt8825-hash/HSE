import json, time
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8091/hse/overview"
def main():
    out = {"steps": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
        page = browser.new_page(viewport={"width":1400,"height":1000})
        page.goto(BASE, wait_until="load")
        page.wait_for_selector(".vxe-header--column.is--sortable", timeout=30000)
        time.sleep(1.5)
        page.evaluate(r"""() => { const th=document.querySelector('.vxe-header--column.is--sortable'); let c=th.__vueParentComponent; while(c){const p=c.proxy; if(p&&typeof p.getSortColumns==='function'){window.__vxe=p;break;} c=c.parent;} }""")
        def dump():
            return page.evaluate(r"""() => {
              const th = document.querySelector('.vxe-header--column.is--sortable');
              const cls = th ? th.className : '';
              const btns = Array.from(th.querySelectorAll('.vxe-sort--asc-btn, .vxe-sort--desc-btn')).map(b=>b.className);
              const order = window.__vxe.getColumns().find(c=>c.field==='code')?.order;
              // getSortColumns alternative: iterate columns for order
              return { thClass: cls, sortBtns: btns, colOrder: order };
            }""")
        out["steps"].append({"step":"initial", **dump()})
        th = page.locator(".vxe-header--column.is--sortable").first
        for i in range(1,4):
            th.scroll_into_view_if_needed(); b=th.bounding_box()
            page.mouse.click(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
            time.sleep(1.5)
            out["steps"].append({"step":f"click{i}", **dump()})
        browser.close()
    print(json.dumps(out, ensure_ascii=False, indent=2))
main()
