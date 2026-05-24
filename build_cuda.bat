@echo off
setlocal EnableExtensions

if /I "%~1"=="--help" goto usage
if /I "%~1"=="/?" goto usage

pushd "%~dp0" || exit /b 1

where powershell >nul 2>nul
if errorlevel 1 (
    echo [build-cuda] ERROR: powershell was not found in PATH.
    goto fail
)

powershell -NoProfile -ExecutionPolicy Bypass -File "tools\build_cuda.ps1" %*
if errorlevel 1 goto fail

popd
exit /b 0

:fail
set "AIMBOT_EXIT_CODE=%ERRORLEVEL%"
if "%AIMBOT_EXIT_CODE%"=="0" set "AIMBOT_EXIT_CODE=1"
echo [build-cuda] Failed with exit code %AIMBOT_EXIT_CODE%.
pause
popd
exit /b %AIMBOT_EXIT_CODE%

:usage
echo Usage: build_cuda.bat [tools\build_cuda.ps1 arguments] [extra CMake arguments]
echo.
echo Common options:
echo   -OpenCvAlreadyBuilt $true
echo   -DownloadOrUpdateNeeded $true
echo   -UseLatestPackages
echo   -OpenBrowserForDownloads
echo   -CudaArchBin 8.6
echo   -CudaArchBin all
echo   -NonInteractive
echo.
echo Defaults:
echo   BuildDir=build\cuda
echo   Configuration=Release
echo   Generator=Ninja Multi-Config
exit /b 0
