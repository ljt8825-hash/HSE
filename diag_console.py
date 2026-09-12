"""Capture console logs while clicking the sortable header once."""
import sys, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8090/hse/overview"

def main():
    logs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=[
            "--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
            "--single-process","--no-zygote",
        ])
        page = browser.new_page(viewport={"width":1400,"height":1000})
        page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
        page.goto(BASE, wait_until="load")
        page.wait_for_selector(".vxe-header--column.is--sortable", timeout=30000)
        time.sleep(2.0)
        # count DIAG logs before click
        before = sum(1 for l in logs if 'DIAG' in l)
        th = page.locator(".vxe-header--column.is--sortable").first
        th.scroll_into_view_if_needed()
        box = th.bounding_box()
        page.mouse.click(box["x"]+box["width"]/2, box["y"]+box["height"]/2)
        time.sleep(2.0)
        after = sum(1 for l in logs if 'DIAG' in l)
        browser.close()

    diag_logs = [l for l in logs if 'DIAG' in l]
    print("=== DIAG logs (last 40) ===")
    for l in diag_logs[-40:]:
        print(l)
    print(f"\nDIAG count before click: {before}, after click: {after}, delta: {after-before}")

if __name__ == "__main__":
    main()
