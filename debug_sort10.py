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
    ths = card.locator("th", has_text="编号")
    n = ths.count()
    print("num th matching 编号:", n)
    def sortcols():
        return page.evaluate("() => { const g=document.querySelector('.vxe-grid').__vueParentComponent; let c=g; for(let i=0;i<10&&c;i++){if(c.type&&c.type.name==='VxeGrid')break;c=c.parent;} const api=c.proxy; return api.getSortColumns? api.getSortColumns().map(x=>({field:x.field,order:x.order})):'n/a'; }")

    # click each th (first = main, last = fixed overlay)
    for idx in range(n):
        th = ths.nth(idx)
        box = th.bounding_box()
        print(f"th[{idx}] box:", box)
        if not box: 
            continue
        page.mouse.click(box["x"]+box["width"]/2, box["y"]+box["height"]/2)
        page.wait_for_timeout(500)
        print(f"  after click th[{idx}]: sortcols={sortcols()}")

    # Also try the sort ICON in the LAST th
    last_th = ths.nth(n-1)
    asc = last_th.locator(".vxe-sort--asc-btn")
    if asc.count():
        b = asc.bounding_box()
        if b:
            page.mouse.click(b["x"]+b["width"]/2, b["y"]+b["height"]/2)
            page.wait_for_timeout(500)
            print("after asc icon click on last th:", sortcols())
    browser.close()
print("DEBUG10 DONE")
