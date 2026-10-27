import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminBillingSubnav } from "@/components/admin-billing-subnav";

describe("Admin billing route navigation", () => {
  it("uses links and a single aria-current route with accessible nav label", () => {
    const html = renderToStaticMarkup(createElement(AdminBillingSubnav, { active: "payments" }));
    expect(html).toContain('aria-label="Điều hướng vận hành thu phí"');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/admin\/billing\/payments"/);
    expect(html).toContain('href="/admin/billing/operations/inbox"');
    expect((html.match(/aria-current="page"/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain('role="tab"');
  });
});
