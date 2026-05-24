// dllmain.cpp : Defines the entry point for the DLL application.
#include "pch.h"
#include "../original/rzctl.h"

BOOL APIENTRY DllMain( HMODULE hModule,
                       DWORD  ul_reason_for_call,
                       LPVOID lpReserved
                     )
{
    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
    case DLL_THREAD_ATTACH:
    case DLL_THREAD_DETACH:
        break;
    case DLL_PROCESS_DETACH:
        rzctl::shutdown();
        break;
    }
    return TRUE;
}

extern "C" __declspec(dllexport) BOOL __cdecl init()
{
    return rzctl::init() ? TRUE : FALSE;
}

extern "C" __declspec(dllexport) BOOL __cdecl is_initialized()
{
    return rzctl::is_initialized() ? TRUE : FALSE;
}

extern "C" __declspec(dllexport) DWORD __cdecl get_last_error_code()
{
    return rzctl::last_error_code();
}

extern "C" __declspec(dllexport) DWORD __cdecl get_failed_send_count()
{
    return rzctl::failed_send_count();
}

extern "C" __declspec(dllexport) void __cdecl shutdown()
{
    rzctl::shutdown();
}

extern "C" __declspec(dllexport) BOOL __cdecl mouse_move_status(int x, int y, BOOL starting_point)
{
    return rzctl::mouse_move(x, y, starting_point != FALSE) ? TRUE : FALSE;
}

extern "C" __declspec(dllexport) void __cdecl mouse_move(int x, int y, bool starting_point)
{
    (void)rzctl::mouse_move(x, y, starting_point);
}

extern "C" __declspec(dllexport) BOOL __cdecl mouse_click_status(int up_down)
{
    return rzctl::mouse_click(up_down) ? TRUE : FALSE;
}

extern "C" __declspec(dllexport) void __cdecl mouse_click(int up_down)
{
    (void)rzctl::mouse_click(up_down);
}

extern "C" __declspec(dllexport) void __cdecl keyboard_input(short key, int up_down)
{
    (void)rzctl::keyboard_input(key, up_down);
}

