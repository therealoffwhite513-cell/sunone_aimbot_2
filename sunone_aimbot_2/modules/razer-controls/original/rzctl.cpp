#include <Windows.h>
#include <atomic>
#include <cstdint>
#include <iostream>
#include <mutex>
#include "nt.h"
#include "rzctl.h"

namespace
{
HANDLE hDevice = INVALID_HANDLE_VALUE;
std::mutex gDeviceMutex;
std::atomic<DWORD> gFailedSendCount{ 0 };
DWORD gLastErrorCode = ERROR_SUCCESS;

void set_last_error_code(DWORD errorCode)
{
	gLastErrorCode = errorCode;
}

void close_device_unlocked()
{
	if (hDevice != INVALID_HANDLE_VALUE)
	{
		CloseHandle(hDevice);
		hDevice = INVALID_HANDLE_VALUE;
	}
}

bool init_unlocked()
{
	close_device_unlocked();

	std::wstring name;
	if (!nt::find_sym_link(L"\\GLOBAL??", L"RZCONTROL", name))
	{
		set_last_error_code(ERROR_FILE_NOT_FOUND);
		return false;
	}

	std::wstring sym_link = L"\\\\?\\" + name;

	hDevice = CreateFileW(sym_link.c_str(), 0, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
	if (hDevice == INVALID_HANDLE_VALUE)
	{
		set_last_error_code(GetLastError());
		return false;
	}

	set_last_error_code(ERROR_SUCCESS);
	return true;
}
}

bool rzctl::init()
{
	std::lock_guard<std::mutex> lock(gDeviceMutex);
	return init_unlocked();
}

void rzctl::shutdown()
{
	std::lock_guard<std::mutex> lock(gDeviceMutex);
	close_device_unlocked();
	set_last_error_code(ERROR_SUCCESS);
}

bool rzctl::is_initialized()
{
	std::lock_guard<std::mutex> lock(gDeviceMutex);
	return hDevice != INVALID_HANDLE_VALUE;
}

DWORD rzctl::last_error_code()
{
	std::lock_guard<std::mutex> lock(gDeviceMutex);
	return gLastErrorCode;
}

DWORD rzctl::failed_send_count()
{
	return gFailedSendCount.load();
}

bool rzctl::mouse_move(int x, int y, bool from_start_point)
{
	int max_val = 0;

	/*
	* To avoid errors, lets just fix the x and y :p
	*/
	if (!from_start_point) {
		max_val = MAX_VAL;
		if (x < 1)
			x = 1;

		if (x > max_val) 
			x = max_val;

		if (y < 1)
			y = 1;

		if (y > max_val) 
			y = max_val;
	} 

	/*
	* Hardcoded values copied from looking at buffer passed from "Razer Synapse Service.exe"
	*/
	MOUSE_IOCTL_STRUCT mm = {
		0, 2,
		max_val,
		0, 0,
		x, y,
		0
	};
	return _impl_mouse_ioctl(&mm);
}

bool rzctl::mouse_click(int up_down)
{
	MOUSE_IOCTL_STRUCT mm = {
		0, 2,
		0, up_down,
		0, 0,
		0, 0,
	};
	return _impl_mouse_ioctl(&mm);
}

bool rzctl::keyboard_input(short key, int up_down)
{
	(void)key;
	(void)up_down;

	std::lock_guard<std::mutex> lock(gDeviceMutex);
	set_last_error_code(ERROR_NOT_SUPPORTED);
	return false;
}

bool rzctl::_impl_mouse_ioctl(MOUSE_IOCTL_STRUCT* pMi)
{
	if (!pMi)
	{
		std::lock_guard<std::mutex> lock(gDeviceMutex);
		set_last_error_code(ERROR_INVALID_PARAMETER);
		++gFailedSendCount;
		return false;
	}

	std::lock_guard<std::mutex> lock(gDeviceMutex);
	if (hDevice == INVALID_HANDLE_VALUE && !init_unlocked())
	{
		++gFailedSendCount;
		return false;
	}

	DWORD junk = 0;
	BOOL bResult = DeviceIoControl(hDevice, IOCTL_MOUSE, pMi, sizeof(MOUSE_IOCTL_STRUCT), NULL, 0, &junk, NULL);
		
	if (!bResult)
	{
		const DWORD errorCode = GetLastError();
		set_last_error_code(errorCode);
		++gFailedSendCount;
		init_unlocked();
		return false;
	}

	set_last_error_code(ERROR_SUCCESS);
	return true;
}
