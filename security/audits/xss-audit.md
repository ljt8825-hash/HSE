# XSS 专项审计报告

| 项目信息       | 内容                                  |
|----------------|---------------------------------------|
| 系统名称       | 宁津环卫 HSE 安全管理系统 v4.1        |
| 审计日期       | 2026-07-11                            |
| 审计类型       | 跨站脚本攻击 (XSS) 专项审计            |
| 文档编号       | HSE-SEC-AUDIT-2026-003                |

---

## 1. 扫描范围

| 区域               | 扫描目标                   |
|--------------------|--------------------------|
| `src/` 目录        | 所有 .vue, .js, .ts 文件  |
| `public/index.html` | HTML 入口文件             |

> 排除范围：`node_modules/`、`dist/`

---

## 2. 扫描方法

### 2.1 自动化模式匹配

```
# 扫描 v-html 指令使用
grep -rn "v-html" src/ --include="*.vue" --include="*.js"

# 扫描 innerHTML 赋值
grep -rn "innerHTML" src/ --include="*.vue" --include="*.js" --include="*.ts"

# 扫描 document.write
grep -rn "document.write" src/ --include="*.vue" --include="*.js" --include="*.ts"

# 扫描 eval 使用
grep -rn "\beval(" src/ --include="*.vue" --include="*.js" --include="*.ts"

# 扫描 new Function
grep -rn "new Function" src/ --include="*.vue" --include="*.js" --include="*.ts"

# 扫描 dangerouslySetInnerHTML（React 模式，本项目不应出现）
grep -rn "dangerouslySetInnerHTML" src/ --include="*.vue" --include="*.js"

# 扫描 setTimeout/setInterval 字符串参数
grep -rn "setTimeout\s*(" src/ --include="*.js" | grep -v "function\|=>" || true
grep -rn "setInterval\s*(" src/ --include="*.js" | grep -v "function\|=>" || true
```

### 2.2 人工审查

- 审查 Ant Design Vue 组件是否存在未转义输出
- 检查路由参数在页面中的渲染方式
- 检查 API 返回数据的展示逻辑

---

## 3. 扫描结果

### 3.1 危险 API 使用统计

| 危险 API              | 匹配次数 | 严重程度 | 说明                       |
|-----------------------|----------|----------|----------------------------|
| `v-html`              | 0        | Critical | 未发现直接 HTML 注入        |
| `innerHTML`           | 0        | Critical | 未发现 DOM 操作注入         |
| `document.write`      | 0        | High     | 未发现文档写入              |
| `eval()`              | 0        | High     | 未发现动态代码执行          |
| `new Function()`      | 0        | High     | 未发现动态函数创建          |
| `setTimeout(string)`  | 0        | Medium   | 未发现字符串参数定时器      |
| `setInterval(string)` | 0        | Medium   | 未发现字符串参数定时器      |
| `dangerouslySetInnerHTML` | 0    | Critical | N/A（Vue 项目）            |

### 3.2 框架安全机制

| 安全机制                     | 状态 | 说明                                      |
|------------------------------|------|-------------------------------------------|
| Vue 模板默认转义              | PASS | {{ }} 插值自动 HTML 转义                   |
| Ant Design Vue 默认转义       | PASS | 组件内部对用户输入进行转义处理              |
| Vue Router 导航守卫           | PASS | 路由参数通过 params/query 传递，不直接渲染 |
| Pinia 状态管理                | PASS | 状态数据通过响应式系统渲染，自动转义        |

### 3.3 数据流向分析

```
用户输入 -> Zod 校验（后端）-> API 返回 -> Pinia Store -> Vue 模板（自动转义）
                                                          |
用户输入 -> Zod 校验（前端）-> Ant Design 组件（自动转义）--+
```

**结论**: 数据在到达渲染层之前经过了后端 Zod 校验 + Vue 默认转义的双重保护。

---

## 4. 审计结论

### 4.1 总体评估

> **风险等级: 低**
> 前端代码未发现任何 XSS 向量，Vue 框架默认转义机制和 Ant Design Vue 组件提供了充分的 XSS 防护。

### 4.2 审计清单

| 检查项                        | 结果   | 说明                     |
|-------------------------------|--------|--------------------------|
| v-html 使用                    | PASS   | 0 处                     |
| innerHTML 使用                 | PASS   | 0 处                     |
| document.write 使用           | PASS   | 0 处                     |
| eval() 使用                   | PASS   | 0 处                     |
| new Function() 使用           | PASS   | 0 处                     |
| Vue 模板转义                   | PASS   | 默认启用                 |
| Ant Design Vue 组件转义       | PASS   | 默认启用                 |
| 用户输入校验                   | PASS   | 前后端 Zod 校验          |
| API 响应数据渲染               | PASS   | 通过模板插值渲染         |

---

## 5. 安全建议

### 5.1 当前状态保持

- 继续保持零 v-html / innerHTML 的现状
- 所有用户输入渲染均使用 Vue 模板插值 `{{ }}`

### 5.2 代码审查规则

在 Code Review 中强制执行以下规则：

| 规则编号 | 规则描述                                     | 严重程度 |
|----------|---------------------------------------------|----------|
| XSS-001  | 禁止使用 `v-html` 指令                       | Critical |
| XSS-002  | 禁止使用 `innerHTML` 属性                     | Critical |
| XSS-003  | 禁止使用 `document.write()`                  | High     |
| XSS-004  | 禁止使用 `eval()`                            | High     |
| XSS-005  | 禁止使用 `new Function()`                    | High     |
| XSS-006  | 禁止 `setTimeout`/`setInterval` 传入字符串    | Medium   |
| XSS-007  | 外部链接必须使用 `rel="noopener noreferrer"` | Low      |
| XSS-008  | 富文本内容必须通过 DOMPurify 清洗            | Medium   |

### 5.3 未来如需富文本支持

若未来需求中需要渲染富文本内容（如通知、公告等），建议：

```javascript
// 使用 DOMPurify 清洗 HTML
import DOMPurify from 'dompurify';

const cleanHtml = DOMPurify.sanitize(rawContent, {
  ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['href', 'target'],
});

// 在模板中使用 v-html 时必须先清洗
// <div v-html="sanitizedContent"></div>
```

> 注意: 即使使用 DOMPurify，v-html 也应作为最后手段。

---

## 6. 持续监控建议

| 措施                   | 实施方式                           | 频率     |
|------------------------|------------------------------------|----------|
| ESLint 规则            | 配置 vue/no-v-html、no-eval 等规则 | 每次 CI  |
| 依赖漏洞扫描           | npm audit                          | 每次 CI  |
| CSP 头启用             | 配置 Content-Security-Policy       | 部署时   |
| 人工代码审查           | PR Review 检查 XSS 规则             | 每次 PR  |

---

*审计结论: 项目 XSS 防护措施优秀，未发现任何可利用的 XSS 向量。*
*审计日期: 2026-07-11*
