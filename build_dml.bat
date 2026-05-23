@echo off
setlocal EnableExtensions

if /I "%~1"=="--help" goto usage
if /I "%~1"=="/?" goto usage

pushd "%~dp0" || exit /b 1

if not defined AIMBOT_BUILD_DIR set "AIMBOT_BUILD_DIR=build\dml"
if not defined AIMBOT_BUILD_CONFIG set "AIMBOT_BUILD_CONFIG=Release"
if not defined AIMBOT_CMAKE_GENERATOR set "AIMBOT_CMAKE_GENERATOR=Visual Studio 18 2026"
if not defined AIMBOT_CMAKE_ARCH set "AIMBOT_CMAKE_ARCH=x64"

where cmake >nul 2>nul
if errorlevel 1 (
    echo [build-dml] ERROR: cmake was not found in PATH.
    goto fail
)

where powershell >nul 2>nul
if errorlevel 1 (
    echo [build-dml] ERROR: powershell was not found in PATH.
    goto fail
)

echo [build-dml] Preparing prebuilt OpenCV...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\setup_opencv_dml.ps1"
if errorlevel 1 goto fail

echo [build-dml] Configuring %AIMBOT_BUILD_DIR%...
cmake -S . -B "%AIMBOT_BUILD_DIR%" -G "%AIMBOT_CMAKE_GENERATOR%" -A "%AIMBOT_CMAKE_ARCH%" -DAIMBOT_USE_CUDA=OFF %*
if errorlevel 1 goto fail

echo [build-dml] Building %AIMBOT_BUILD_CONFIG%...
cmake --build "%AIMBOT_BUILD_DIR%" --config "%AIMBOT_BUILD_CONFIG%" -- /m /nodeReuse:false
if errorlevel 1 goto fail

echo [build-dml] Done: %AIMBOT_BUILD_DIR%\%AIMBOT_BUILD_CONFIG%\ai.exe
popd
exit /b 0

:fail
set "AIMBOT_EXIT_CODE=%ERRORLEVEL%"
if "%AIMBOT_EXIT_CODE%"=="0" set "AIMBOT_EXIT_CODE=1"
echo [build-dml] Failed with exit code %AIMBOT_EXIT_CODE%.
pause
popd
exit /b %AIMBOT_EXIT_CODE%

:usage
echo Usage: build_dml.bat [extra CMake arguments]
echo.
echo Defaults:
echo   AIMBOT_BUILD_DIR=build\dml
echo   AIMBOT_BUILD_CONFIG=Release
echo   AIMBOT_CMAKE_GENERATOR=Visual Studio 18 2026
echo   AIMBOT_CMAKE_ARCH=x64
echo.
echo Example:
echo   build_dml.bat -DAIMBOT_COPY_RUNTIME_DLLS=OFF
exit /b 0
