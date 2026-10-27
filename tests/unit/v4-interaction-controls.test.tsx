import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionMenu, ContentTabs, ExportMenu, IconButton, SegmentedControl, StatusBadge, nextSelectableIndex } from "../../src/components/ui/interaction-controls";
import { Eye } from "lucide-react";

describe("V4 interaction controls", () => {
  it("exposes radio selection, disabled state, names and a single tab stop", () => {
    const markup = renderToStaticMarkup(createElement(SegmentedControl, {
      label: "Loại giao dịch", value: "INCOME", onChange: () => {},
      options: [{ value: "EXPENSE", label: "Chi" }, { value: "INCOME", label: "Thu" }, { value: "TRANSFER", label: "Chuyển", disabled: true }],
    }));
    expect(markup).toContain('role="radiogroup" aria-label="Loại giao dịch"');
    expect(markup).toContain('aria-checked="true" tabindex="0"');
    expect(markup).toContain('aria-checked="false" tabindex="-1"');
    expect(markup).toContain('disabled=""');
    expect((markup.match(/tabindex="0"/g) ?? [])).toHaveLength(1);
  });

  it("binds named tabs to corresponding panels and supports disabled options", () => {
    const markup = renderToStaticMarkup(createElement(ContentTabs, {
      idBase: "report", label: "Báo cáo", value: "overview", onChange: () => {},
      options: [{ value: "overview", label: "Tổng quan" }, { value: "trend", label: "Xu hướng", disabled: true }],
    }));
    expect(markup).toContain('role="tablist" aria-label="Báo cáo"');
    expect(markup).toContain('id="report-tab-overview"');
    expect(markup).toContain('aria-controls="report-panel-trend"');
    expect(markup).toContain('aria-selected="true" tabindex="0"');
    expect(markup).toContain('disabled=""');
  });

  it("skips disabled choices, wraps arrow navigation, and handles Home/End", () => {
    const options = [{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }, { value: "c", label: "C" }];
    expect(nextSelectableIndex(options, 0, "ArrowRight")).toBe(2);
    expect(nextSelectableIndex(options, 0, "ArrowLeft")).toBe(2);
    expect(nextSelectableIndex(options, 2, "ArrowRight")).toBe(0);
    expect(nextSelectableIndex(options, 2, "Home")).toBe(0);
    expect(nextSelectableIndex(options, 0, "End")).toBe(2);
    expect(nextSelectableIndex(options, 2, "Enter")).toBe(2);
    expect(nextSelectableIndex(options.map(o => ({ ...o, disabled: true })), 0, "ArrowRight")).toBe(0);
  });

  it("labels overflow and export triggers without exposing menu items while closed", () => {
    const actions = renderToStaticMarkup(createElement(ActionMenu, { label: "Thao tác ví", items: [{ label: "Lưu trữ", danger: true }] }));
    const exports = renderToStaticMarkup(createElement(ExportMenu, { items: [{ label: "CSV", href: "/export.csv" }] }));
    expect(actions).toContain('aria-label="Thao tác ví"');
    expect(actions).toContain('aria-haspopup="menu" aria-expanded="false"');
    expect(actions).not.toContain("Lưu trữ");
    expect(exports).toContain('aria-label="Xuất dữ liệu"');
    expect(exports).not.toContain("/export.csv");
  });

  it("disables overflow triggers when every available action is disabled", () => {
    const markup = renderToStaticMarkup(createElement(ActionMenu, {
      label: "Tác vụ", items: [{ label: "Sửa", disabled: true }],
    }));
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("gives icon actions a keyboard-sized target and renders statuses as non-interactive text", () => {
    const action = renderToStaticMarkup(createElement(IconButton, { label: "Ẩn số tiền", icon: Eye, pressed: true }));
    const badge = renderToStaticMarkup(<StatusBadge tone="warning">Cần kiểm tra</StatusBadge>);
    expect(action).toContain('aria-label="Ẩn số tiền"');
    expect(action).toContain('aria-pressed="true"');
    expect(action).toContain('v4-icon-button');
    expect(badge).toContain('class="v4-status-badge is-warning"');
    expect(badge).not.toContain("<button");
  });
});
