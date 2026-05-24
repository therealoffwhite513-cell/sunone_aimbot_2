#define WIN32_LEAN_AND_MEAN
#define _WINSOCKAPI_
#include <Windows.h>

#include "rzctl.h"

#include <iostream>
#include <vector>

namespace
{
constexpr wchar_t RazerControlDllName[] = L"chroma_lighting.dll";
constexpr int RZ_LEFT_DOWN = 1;
constexpr int RZ_LEFT_UP = 2;
constexpr int RZ_RIGHT_DOWN = 4;
constexpr int RZ_RIGHT_UP = 8;
constexpr int RZ_MIDDLE_DOWN = 16;
constexpr int RZ_MIDDLE_UP = 32;
}

std::filesystem::path RzctlMouse::resolveDllPath()
{
    wchar_t buffer[MAX_PATH]{};
    std::filesystem::path exeDir;
    if (GetModuleFileNameW(nullptr, buffer, MAX_PATH) > 0)
        exeDir = std::filesystem::path(buffer).parent_path();

    std::error_code ec;
    const std::filesystem::path cwd = std::filesystem::current_path(ec);

    std::vector<std::filesystem::path> candidates;
    if (!exeDir.empty())
    {
        candidates.push_back(exeDir / RazerControlDllName);
        candidates.push_back(exeDir / L"controls" / RazerControlDllName);
        candidates.push_back(exeDir / L"modules" / L"razer-controls" / L"x64" / L"Release" / RazerControlDllName);
    }

    if (!ec)
    {
        candidates.push_back(cwd / RazerControlDllName);
        candidates.push_back(cwd / L"controls" / RazerControlDllName);
        candidates.push_back(cwd / L"modules" / L"razer-controls" / L"x64" / L"Release" / RazerControlDllName);
    }

    for (const auto& candidate : candidates)
    {
        if (std::filesystem::exists(candidate))
            return candidate;
    }

    return exeDir.empty() ? std::filesystem::path(RazerControlDllName) : exeDir / RazerControlDllName;
}

int RzctlMouse::downFlagForKey(int key)
{
    if (key == 2)
        return RZ_RIGHT_DOWN;
    if (key == 3)
        return RZ_MIDDLE_DOWN;
    return RZ_LEFT_DOWN;
}

int RzctlMouse::upFlagForKey(int key)
{
    if (key == 2)
        return RZ_RIGHT_UP;
    if (key == 3)
        return RZ_MIDDLE_UP;
    return RZ_LEFT_UP;
}

RzctlMouse::RzctlMouse()
{
    dllPath = resolveDllPath();
    rzctl = LoadLibraryW(dllPath.wstring().c_str());
    if (rzctl == nullptr)
    {
        std::wcerr << L"[Razer] Failed to load chroma_lighting.dll from " << dllPath.wstring() << std::endl;
        return;
    }

    init = reinterpret_cast<InitFn>(GetProcAddress(rzctl, "init"));
    mouseMoveStatus = reinterpret_cast<MouseMoveStatusFn>(GetProcAddress(rzctl, "mouse_move_status"));
    mouseClickStatus = reinterpret_cast<MouseClickStatusFn>(GetProcAddress(rzctl, "mouse_click_status"));
    mouseMove = reinterpret_cast<MouseMoveFn>(GetProcAddress(rzctl, "mouse_move"));
    mouseClick = reinterpret_cast<MouseClickFn>(GetProcAddress(rzctl, "mouse_click"));
    keyboardInput = reinterpret_cast<KeyboardInputFn>(GetProcAddress(rzctl, "keyboard_input"));

    if (!init || (!mouseMoveStatus && !mouseMove) || (!mouseClickStatus && !mouseClick) || !keyboardInput)
    {
        std::cerr << "[Razer] chroma_lighting.dll is missing one or more required exports." << std::endl;
        mouse_close();
        return;
    }

    rzctlOk = init() == TRUE;
    if (!rzctlOk)
        std::cerr << "[Razer] RZCONTROL device initialization failed." << std::endl;
}

RzctlMouse::~RzctlMouse()
{
    mouse_close();
}

bool RzctlMouse::mouse_xy(int x, int y)
{
    if (!rzctlOk)
        return false;

    if (mouseMoveStatus)
        return mouseMoveStatus(x, y, TRUE) == TRUE;

    if (mouseMove)
    {
        mouseMove(x, y, true);
        return true;
    }

    return false;
}

bool RzctlMouse::mouse_down(int key)
{
    if (!rzctlOk)
        return false;

    const int flag = downFlagForKey(key);
    if (mouseClickStatus)
        return mouseClickStatus(flag) == TRUE;

    if (mouseClick)
    {
        mouseClick(flag);
        return true;
    }

    return false;
}

bool RzctlMouse::mouse_up(int key)
{
    if (!rzctlOk)
        return false;

    const int flag = upFlagForKey(key);
    if (mouseClickStatus)
        return mouseClickStatus(flag) == TRUE;

    if (mouseClick)
    {
        mouseClick(flag);
        return true;
    }

    return false;
}

void RzctlMouse::mouse_close()
{
    rzctlOk = false;
    init = nullptr;
    mouseMove = nullptr;
    mouseMoveStatus = nullptr;
    mouseClick = nullptr;
    mouseClickStatus = nullptr;
    keyboardInput = nullptr;

    if (rzctl != nullptr)
    {
        FreeLibrary(rzctl);
        rzctl = nullptr;
    }
}
