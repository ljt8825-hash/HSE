"""Measure tbody row order + col id after each real header click.
If tbody reorders on click2/click3, sort-change IS firing (data re-sorted by onSortChange)
but VXE's internal order (arrow) is wiped by the column rebuild.
"""
import json
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8090/hse/overview"


def snap(page):
    return page.evaluate(
        r"""() => {
          const th = document.querySelector('.vxe-header--column.is--sortable');
          const colId = th ? (th.className.match(/col_(\d+)/)||[])[1] : null;
          const rows = Array.from(document.querySelectorAll('.vxe-table--body tbody tr'));
          const order = rows.map(r => {
            const cell = r.querySelector('td .vxe-cell');
            return cell ? cell.textContent.trim() : '';
          });
          // aria-sort on the th
          const aria = th ? th.getAttribute('aria-sort') : null;
          return { colId, order, aria };
        }"""
    )


def main():
    out = {"steps": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=[
            "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
            "--single-process", "--no-zygote",
        ])
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        page.goto(BASE, wait_until="load")
        page.wait_for_selector(".vxe-header--column.is--sortable", timeout=30000)
        time.sleep(1.0)

        out["steps"].append({"step": "initial", **snap(page)})

        th = page.locator(".vxe-header--column.is--sortable").first
        for i in range(1, 4):
            th.scroll_into_view_if_needed()
            box = th.bounding_box()
            page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            time.sleep(1.0)
            out["steps"].append({"step": f"click{i}", **snap(page)})

        browser.close()

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
