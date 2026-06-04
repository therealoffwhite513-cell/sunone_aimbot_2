#define WIN32_LEAN_AND_MEAN
#define _WINSOCKAPI_
#include <winsock2.h>
#include <Windows.h>

#include <commdlg.h>
#include <string>
#include <cstring>

#include "imgui/imgui.h"
#include "config.h"
#include "sunone_aimbot_2.h"
#include "overlay/config_dirty.h"
#include "overlay/ui_sections.h"

extern std::string g_iconLastError;

namespace
{
enum class GameOverlaySettingsPage
{
    All,
    General,
    Visuals,
    Icon
};

bool shouldDrawGameOverlayPage(GameOverlaySettingsPage current, GameOverlaySettingsPage wanted)
{
    return current == GameOverlaySettingsPage::All || current == wanted;
}
}

static void draw_game_overlay_page(GameOverlaySettingsPage page)
{
    if (shouldDrawGameOverlayPage(page, GameOverlaySettingsPage::General) &&
        OverlayUI::BeginSection("General", "game_overlay_section_general"))
    {
        if (ImGui::Checkbox("Enable", &config.game_overlay_enabled))
            OverlayConfig_MarkDirty();

        ImGui::SliderInt("Overlay Max FPS (0 = uncapped)", &config.game_overlay_max_fps, 0, 256);
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        if (ImGui::Checkbox("Draw Detection Boxes", &config.game_overlay_draw_boxes))
            OverlayConfig_MarkDirty();

        if (ImGui::Checkbox("Compensate Overlay Latency", &config.game_overlay_compensate_latency))
            OverlayConfig_MarkDirty();

        if (ImGui::Checkbox("Draw Future Positions", &config.game_overlay_draw_future))
            OverlayConfig_MarkDirty();

        if (ImGui::Checkbox("Draw Wind Debug Tail", &config.game_overlay_draw_wind_tail))
            OverlayConfig_MarkDirty();

        if (ImGui::Checkbox("Show Target Correction", &config.game_overlay_show_target_correction))
            OverlayConfig_MarkDirty();

        OverlayUI::EndSection();
    }

    if (shouldDrawGameOverlayPage(page, GameOverlaySettingsPage::Visuals) &&
        OverlayUI::BeginSection("Box Color", "game_overlay_section_box_color"))
    {
        bool colorChanged = false;

        ImGui::SliderInt("A##go_box_a", &config.game_overlay_box_a, 0, 255);
        colorChanged |= ImGui::IsItemEdited();
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderInt("R##go_box_r", &config.game_overlay_box_r, 0, 255);
        colorChanged |= ImGui::IsItemEdited();
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderInt("G##go_box_g", &config.game_overlay_box_g, 0, 255);
        colorChanged |= ImGui::IsItemEdited();
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderInt("B##go_box_b", &config.game_overlay_box_b, 0, 255);
        colorChanged |= ImGui::IsItemEdited();
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderFloat("Box Thickness", &config.game_overlay_box_thickness, 0.5f, 10.0f, "%.1f");
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        if (colorChanged)
            config.clampGameOverlayColor();

        OverlayUI::EndSection();
    }

    if (shouldDrawGameOverlayPage(page, GameOverlaySettingsPage::Visuals) &&
        OverlayUI::BeginSection("Capture Frame", "game_overlay_section_capture_frame"))
    {
        if (ImGui::Checkbox("Draw Capture Frame", &config.game_overlay_draw_frame))
            OverlayConfig_MarkDirty();

        if (ImGui::Checkbox("Draw Circle Guide", &config.game_overlay_draw_circle_fov))
            OverlayConfig_MarkDirty();

        bool frameColorChanged = false;

        ImGui::SliderInt("A##go_frame_a", &config.game_overlay_frame_a, 0, 255);
        frameColorChanged |= ImGui::IsItemEdited();
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderInt("R##go_frame_r", &config.game_overlay_frame_r, 0, 255);
        frameColorChanged |= ImGui::IsItemEdited();
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderInt("G##go_frame_g", &config.game_overlay_frame_g, 0, 255);
        frameColorChanged |= ImGui::IsItemEdited();
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderInt("B##go_frame_b", &config.game_overlay_frame_b, 0, 255);
        frameColorChanged |= ImGui::IsItemEdited();
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderFloat("Frame Thickness", &config.game_overlay_frame_thickness, 0.5f, 10.0f, "%.1f");
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        if (frameColorChanged)
            config.clampGameOverlayColor();

        OverlayUI::EndSection();
    }

    if (shouldDrawGameOverlayPage(page, GameOverlaySettingsPage::Visuals) &&
        OverlayUI::BeginSection("Future Point Style", "game_overlay_section_future_style"))
    {
        ImGui::SliderFloat("Point Radius", &config.game_overlay_future_point_radius, 1.0f, 20.0f, "%.1f");
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderFloat("Point Step Alpha Falloff", &config.game_overlay_future_alpha_falloff, 0.1f, 5.0f, "%.2f");
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        OverlayUI::EndSection();
    }

    if (shouldDrawGameOverlayPage(page, GameOverlaySettingsPage::Icon) &&
        OverlayUI::BeginSection("Icon Overlay", "game_overlay_section_icon"))
    {
        if (ImGui::Checkbox("Enable Icon Overlay", &config.game_overlay_icon_enabled))
            OverlayConfig_MarkDirty();

        if (!config.game_overlay_icon_enabled)
        {
            ImGui::BeginDisabled();
        }

        static bool pathInit = false;
        static char iconPathBuf[512];

        if (!pathInit)
        {
            pathInit = true;
            memset(iconPathBuf, 0, sizeof(iconPathBuf));
            std::string p = config.game_overlay_icon_path;
            if (p.size() >= sizeof(iconPathBuf)) p = p.substr(0, sizeof(iconPathBuf) - 1);
            memcpy(iconPathBuf, p.c_str(), p.size());
        }

        if (ImGui::InputText("Icon Path", iconPathBuf, IM_ARRAYSIZE(iconPathBuf)))
        {
            config.game_overlay_icon_path = iconPathBuf;
            OverlayConfig_MarkDirty();
        }

        ImGui::SameLine();
        if (ImGui::Button("Browse##icon_path"))
        {
            char filePath[MAX_PATH] = {};
            OPENFILENAMEA ofn = {};
            ofn.lStructSize = sizeof(ofn);
            ofn.hwndOwner = nullptr;
            ofn.lpstrFile = filePath;
            ofn.nMaxFile = sizeof(filePath);
            ofn.lpstrFilter = "Image Files\0*.png;*.jpg;*.jpeg;*.bmp;*.ico\0All Files\0*.*\0";
            ofn.nFilterIndex = 1;
            ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;

            if (GetOpenFileNameA(&ofn))
            {
                strncpy_s(iconPathBuf, filePath, sizeof(iconPathBuf) - 1);
                config.game_overlay_icon_path = iconPathBuf;
                OverlayConfig_MarkDirty();
            }
        }

        ImGui::SliderInt("Icon Width", &config.game_overlay_icon_width, 4, 512);
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderInt("Icon Height", &config.game_overlay_icon_height, 4, 512);
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderFloat("Icon Offset X", &config.game_overlay_icon_offset_x, -500.0f, 500.0f, "%.1f");
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        ImGui::SliderFloat("Icon Offset Y", &config.game_overlay_icon_offset_y, -500.0f, 500.0f, "%.1f");
        if (ImGui::IsItemDeactivatedAfterEdit())
            OverlayConfig_MarkDirty();

        if (ImGui::InputInt("Icon Class (-1 = all)", &config.game_overlay_icon_class))
        {
            if (config.game_overlay_icon_class < -1) config.game_overlay_icon_class = -1;
            OverlayConfig_MarkDirty();
        }

        const char* anchors[] = { "center", "top", "bottom", "head" };
        int currentAnchor = 0;
        for (int i = 0; i < (int)(sizeof(anchors) / sizeof(anchors[0])); ++i)
        {
            if (config.game_overlay_icon_anchor == anchors[i])
            {
                currentAnchor = i;
                break;
            }
        }

        if (ImGui::Combo("Icon Anchor", &currentAnchor, anchors, IM_ARRAYSIZE(anchors)))
        {
            config.game_overlay_icon_anchor = anchors[currentAnchor];
            OverlayConfig_MarkDirty();
        }

        if (!config.game_overlay_icon_enabled)
        {
            ImGui::EndDisabled();
            ImGui::TextDisabled("Enable Icon Overlay to edit settings.");
        }

        OverlayUI::EndSection();
    }

    if (shouldDrawGameOverlayPage(page, GameOverlaySettingsPage::Icon) && !g_iconLastError.empty())
    {
        if (OverlayUI::BeginSection("Errors", "game_overlay_section_errors"))
        {
            ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(255, 100, 100, 255));
            ImGui::TextWrapped("%s", g_iconLastError.c_str());
            ImGui::PopStyleColor();
            OverlayUI::EndSection();
        }
    }

}

void draw_game_overlay_settings()
{
    draw_game_overlay_page(GameOverlaySettingsPage::All);
}

void draw_game_overlay_general()
{
    draw_game_overlay_page(GameOverlaySettingsPage::General);
}

void draw_game_overlay_visuals()
{
    draw_game_overlay_page(GameOverlaySettingsPage::Visuals);
}

void draw_game_overlay_icon()
{
    draw_game_overlay_page(GameOverlaySettingsPage::Icon);
}
