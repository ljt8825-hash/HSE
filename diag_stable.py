"""Test: does the VXE column id increment WITHOUT any click (re-render loop)?"""
import json
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8090/hse/overview"


def get_col_id(page):
    return page.evaluate(
        r"""() => {
          const th = document.querySelector('.vxe-header--column.is--sortable');
          if (!th) return null;
          const m = th.className.match(/col_(\d+)/);
          return m ? Number(m[1]) : null;
        }"""
    )


def main():
    out = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=[
            "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
            "--single-process", "--no-zygote",
        ])
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        page.goto(BASE, wait_until="load")
        page.wait_for_selector(".vxe-header--column.is--sortable", timeout=30000)
        time.sleep(1.0)

        samples = []
        for i in range(6):
            samples.append(get_col_id(page))
            time.sleep(1.0)  # NO clicks; just observe over time

        out["no_click_col_ids"] = samples
        out["changed_without_click"] = len(set(samples)) > 1
        browser.close()

    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
