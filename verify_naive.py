import json, os, tempfile, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8080"
OUT = "G:/hse-dashboard/verify_naive"
os.makedirs(OUT, exist_ok=True)

# temp files for upload tests
txt_path = os.path.join(OUT, "bad_file.txt")
csv_path = os.path.join(OUT, "good_file.csv")
with open(txt_path, "w") as f: f.write("not an excel")
with open(csv_path, "w") as f: f.write("code,name,dept,status\nB-0001,刘洋,人工作业中心,正常\n")

results = {}
shot = 0
def screenshot(page, name):
    global shot
    shot += 1
    p = os.path.join(OUT, f"{shot:02d}_{name}.png")
    page.screenshot(path=p)
    return p

def codes(page):
    """Read the code column (first column) order from the demo grid."""
    # demo grid is the one inside the HseDataGrid card
    card = page.locator(".n-card", has_text="HseDataGrid")
    rows = card.locator(".vxe-body--row")
    n = rows.count()
    out = []
    for i in range(n):
        cell = rows.nth(i).locator(".vxe-cell").first
        out.append(cell.inner_text().strip())
    return out

def sort_state(page):
    """Return (arrow_text, th_class) for the 编号 header column."""
    card = page.locator(".n-card", has_text="HseDataGrid")
    th = card.locator("th", has_text="编号").first
    cls = th.get_attribute("class") or ""
    # active icon?
    asc_active = th.locator(".vxe-sortable--asc-btn.is--active, .vxe-sortable--asc-btn.sort--active").count()
    desc_active = th.locator(".vxe-sortable--desc-btn.is--active, .vxe-sortable--desc-btn.sort--active").count()
    aria = th.get_attribute("aria-sort") or ""
    return {"class": cls, "asc_active": asc_active, "desc_active": desc_active, "aria_sort": aria}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome",
        args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--single-process","--no-zygote"])
    page = browser.new_page(viewport={"width":1440,"height":1600})
    errors = []
    page.on("console", lambda m: errors.append(f"{m.type}:{m.text}") if m.type in ("error","warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror:{e}"))

    page.goto(BASE + "/hse/overview", wait_until="networkidle")
    page.wait_for_selector(".vxe-table", timeout=30000)
    page.wait_for_timeout(1500)
    screenshot(page, "01_loaded")

    # ---------- SORT THREE-STATE ----------
    sort_log = []
    sort_log.append({"step":"initial","codes":codes(page),"state":sort_state(page)})
    # click header 3 times
    card = page.locator(".n-card", has_text="HseDataGrid")
    for i in range(1,4):
        card.locator("th", has_text="编号").first.click()
        page.wait_for_timeout(800)
        sort_log.append({"step":f"click{i}","codes":codes(page),"state":sort_state(page)})
        screenshot(page, f"02_sort_click{i}")
    results["sort"] = sort_log

    # ---------- IMPORT DIALOG ----------
    import_card = page.locator(".n-card", has_text="HseImportDialog")
    import_card.get_by_role("button", name="导入").click()
    page.wait_for_timeout(800)
    screenshot(page, "03_import_open")

    modal = page.locator(".n-modal")
    file_input = modal.locator("input[type=file]")
    # wrong type
    file_input.set_input_files(txt_path)
    page.wait_for_timeout(800)
    type_error_visible = modal.locator(".n-alert", has_text="文件类型不支持").count() > 0
    preview_grid_after_bad = modal.locator(".vxe-table").count()
    screenshot(page, "04_import_badtype")
    # correct type
    file_input.set_input_files(csv_path)
    page.wait_for_timeout(1000)
    type_error_after_good = modal.locator(".n-alert", has_text="文件类型不支持").count() > 0
    preview_grid_after_good = modal.locator(".vxe-table").count()
    screenshot(page, "05_import_goodtype")
    results["import"] = {
        "wrong_type_typeError_shown": type_error_visible,
        "wrong_type_preview_grid_count": preview_grid_after_bad,
        "correct_type_typeError_shown": type_error_after_good,
        "correct_type_preview_grid_count": preview_grid_after_good,
    }
    # close modal via Escape (footer 取消 only resets state, does not close the modal)
    page.keyboard.press("Escape")
    page.wait_for_timeout(1000)

    # ---------- EDIT RULES ----------
    card = page.locator(".n-card", has_text="HseDataGrid")
    rows = card.locator(".vxe-body--row")
    # row 1 = 张伟 (id 1). Click its 编辑 button
    r1 = rows.first
    r1.get_by_role("button", name="编辑").click()
    page.wait_for_timeout(700)
    screenshot(page, "06_edit_mode")
    # clear the editableDept input (部门 column). Find input in the dept cell.
    # The dept column is the 3rd column (index 2). Get its input.
    dept_cell = r1.locator(".vxe-body--column").nth(2)
    inp = dept_cell.locator("input").first
    inp.fill("")
    page.wait_for_timeout(300)
    # click 保存 in this row
    r1.get_by_role("button", name="保存").click()
    page.wait_for_timeout(800)
    log_after_fail = card.locator("text=编辑事件日志").locator("xpath=following-sibling::*").inner_text() if False else ""
    # capture the edit log area text
    log_area = card.locator("div", has_text="编辑事件日志").last
    log_text_fail = log_area.inner_text()
    screenshot(page, "07_edit_fail")
    # re-edit and save successfully
    r1.get_by_role("button", name="编辑").click()
    page.wait_for_timeout(700)
    dept_cell = r1.locator(".vxe-body--column").nth(2)
    inp = dept_cell.locator("input").first
    inp.fill("测试部门")
    page.wait_for_timeout(300)
    r1.get_by_role("button", name="保存").click()
    page.wait_for_timeout(800)
    log_text_ok = log_area.inner_text()
    screenshot(page, "08_edit_ok")

    results["edit"] = {
        "after_validation_fail_log": log_text_fail,
        "after_validation_ok_log": log_text_ok,
    }

    results["console_errors"] = errors[:20]
    with open(os.path.join(OUT, "report.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    browser.close()
print("DONE")
