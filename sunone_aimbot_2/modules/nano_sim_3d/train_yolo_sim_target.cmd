@echo off
setlocal
set "PY_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%PY_EXE%" (
  "%PY_EXE%" "%~dp0scripts\train_yolo_sim_target.py" %*
) else (
  python "%~dp0scripts\train_yolo_sim_target.py" %*
)
