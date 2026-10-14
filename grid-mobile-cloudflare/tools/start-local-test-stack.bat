@echo off
chcp 65001 >nul
setlocal
set "HSE_STACK_FROM_BAT=1"
set "HERE=%~dp0"
set "LOG=%HERE%.stack_start.log"
echo ============================================
echo   HSE 本地测试栈启动器
echo   页面 5900  -^>  Worker 8787  -^>  测试台账
echo ============================================
echo.
echo 启动中，最长等待约 1 分钟，请稍候 ...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%start-local-test-stack.ps1"
set "RC=%errorlevel%"
echo.
if exist "%LOG%" (
  echo ---------- 启动日志 ----------
  type "%LOG%"
  echo -------------------------------
  echo.
)
echo.
if "%RC%"=="0" (
  echo [OK] 看到上面「本地测试栈已就绪」即启动成功。
  echo      测试入口： http://127.0.0.1:5900/check
  echo      （测试账号：13800000003 公司管理 / 13800000001 经理甲 / 13800000002 管理员乙，密码均 123456）
  echo      弹出的两个服务窗口：Wrangler 8787、Pages 5900，不要关。
  echo      本启动器窗口现在可以关掉。
) else (
  echo [FAIL] 启动失败，退出码 %RC%。
  echo        请把本窗口完整截图发我；日志已存到：
  echo        %LOG%
)
echo.
pause
