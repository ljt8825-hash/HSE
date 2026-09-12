@echo off
echo 正在添加D盘MySQL到系统PATH...

:: 获取当前PATH
for /f "tokens=2,*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path') do set "OLD_PATH=%%b"

:: 检查是否已存在
echo %OLD_PATH% | findstr /i "D:\\MySQL\\bin" >nul
if %errorlevel%==0 (
    echo [提示] D:\MySQL\bin 已在PATH中
    pause
    exit /b 0
)

:: 添加新路径
set "NEW_PATH=D:\MySQL\bin;%OLD_PATH%"

:: 写入注册表
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path /t REG_EXPAND_SZ /d "%NEW_PATH%" /f

echo [成功] 已将 D:\MySQL\bin 添加到系统PATH
echo [注意] 需要重新打开命令行窗口才能生效
pause
