from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome",
        args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
    page = browser.new_page(viewport={"width":1440,"height":1600})
    page.on("console", lambda m: print("CONSOLE", m.type, m.text[:200]) if "sort" in m.text.lower() or "Sort" in m.text else None)
    page.goto(BASE + "/hse/overview", wait_until="networkidle")
    page.wait_for_selector(".vxe-table", timeout=30000)
    page.wait_for_timeout(1500)

    card = page.locator(".n-card", has_text="HseDataGrid")
    th = card.locator("th", has_text="编号").first

    def codes():
        rows = card.locator(".vxe-body--row")
        return [rows.nth(i).locator(".vxe-cell").first.inner_text().strip() for i in range(rows.count())]
    def sort_cls():
        return th.get_attribute("class")

    print("initial codes:", codes())
    print("initial th class:", sort_cls())

    # Try 1: click title span
    print("=== try click .vxe-cell--title ===")
    try:
        th.locator(".vxe-cell--title").click(force=True, timeout=3000)
    except Exception as e:
        print("title click err:", e)
    page.wait_for_timeout(700)
    print("codes:", codes(), "class:", sort_cls())

    # Try 2: click asc icon
    print("=== try click .vxe-sort--asc-btn ===")
    try:
        th.locator(".vxe-sort--asc-btn").click(force=True, timeout=3000)
    except Exception as e:
        print("asc click err:", e)
    page.wait_for_timeout(700)
    print("codes:", codes(), "class:", sort_cls())

    # Try 3: dispatch click event on th via JS
    print("=== try JS dispatch click on th ===")
    th.evaluate("el => el.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
    page.wait_for_timeout(700)
    print("codes:", codes(), "class:", sort_cls())

    # Try 4: get the asc icon bounding box and mouse click
    print("=== try mouse click on asc icon box ===")
    asc = th.locator(".vxe-sort--asc-btn")
    b = asc.bounding_box()
    print("asc box:", b)
    if b:
        page.mouse.click(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
        page.wait_for_timeout(700)
        print("codes:", codes(), "class:", sort_cls())
    browser.close()
print("DEBUG2 DONE")
