# E2E 浏览器自动化测试基座

本目录沉淀了提示词-146 打通的 Vben 5.x 浏览器自动化测试方案，供后续模块复用。

## 设计理念：token 注入绕过 SliderCaptcha

Vben 5.x 登录页使用 `SliderCaptcha`（滑动拼图）人机校验，常规 Playwright 录制/点击无法自动通过。

方案不模拟滑块，而是**直接调用后端登录接口拿 token，再注入 localStorage**：

1. `POST /api/auth/login`（`{ username, password }`）→ 返回 `data.accessToken` / `data.refreshToken`
2. 计算 Vben 的 localStorage key：`${namespace}-core-access`
   - `namespace` 默认 `vben-web-antd-5.7.0-dev`，可用环境变量 `E2E_STORAGE_NAMESPACE` 覆盖
3. 通过 `page.addInitScript` 在**每次页面导航前**写入该 key，value 形状与 Vben access store 一致：
   ```json
   { "accessToken": "...", "refreshToken": "...", "accessCodes": [], "isLockScreen": false, "lockScreenPassword": null }
   ```
4. 首屏即已登录，无需二次 reload，SliderCaptcha 不会弹出。

这套逻辑封装在 `utils/auth.ts` 的 `loginViaToken(page, credentials)`，所有用例 `beforeEach` 调用即可。

## 目录结构

```
e2e/
├── utils/
│   ├── auth.ts        # loginViaToken() —— token 注入绕过登录
│   └── wait.ts        # waitForPageReady() —— domcontentloaded + 关键文案等待
├── insurance/
│   └── vehicle.spec.ts# 车辆保险用例（V1/V2/V3/V6/V7）
└── README.md
```

## 本地运行前置条件

1. **后端**已启动并监听 `:5800`（登录接口可用）
2. **前端 dev server** 已启动并监听 `:5173`（`pnpm dev:antd` 或 `pnpm dev`）
   - 本基座默认**不自动启动** dev server（`playwright.config.ts` 中 webServer 已注释），
     手动启动更稳，也避免后端未就绪时误报。
3. 已安装 `@playwright/test` 且浏览器已下载：
   ```bash
   pnpm add -D @playwright/test
   pnpm exec playwright install chromium
   ```

## 运行

```bash
# 仅跑车辆保险相关用例
pnpm test:e2e --grep "vehicle"

# 调试（带 UI）
pnpm test:e2e:ui
```

环境变量（可选）：
- `E2E_API_BASE_URL`：后端基址，默认 `http://127.0.0.1:5800`
- `E2E_STORAGE_NAMESPACE`：localStorage namespace 前缀，默认 `vben-web-antd-5.7.0-dev`

## 如何新增一个模块的 E2E 测试

1. 复制模板：`cp e2e/insurance/vehicle.spec.ts e2e/<模块>/<模块>.spec.ts`
2. 修改 `test.describe` 标题与 `beforeEach` 的登录凭据（如需非 admin 角色）
3. 修改 `waitForPageReady(page, '关键字')` 中的目标路由与关键字
4. 根据页面实际选择器补充用例（`page.getByText` / `page.locator(...).click()` 等）
5. 运行：`pnpm test:e2e --grep "<模块>"`

## 已知约束

- `@playwright/test` 当前仅为 `playwright` 的间接依赖（未 hoist 到根），首次运行前需手动
  `pnpm add -D @playwright/test`（提示词-147 红线要求：不自动 install、不改 lockfile）。
- 无头环境必须带 `--no-sandbox`（已在 `playwright.config.ts` 的 chromium `launchOptions` 配置）。
- 后端/前端未启动时，用例会 fail（属预期，提示词-147 验收允许）。
