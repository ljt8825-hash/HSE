from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome",
        args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
    page = browser.new_page(viewport={"width":1440,"height":1600})
    msgs=[]
    page.on("console", lambda m: msgs.append(f"{m.type}:{m.text[:300]}") if m.type in ("error","warning") else None)
    page.on("pageerror", lambda e: msgs.append(f"PAGEERROR:{e}"))
    page.goto(BASE + "/hse/overview", wait_until="networkidle")
    page.wait_for_selector(".vxe-table", timeout=30000)
    page.wait_for_timeout(1500)

    card = page.locator(".n-card", has_text="HseDataGrid")
    th = card.locator("th", has_text="编号").first
    def sortcols():
        return page.evaluate("() => { const g=document.querySelector('.vxe-grid').__vueParentComponent; let c=g; for(let i=0;i<10&&c;i++){if(c.type&&c.type.name==='VxeGrid')break;c=c.parent;} const api=c.proxy; return api.getSortColumns? api.getSortColumns().map(x=>({field:x.field,order:x.order})):'n/a'; }")

    print("before:", sortcols())
    # native playwright click
    try:
        th.click(timeout=5000, force=True)
        print("th.click() ok")
    except Exception as e:
        print("th.click err:", e)
    page.wait_for_timeout(700)
    print("after th.click:", sortcols())
    print("console during:", msgs[-5:])
    browser.close()
print("DEBUG9 DONE")
