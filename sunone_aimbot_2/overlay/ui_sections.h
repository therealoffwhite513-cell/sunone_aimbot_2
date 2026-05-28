#ifndef OVERLAY_UI_SECTIONS_H
#define OVERLAY_UI_SECTIONS_H

#include <algorithm>

#include "imgui/imgui.h"

namespace OverlayUI
{
inline float AdaptiveItemWidth(float ratio = 0.64f) noexcept
{
    const float avail = ImGui::GetContentRegionAvail().x;
    if (avail <= 1.0f)
        return 1.0f;

    const float maxW = avail * 0.92f;
    const float minW = avail * ((avail < 280.0f) ? 0.62f : 0.42f);
    const float boundedMin = (minW < maxW) ? minW : maxW;
    const float target = avail * ratio;
    return std::clamp(target, boundedMin, maxW);
}

inline void DrawBodyFrame(const ImVec2& min, const ImVec2& max, bool subsection = false) noexcept
{
    ImDrawList* drawList = ImGui::GetWindowDrawList();
    const ImU32 border = subsection ? IM_COL32(76, 89, 101, 92) : IM_COL32(76, 89, 101, 122);
    drawList->AddRect(min, max, border, subsection ? 3.0f : 4.0f, 0, 1.0f);
}

inline void BeginBodyGroup(bool subsection = false) noexcept
{
    ImGui::BeginGroup();
    ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(5.0f, subsection ? 3.0f : 4.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(5.0f, 3.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 4.0f);
    ImGui::PushStyleColor(ImGuiCol_FrameBg, IM_COL32(23, 26, 31, 246));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(31, 36, 42, 250));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, IM_COL32(38, 48, 54, 252));
    ImGui::PushItemWidth(AdaptiveItemWidth(subsection ? 0.68f : 0.64f));
    ImGui::Dummy(ImVec2(0.0f, subsection ? 1.0f : 2.0f));
    ImGui::Indent(subsection ? 6.0f : 7.0f);
}

inline void EndBodyGroup(bool subsection = false) noexcept
{
    ImGui::Unindent(subsection ? 6.0f : 7.0f);
    ImGui::Dummy(ImVec2(0.0f, subsection ? 1.0f : 2.0f));
    ImGui::PopItemWidth();
    ImGui::PopStyleColor(3);
    ImGui::PopStyleVar(4);
    ImGui::EndGroup();

    ImVec2 boxMin = ImGui::GetItemRectMin();
    ImVec2 boxMax = ImGui::GetItemRectMax();
    const float xPad = subsection ? 2.0f : 3.0f;
    const float yPad = subsection ? 2.0f : 3.0f;

    boxMin.x -= xPad;
    boxMin.y -= yPad;
    boxMax.x += xPad;
    boxMax.y += yPad;

    const ImVec2 winPos = ImGui::GetWindowPos();
    const ImVec2 contentMin = ImGui::GetWindowContentRegionMin();
    const ImVec2 contentMax = ImGui::GetWindowContentRegionMax();
    const float clipMinX = winPos.x + contentMin.x + 1.0f;
    const float clipMaxX = winPos.x + contentMax.x - 1.0f;

    if (boxMin.x < clipMinX)
        boxMin.x = clipMinX;
    if (boxMax.x > clipMaxX)
        boxMax.x = clipMaxX;
    if (boxMax.x < boxMin.x)
        boxMax.x = boxMin.x;

    DrawBodyFrame(boxMin, boxMax, subsection);
}

inline bool BeginSection(const char* label, const char* id = nullptr, bool defaultOpen = true) noexcept
{
    ImGui::PushID(id ? id : label);

    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(7.0f, 3.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 4.0f);
    ImGui::PushStyleColor(ImGuiCol_Header, IM_COL32(20, 24, 29, 248));
    ImGui::PushStyleColor(ImGuiCol_HeaderHovered, IM_COL32(29, 36, 42, 252));
    ImGui::PushStyleColor(ImGuiCol_HeaderActive, IM_COL32(35, 82, 80, 252));
    ImGui::PushStyleColor(ImGuiCol_Border, IM_COL32(76, 89, 101, 132));
    ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(231, 236, 242, 255));

    ImGuiTreeNodeFlags flags = ImGuiTreeNodeFlags_Framed;
    if (defaultOpen)
        flags |= ImGuiTreeNodeFlags_DefaultOpen;

    const bool open = ImGui::TreeNodeEx("##section_header", flags, "%s", label);

    ImGui::PopStyleColor(5);
    ImGui::PopStyleVar(3);

    if (!open)
    {
        ImGui::PopID();
        ImGui::Dummy(ImVec2(0.0f, 2.0f));
        return false;
    }

    BeginBodyGroup(false);
    return true;
}

inline void EndSection() noexcept
{
    EndBodyGroup(false);
    ImGui::TreePop();
    ImGui::PopID();
    ImGui::Dummy(ImVec2(0.0f, 3.0f));
}

inline bool BeginSubsection(const char* label, bool defaultOpen = true) noexcept
{
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(7.0f, 3.0f));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 3.0f);
    ImGui::PushStyleColor(ImGuiCol_Header, IM_COL32(18, 22, 27, 244));
    ImGui::PushStyleColor(ImGuiCol_HeaderHovered, IM_COL32(27, 33, 39, 250));
    ImGui::PushStyleColor(ImGuiCol_HeaderActive, IM_COL32(31, 67, 66, 252));
    ImGui::PushStyleColor(ImGuiCol_Border, IM_COL32(76, 89, 101, 102));
    ImGui::PushStyleColor(ImGuiCol_Text, IM_COL32(216, 223, 234, 252));

    ImGuiTreeNodeFlags flags = ImGuiTreeNodeFlags_Framed;
    if (defaultOpen)
        flags |= ImGuiTreeNodeFlags_DefaultOpen;

    const bool open = ImGui::TreeNodeEx(label, flags);

    ImGui::PopStyleColor(5);
    ImGui::PopStyleVar(3);

    if (!open)
        return false;

    ImGui::PushID(label);
    BeginBodyGroup(true);
    return true;
}

inline void EndSubsection() noexcept
{
    EndBodyGroup(true);
    ImGui::TreePop();
    ImGui::PopID();
    ImGui::Dummy(ImVec2(0.0f, 2.0f));
}
}

#endif // OVERLAY_UI_SECTIONS_H
