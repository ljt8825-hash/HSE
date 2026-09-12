"""Final verification: click 编号 header 3x, capture VXE internal order, data order, AND arrow/active classes."""
import json, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8091/hse/overview"


def snap(page):
    return page.evaluate(
        r"""() => {
          const inst = window.__vxe;
          const th = document.querySelector('.vxe-header--column.is--sortable');
          const colId = th ? (th.className.match(/col_(\d+)/)||[])[1] : null;
          // arrow active indicator classes
          const cls = th ? th.className : '';
          const ascActive = /col--sort-asc/.test(cls) || !!th.querySelector('.vxe-sort--asc-btn.is--active');
          const descActive = /col--sort-desc/.test(cls) || !!th.querySelector('.vxe-sort--desc-btn.is--active');
          const sortBtns = th ? th.querySelectorAll('.vxe-sort--asc-btn, .vxe-sort--desc-btn').length : 0;
          let sortCols = [];
          try { sortCols = inst.getSortColumns().map(c=>({field:c.field, order:c.order})); } catch(e){}
          const rows = Array.from(document.querySelectorAll('.vxe-table--body tbody tr'));
          const order = rows.map(r => { const c=r.querySelector('td .vxe-cell'); return c?c.textContent.trim():''; });
          return { colId, ascActive, descActive, sortBtns, sortCols, order };
        }"""
    )


def main():
    out = {"steps": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=[
            "--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
            "--single-process","--no-zygote"])
        page = browser.new_page(viewport={"width":1400,"height":1000})
        page.goto(BASE, wait_until="load")
        page.wait_for_selector(".vxe-header--column.is--sortable", timeout=30000)
        time.sleep(1.5)
        out["steps"].append({"step":"initial", **snap(page)})
        th = page.locator(".vxe-header--column.is--sortable").first
        for i in range(1,4):
            th.scroll_into_view_if_needed()
            b = th.bounding_box()
            page.mouse.click(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
            time.sleep(1.0)
            out["steps"].append({"step":f"click{i}", **snap(page)})
        browser.close()
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
