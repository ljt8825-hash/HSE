# HSE Naive UI Agent Instructions

This application is the target of the HSE Naive UI migration. Before changing any file, read these documents in order:

1. `../../../docs/Naive UI/01-强制设计约束.md`
2. `../../../docs/Naive UI/00-Naive-UI-HSE总体实施计划.md`
3. The current stage task prompt and the latest Codex review in `../../../docs/Naive UI/`

The Chinese design constraints are mandatory. If a task conflicts with them, stop and document the conflict instead of guessing.

Key non-negotiables:

- Use Naive UI/Vben/VXE only. Do not import `ant-design-vue` under `src`.
- Do not modify `apps/web-antd`, backend, SQL, APIs, dependency versions, or lockfiles unless the current prompt explicitly permits it.
- Preserve HSE menu structure, routes, permissions, APIs, and business behavior.
- Use the shared HSE theme tokens and shared HSE components. Do not hard-code semantic colors in feature pages.
- Finish only the current approved phase, run the required checks, create the required summary, and stop for Codex review.

