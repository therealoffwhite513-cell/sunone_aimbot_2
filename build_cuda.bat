@echo off
setlocal EnableExtensions

if /I "%~1"=="--help" goto usage
if /I "%~1"=="/?" goto usage

pushd "%~dp0" || exit /b 1

if not defined AIMBOT_BUILD_DIR set "AIMBOT_BUILD_DIR=build\cuda"
if not defined AIMBOT_BUILD_CONFIG set "AIMBOT_BUILD_CONFIG=Release"
if not defined AIMBOT_CMAKE_GENERATOR set "AIMBOT_CMAKE_GENERATOR=Visual Studio 18 2026"
if not defined AIMBOT_CMAKE_ARCH set "AIMBOT_CMAKE_ARCH=x64"

where cmake >nul 2>nul
if errorlevel 1 (
    echo [build-cuda] ERROR: cmake was not found in PATH.
    goto fail
)

if not defined AIMBOT_SKIP_OPENCV_CUDA_BUILD (
    call :check_opencv_cuda
    if errorlevel 1 (
        where powershell >nul 2>nul
        if errorlevel 1 (
            echo [build-cuda] ERROR: powershell was not found in PATH.
            goto fail
        )

        echo [build-cuda] CUDA OpenCV install was not found.
        echo [build-cuda] Building OpenCV with CUDA. This can take a long time.
        powershell -NoProfile -ExecutionPolicy Bypass -File "tools\build_opencv_cuda.ps1" -AutoDetectCudaArch %AIMBOT_OPENCV_CUDA_ARGS%
        if errorlevel 1 goto fail

        call :check_opencv_cuda
        if errorlevel 1 (
            echo [build-cuda] ERROR: CUDA OpenCV build did not produce expected install files.
            goto fail
        )
    )
)

echo [build-cuda] Configuring %AIMBOT_BUILD_DIR%...
cmake -S . -B "%AIMBOT_BUILD_DIR%" -G "%AIMBOT_CMAKE_GENERATOR%" -A "%AIMBOT_CMAKE_ARCH%" -DAIMBOT_USE_CUDA=ON "-DCMAKE_CUDA_FLAGS=--allow-unsupported-compiler" "-DCUDA_NVCC_FLAGS=--allow-unsupported-compiler" %*
if errorlevel 1 goto fail

echo [build-cuda] Building %AIMBOT_BUILD_CONFIG%...
cmake --build "%AIMBOT_BUILD_DIR%" --config "%AIMBOT_BUILD_CONFIG%" -- /m /nodeReuse:false
if errorlevel 1 goto fail

echo [build-cuda] Done: %AIMBOT_BUILD_DIR%\%AIMBOT_BUILD_CONFIG%\ai.exe
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
echo Usage: build_cuda.bat [extra CMake arguments]
echo.
echo Defaults:
echo   AIMBOT_BUILD_DIR=build\cuda
echo   AIMBOT_BUILD_CONFIG=Release
echo   AIMBOT_CMAKE_GENERATOR=Visual Studio 18 2026
echo   AIMBOT_CMAKE_ARCH=x64
echo   AIMBOT_OPENCV_CUDA_ARGS=
echo   AIMBOT_SKIP_OPENCV_CUDA_BUILD=
echo.
echo Example:
echo   build_cuda.bat -DAIMBOT_TENSORRT_ROOT=C:\TensorRT-10.14.1.48
echo.
echo OpenCV CUDA options:
echo   set AIMBOT_OPENCV_CUDA_ARGS=-CudaArchBin all
echo   set AIMBOT_SKIP_OPENCV_CUDA_BUILD=1
exit /b 0

:check_opencv_cuda
if not exist "sunone_aimbot_2\modules\opencv\build\install\include\opencv2\opencv.hpp" exit /b 1
for /d %%D in ("sunone_aimbot_2\modules\opencv\build\install\x64\vc*") do (
    if exist "%%~fD\lib\opencv_world4130.lib" if exist "%%~fD\bin\opencv_world4130.dll" exit /b 0
)
exit /b 1
