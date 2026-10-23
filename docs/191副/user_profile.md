## 身份与称呼
- Primary communication language: Chinese

## 沟通与协作偏好
- Emphasizes thorough checking and self-testing before finalizing work; requires verification of output quality
- Follows phased development approach (completes one phase before starting the next)
- Requires clear delivery of development reports, database migration instructions, and test reports
- Strict adherence to audit scope and freeze boundaries (no code/style/route/interface/config modifications during audit phase)
- Requires not modifying other modules' code and login-related code
- When modifying documents, must keep the original structure and only change specified sections
- Each modification must be committed with an independent paragraph description
- Requires generating Markdown documents for each prompt word and archiving them
- Trusts the assistant to handle review and approval processes
- When saving files, prefers separating file writing and audit content into two steps to avoid silent failure caused by truncation
- Requires the assistant to point out discrepancies and not just comply with user statements

## 背景与能力
- Proficient in frontend development with Vue 3, TypeScript, and related frameworks
- Proficient in backend development with Node.js, Express/Koa, and testing frameworks like Jest and supertest

## 技术栈与方法论
- Frontend: Vite, Vue 3, TypeScript, Pinia, Vue Router (proficient), TanStack Query, Element Plus, LogicFlow, vue-vben-admin v5.7.0, Ant Design Vue, useVbenForm/useVbenVxeGrid, EchartsUI/useEcharts, Naive UI
- Backend: Node.js, Express/Koa, Jest, supertest (proficient), Zod (for validation), Winston (for logging), WebSocket

## Code style
- Values clean, maintainable code; prefers 清爽、专业、统一的原则 (fresh, professional, unified principles)
- Must keep Vben components clean and avoid custom components
- Must not reduce current system functionality