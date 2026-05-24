#ifndef RZCTL_MOUSE_H
#define RZCTL_MOUSE_H

#define WIN32_LEAN_AND_MEAN
#define _WINSOCKAPI_
#include <Windows.h>

#include <filesystem>

class RzctlMouse
{
public:
    RzctlMouse();
    ~RzctlMouse();

    bool isOpen() const { return rzctlOk; }
    bool mouse_xy(int x, int y);
    bool mouse_down(int key = 1);
    bool mouse_up(int key = 1);
    void mouse_close();

private:
    using InitFn = BOOL(__cdecl*)();
    using MouseMoveFn = void(__cdecl*)(int, int, bool);
    using MouseMoveStatusFn = BOOL(__cdecl*)(int, int, BOOL);
    using MouseClickFn = void(__cdecl*)(int);
    using MouseClickStatusFn = BOOL(__cdecl*)(int);
    using KeyboardInputFn = void(__cdecl*)(short, int);

    std::filesystem::path dllPath;
    HMODULE rzctl = nullptr;
    bool rzctlOk = false;

    InitFn init = nullptr;
    MouseMoveFn mouseMove = nullptr;
    MouseMoveStatusFn mouseMoveStatus = nullptr;
    MouseClickFn mouseClick = nullptr;
    MouseClickStatusFn mouseClickStatus = nullptr;
    KeyboardInputFn keyboardInput = nullptr;

    static std::filesystem::path resolveDllPath();
    static int downFlagForKey(int key);
    static int upFlagForKey(int key);
};

#endif // RZCTL_MOUSE_H
