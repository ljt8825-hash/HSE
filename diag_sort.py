"""
Decisive diagnostic for the VXE three-state sort issue on /hse/overview.
- Locates the live VXE grid instance via the Vue component tree.
- Inspects the 'code' column sortable/order + global sortConfig.
- Detects whether clicking the header rebuilds the grid columns (losing sort state).
- Compares a REAL mouse click vs programmatic api.sort('code','asc').
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8090/hse/overview"

PROBE_JS = r"""
() => {
  const out = { found: false };
  try {
    const th = document.querySelector('.vxe-header--column.is--sortable');
    if (!th) { out.error = 'no .is--sortable th found'; return out; }
    // walk Vue component tree upward to find VxeGrid instance exposing getSortColumns
    let comp = th.__vueParentComponent;
    let inst = null;
    while (comp) {
      const p = comp.proxy;
      if (p && typeof p.getSortColumns === 'function') { inst = p; break; }
      comp = comp.parent;
    }
    if (!inst) { out.error = 'no VxeGrid instance with getSortColumns in ancestor chain'; return out; }
    out.found = true;
    // column id of the clicked th (for rebuild detection)
    out.thColId = th.className.match(/col_(\d+)/) ? th.className.match(/col_(\d+)/)[1] : null;
    const cols = inst.getColumns ? inst.getColumns() : [];
    const codeCol = cols.find(c => c.field === 'code');
    if (codeCol) {
      out.codeCol = {
        field: codeCol.field,
        sortable: codeCol.sortable,
        order: codeCol.order,
        visible: codeCol.visible,
      };
    } else {
      out.codeCol = null;
    }
    // sortConfig from instance if available
    try { out.sortConfig = inst.getSortConfig ? inst.getSortConfig() : '(no getSortConfig)'; } catch(e){ out.sortConfig = 'err:'+e.message; }
    // current sorted columns
    try {
      const sc = inst.getSortColumns ? inst.getSortColumns() : [];
      out.sortColumns = sc.map(c => ({ field: c.field, order: c.order }));
    } catch(e){ out.sortColumns = 'err:'+e.message; }
    // expose instance for later calls
    window.__vxe = inst;
  } catch (e) {
    out.error = 'probe threw: ' + e.message;
  }
  return out;
}
"""

CLICK_LOG_JS = r"""
() => {
  // install a one-time flag tracker on the grid instance to detect re-init/rebuild
  const inst = window.__vxe;
  if (!inst) return { ok: false, reason: 'no instance' };
  // count current header columns
  const headers = document.querySelectorAll('.vxe-header--column').length;
  return { ok: true, headerCount: headers, colId: (document.querySelector('.vxe-header--column.is--sortable')||{}).className };
}
"""


def main():
    result = {"steps": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", args=[
            "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
            "--single-process", "--no-zygote",
        ])
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        page.on("console", lambda m: None)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(BASE, wait_until="load")
        # wait for grid header
        page.wait_for_selector(".vxe-header--column.is--sortable", timeout=30000)
        time.sleep(1.5)

        # 1. initial probe
        probe1 = page.evaluate(PROBE_JS)
        result["steps"].append({"step": "initial_probe", **probe1})

        # capture header count + th identity before click
        before = page.evaluate(CLICK_LOG_JS)
        result["steps"].append({"step": "before_click", **before})

        # 2. real mouse click on the sortable header cell (center of .vxe-cell)
        th = page.locator(".vxe-header--column.is--sortable").first
        th.scroll_into_view_if_needed()
        box = th.bounding_box()
        # click within the cell text area (not the edge)
        page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        time.sleep(1.0)

        after = page.evaluate(CLICK_LOG_JS)
        probe2 = page.evaluate(PROBE_JS)
        result["steps"].append({"step": "after_real_click", "click_log": after, **probe2})

        # 3. click again (asc -> desc)
        th.scroll_into_view_if_needed()
        box = th.bounding_box()
        page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        time.sleep(1.0)
        probe3 = page.evaluate(PROBE_JS)
        result["steps"].append({"step": "after_real_click_2", **probe3})

        # 4. click again (desc -> cancel)
        th.scroll_into_view_if_needed()
        box = th.bounding_box()
        page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        time.sleep(1.0)
        probe4 = page.evaluate(PROBE_JS)
        result["steps"].append({"step": "after_real_click_3", **probe4})

        # 5. programmatic api.sort to confirm instance methods work
        prog = page.evaluate(r"""
        () => {
          const inst = window.__vxe;
          if (!inst) return { ok:false };
          inst.sort('code', 'asc');
          const sc = inst.getSortColumns ? inst.getSortColumns() : [];
          return { ok:true, sortColumns: sc.map(c=>({field:c.field, order:c.order})) };
        }
        """)
        result["steps"].append({"step": "programmatic_sort_asc", **prog})

        result["page_errors"] = errors
        browser.close()

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
