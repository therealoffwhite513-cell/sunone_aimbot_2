#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>

#include <cctype>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "config/config.h"

namespace
{
std::filesystem::path executableDir()
{
    std::wstring buffer(MAX_PATH, L'\0');
    DWORD size = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    while (size == buffer.size() && GetLastError() == ERROR_INSUFFICIENT_BUFFER)
    {
        buffer.resize(buffer.size() * 2);
        size = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    }
    buffer.resize(size);
    return std::filesystem::path(buffer).parent_path();
}

bool isNanoSimDir(const std::filesystem::path& path)
{
    return std::filesystem::exists(path / "server.mjs") &&
           std::filesystem::exists(path / "index.html") &&
           std::filesystem::exists(path / "src" / "app.js");
}

std::filesystem::path findNanoSimDir(const std::filesystem::path& exeDir)
{
    const std::vector<std::filesystem::path> directCandidates = {
        exeDir / "debug" / "nano_sim_3d",
        exeDir / "nano_sim_3d",
        exeDir / "modules" / "nano_sim_3d"
    };

    for (const auto& candidate : directCandidates)
    {
        if (isNanoSimDir(candidate))
        {
            return candidate;
        }
    }

    for (std::filesystem::path cursor = exeDir; !cursor.empty(); cursor = cursor.parent_path())
    {
        const auto candidate = cursor / "sunone_aimbot_2" / "modules" / "nano_sim_3d";
        if (isNanoSimDir(candidate))
        {
            return candidate;
        }
        if (cursor == cursor.root_path())
        {
            break;
        }
    }

    return {};
}

std::wstring getEnvironmentVariable(const wchar_t* name)
{
    DWORD size = GetEnvironmentVariableW(name, nullptr, 0);
    if (size == 0)
    {
        return {};
    }
    std::wstring value(size, L'\0');
    DWORD written = GetEnvironmentVariableW(name, value.data(), size);
    if (written == 0)
    {
        return {};
    }
    value.resize(written);
    return value;
}

std::filesystem::path findNodeExe()
{
    const std::wstring explicitNode = getEnvironmentVariable(L"NANOSIM_NODE");
    if (!explicitNode.empty())
    {
        std::filesystem::path nodePath(explicitNode);
        if (std::filesystem::exists(nodePath))
        {
            return nodePath;
        }
    }

    std::wstring pathBuffer(MAX_PATH, L'\0');
    wchar_t* filePart = nullptr;
    DWORD result = SearchPathW(nullptr, L"node.exe", nullptr, static_cast<DWORD>(pathBuffer.size()), pathBuffer.data(), &filePart);
    if (result > 0)
    {
        if (result >= pathBuffer.size())
        {
            pathBuffer.resize(result + 1);
            result = SearchPathW(nullptr, L"node.exe", nullptr, static_cast<DWORD>(pathBuffer.size()), pathBuffer.data(), &filePart);
        }
        pathBuffer.resize(result);
        std::filesystem::path nodePath(pathBuffer);
        if (std::filesystem::exists(nodePath))
        {
            return nodePath;
        }
    }

    std::wstring userProfile(MAX_PATH, L'\0');
    DWORD userProfileSize = GetEnvironmentVariableW(L"USERPROFILE", userProfile.data(), static_cast<DWORD>(userProfile.size()));
    if (userProfileSize > 0)
    {
        if (userProfileSize >= userProfile.size())
        {
            userProfile.resize(userProfileSize + 1);
            userProfileSize = GetEnvironmentVariableW(L"USERPROFILE", userProfile.data(), static_cast<DWORD>(userProfile.size()));
        }
        userProfile.resize(userProfileSize);
        const auto bundledNode = std::filesystem::path(userProfile) /
            ".cache" / "codex-runtimes" / "codex-primary-runtime" /
            "dependencies" / "node" / "bin" / "node.exe";
        if (std::filesystem::exists(bundledNode))
        {
            return bundledNode;
        }
    }

    return {};
}

std::wstring quote(const std::filesystem::path& path)
{
    return L"\"" + path.wstring() + L"\"";
}

std::wstring widen(const std::string& value)
{
    if (value.empty())
    {
        return {};
    }
    const int size = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    std::wstring wide(size > 0 ? size : 0, L'\0');
    if (size > 0)
    {
        MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, wide.data(), size);
        wide.resize(size - 1);
    }
    return wide;
}

std::string urlEncode(const std::string& value)
{
    std::ostringstream out;
    out.fill('0');
    out << std::hex << std::uppercase;
    for (unsigned char ch : value)
    {
        if (std::isalnum(ch) || ch == '-' || ch == '_' || ch == '.' || ch == '~')
        {
            out << static_cast<char>(ch);
        }
        else
        {
            out << '%' << std::setw(2) << static_cast<int>(ch);
        }
    }
    return out.str();
}

std::vector<std::string> collectModelOptions(const std::filesystem::path& exeDir, const Config& config)
{
    std::set<std::string> seen;
    std::vector<std::string> models;
    auto addModel = [&](const std::filesystem::path& path)
    {
        const std::string value = path.empty() ? "" : path.generic_string();
        if (!value.empty() && seen.insert(value).second)
        {
            models.push_back(value);
        }
    };

    addModel(std::filesystem::path(config.ai_model));

    const std::vector<std::filesystem::path> modelDirs = {
        exeDir,
        exeDir / "models",
        exeDir / "training" / "models"
    };
    for (const auto& dir : modelDirs)
    {
        if (!std::filesystem::exists(dir) || !std::filesystem::is_directory(dir))
        {
            continue;
        }
        for (const auto& entry : std::filesystem::directory_iterator(dir))
        {
            if (!entry.is_regular_file())
            {
                continue;
            }
            const std::string ext = entry.path().extension().string();
            if (ext == ".onnx" || ext == ".engine")
            {
                addModel(entry.path().filename());
            }
        }
    }
    return models;
}

std::string joinEncodedList(const std::vector<std::string>& values)
{
    std::ostringstream joined;
    for (size_t i = 0; i < values.size(); ++i)
    {
        if (i != 0)
        {
            joined << "%7C";
        }
        joined << urlEncode(values[i]);
    }
    return joined.str();
}

std::string firstOrFallback(const std::vector<std::string>& values, const char* fallback)
{
    return values.empty() ? std::string(fallback) : values.front();
}

std::string buildDebugUrl(int port, const Config& config, const std::vector<std::string>& modelOptions)
{
    std::ostringstream url;
    url << "http://127.0.0.1:" << port << "/?debugHarness=1&movement=simulation";
    url << "&backend=" << urlEncode(config.backend);
    url << "&ai_model=" << urlEncode(config.ai_model);
    url << "&model_options=" << joinEncodedList(modelOptions);
    url << "&auto_aim=" << (config.auto_aim ? "1" : "0");
    url << "&button_pause=" << urlEncode(firstOrFallback(config.button_pause, "F3"));
    url << "&capture_fps=" << config.capture_fps;
    url << "&detection_resolution=" << config.detection_resolution;
    url << "&confidence_threshold=" << config.confidence_threshold;
    url << "&nms_threshold=" << config.nms_threshold;
    url << "&max_detections=" << config.max_detections;
    url << "&fov_x=" << config.fovX;
    url << "&fov_y=" << config.fovY;
    url << "&input_method=" << urlEncode(config.input_method);
    url << "&circle_fov_enabled=" << (config.circle_fov_enabled ? "1" : "0");
    url << "&circle_fov_radius_percent=" << config.circle_fov_radius_percent;
    url << "&pid_governor_enabled=" << (config.pid_governor_enabled ? "1" : "0");
    url << "&pid_governor_speed=" << config.pid_governor_speed;
    url << "&pid_governor_blend=" << config.pid_governor_blend;
    url << "&pid_governor_lead_percent=" << config.pid_governor_lead_percent;
    url << "&neural_tracker_enabled=" << (config.neural_tracker_enabled ? "1" : "0");
    url << "&neural_tracker_blend=" << config.neural_tracker_blend;
    return url.str();
}

int envPortOrDefault()
{
    const std::wstring rawPort = getEnvironmentVariable(L"NANOSIM_PORT");
    if (!rawPort.empty())
    {
        try
        {
            const int parsed = std::stoi(rawPort);
            if (parsed > 0 && parsed < 65536)
            {
                return parsed;
            }
        }
        catch (...)
        {
        }
    }
    return 5177;
}
}

int wmain()
{
    const auto exeDir = executableDir();
    SetCurrentDirectoryW(exeDir.wstring().c_str());

    Config runtimeConfig;
    if (!runtimeConfig.loadConfig("config.ini"))
    {
        std::cerr << "[ai_debug] Failed to load config.ini." << std::endl;
        return 1;
    }

    const auto nanoSimDir = findNanoSimDir(exeDir);
    if (nanoSimDir.empty())
    {
        std::cerr << "[ai_debug] NanoSim assets were not found. Rebuild ai_debug so debug/nano_sim_3d is copied beside the executable." << std::endl;
        return 1;
    }

    const auto nodeExe = findNodeExe();
    if (nodeExe.empty())
    {
        std::cerr << "[ai_debug] node.exe was not found. Install Node.js or set NANOSIM_NODE to a node.exe path." << std::endl;
        return 1;
    }

    const int port = envPortOrDefault();
    SetEnvironmentVariableW(L"PORT", std::to_wstring(port).c_str());

    std::wstring command = quote(nodeExe) + L" " + quote(nanoSimDir / "server.mjs");
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};

    std::wcout << L"[ai_debug] Backend: " << widen(runtimeConfig.backend) << std::endl;
    std::wcout << L"[ai_debug] Input method from config: " << widen(runtimeConfig.input_method) << std::endl;
    std::wcout << L"[ai_debug] NanoSim assets: " << nanoSimDir.wstring() << std::endl;

    if (!CreateProcessW(
            nullptr,
            command.data(),
            nullptr,
            nullptr,
            FALSE,
            CREATE_NO_WINDOW,
            nullptr,
            nanoSimDir.wstring().c_str(),
            &startup,
            &process))
    {
        std::cerr << "[ai_debug] Failed to start NanoSim server. Win32 error: " << GetLastError() << std::endl;
        return 1;
    }

    const std::vector<std::string> modelOptions = collectModelOptions(exeDir, runtimeConfig);
    const std::string url = buildDebugUrl(port, runtimeConfig, modelOptions);
    Sleep(1200);
    ShellExecuteW(nullptr, L"open", widen(url).c_str(), nullptr, nullptr, SW_SHOWNORMAL);

    std::cout << "[ai_debug] Opened " << url << std::endl;
    std::cout << "[ai_debug] NanoSim is running in simulation-only diagnostic mode. Press Enter to stop it." << std::endl;
    std::cin.get();

    TerminateProcess(process.hProcess, 0);
    WaitForSingleObject(process.hProcess, 2000);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return 0;
}
