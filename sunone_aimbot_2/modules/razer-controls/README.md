# Razer Control DLL Folder

This folder is for the optional Razer `chroma_lighting.dll` mouse backend.

The DLL is only a mouse output adapter. The main program still handles target selection, PID control, governor logic, smoothing, logging, and timing. The DLL should only receive the final mouse delta or click command and send it through the Razer path.

## How The Program Uses It

The main program wrapper is here:

- `mouse/rzctl.h`
- `mouse/rzctl.cpp`

The main project copies the release DLL next to `ai.exe` during builds:

- `chroma_lighting.dll`

At runtime the wrapper also searches `modules/razer-controls/x64/Release/chroma_lighting.dll` for local development runs.

If the DLL is missing, cannot initialize, or cannot send movement, the selected Razer input method does not fall back to another control path.

## Required DLL Exports

The compatible DLL should export:

- `init`
- `mouse_move`
- `mouse_click`
- `keyboard_input`
- `mouse_move_status`
- `mouse_click_status`

The program prefers `mouse_move_status` and `mouse_click_status` because they report whether the send worked.

## Build

If the Visual Studio solution is present in this folder, build the DLL with:

```powershell
& 'C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\amd64\MSBuild.exe' 'modules\razer-controls\rzctl.sln' /m /p:Configuration=Release /p:Platform=x64 /t:Build
```

The main project copies `modules/razer-controls/x64/Release/chroma_lighting.dll` next to `ai.exe` when CMake builds.

## Verify

Run the Razer wrapper contract test:

```powershell
python -m unittest training.tests.test_razer_input_contract
```

Check DLL exports:

```powershell
& 'C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.50.35717\bin\Hostx64\x64\dumpbin.exe' /exports 'build\dml\Release\chroma_lighting.dll'
```

## Rule Of Thumb

Do not add aiming behavior inside this DLL. Keep it as a thin compatibility layer so every mouse backend receives the same final movement command from the main controller.
