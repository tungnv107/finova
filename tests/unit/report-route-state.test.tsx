import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportLoading, ReportError } from "@/components/report-route-state";

describe("report routes", () => {
  it("shows an accessible loading placeholder without private amounts", () => {
    const html = renderToStaticMarkup(<ReportLoading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Đang tải số liệu tài chính");
  });

  it("provides retry and sign-in actions without exposing server error details", () => {
    const html = renderToStaticMarkup(<ReportError error={new Error("sensitive connection secret")} retry={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Thử lại");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("sensitive connection secret");
  });
});
