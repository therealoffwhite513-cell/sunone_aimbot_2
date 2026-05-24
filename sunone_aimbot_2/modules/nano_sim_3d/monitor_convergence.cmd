@echo off
setlocal
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "NODE_PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
if exist "%NODE_EXE%" (
  "%NODE_EXE%" "%~dp0scripts\monitor_convergence.mjs" %*
) else (
  node "%~dp0scripts\monitor_convergence.mjs" %*
)
