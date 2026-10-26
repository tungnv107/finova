import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireContext, getBillingOrder } = vi.hoisted(() => ({
  requireContext: vi.fn(), getBillingOrder: vi.fn(),
}));
vi.mock("../../src/server/context", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/server/context")>(), requireContext,
}));
vi.mock("../../src/modules/billing/service", () => ({ getBillingOrder }));

import { HttpError } from "../../src/server/context";
import { GET } from "../../src/app/api/v1/billing/orders/[id]/route";

const request = () => new NextRequest("http://localhost:3002/api/v1/billing/orders/order-1");
const params = { params: Promise.resolve({ id: "order-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  // A signed-in Lite user must still be able to check a billing order.
  requireContext.mockResolvedValue({ userId: "lite-user", plan: "LITE" });
  getBillingOrder.mockResolvedValue({ id: "order-1", status: "PENDING_PAYMENT", activatedAt: null });
});

describe("billing order status lookup", () => {
  it("lets Lite users read their own pending status without a Premium entitlement", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect((await response.json()).data).toMatchObject({ status: "PENDING_PAYMENT", activatedAt: null });
    expect(getBillingOrder).toHaveBeenCalledWith("lite-user", "order-1");
  });

  it("does not expose other users' orders or unauthenticated lookup", async () => {
    getBillingOrder.mockRejectedValueOnce(new HttpError(404, "ORDER_NOT_FOUND", "Not found"));
    expect((await GET(request(), params)).status).toBe(404);
    requireContext.mockRejectedValueOnce(new HttpError(401, "UNAUTHENTICATED", "Login"));
    expect((await GET(request(), params)).status).toBe(401);
    expect(getBillingOrder).toHaveBeenCalledTimes(1);
  });
});
