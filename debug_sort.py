from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome",
        args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
    page = browser.new_page(viewport={"width":1440,"height":1600})
    page.goto(BASE + "/hse/overview", wait_until="networkidle")
    page.wait_for_selector(".vxe-table", timeout=30000)
    page.wait_for_timeout(1500)

    card = page.locator(".n-card", has_text="HseDataGrid")
    th = card.locator("th", has_text="编号").first
    box = th.bounding_box()
    print("TH BOX:", box)
    # print th outerHTML to see sort icon structure
    print("TH OUTERHTML (initial):")
    print(th.evaluate("el => el.outerHTML")[:600])
    print("TH CLASS:", th.get_attribute("class"))

    def codes():
        rows = card.locator(".vxe-body--row")
        return [rows.nth(i).locator(".vxe-cell").first.inner_text().strip() for i in range(rows.count())]

    print("codes initial:", codes())
    # coordinate click on header center
    cx = box["x"] + box["width"]/2
    cy = box["y"] + box["height"]/2
    for i in range(1,4):
        page.mouse.click(cx, cy)
        page.wait_for_timeout(800)
        print(f"--- after coord click {i} ---")
        print("codes:", codes())
        print("TH CLASS:", th.get_attribute("class"))
        # look for sort icon active
        html = th.evaluate("el => el.outerHTML")
        print("TH HTML snippet:", html[:700])
    browser.close()
print("DEBUG DONE")
