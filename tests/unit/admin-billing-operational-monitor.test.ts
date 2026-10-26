import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/server/context";
import { billingOperationalMonitorEnabled, runBillingOperationalSweep,
  sampleBillingProviderHealth } from "../../src/modules/admin/billing-operational-monitor";

afterEach(() => {
  delete process.env.FINOVA_BILLING_PROVIDER_HEALTH_URL;
  delete process.env.FINOVA_BILLING_ALERTS_ENABLED;
  vi.unstubAllGlobals();
});

describe("Billing operational provider health boundary", () => {
  it("does not infer provider downtime without a configured independent endpoint", async () => {
    expect(await sampleBillingProviderHealth()).toBeNull();
    expect(billingOperationalMonitorEnabled()).toBe(false);
    await expect(runBillingOperationalSweep()).rejects.toMatchObject({
      status: 404, code: "ALERT_MONITOR_DISABLED",
    } satisfies Partial<HttpError>);
  });

  it("accepts only provider HTTPS with no credentials or custom port", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const url of ["http://status.sepay.vn/health", "https://127.0.0.1/health",
      "https://sepay.vn.evil.example/health", "https://user:pass@api.sepay.vn/health",
      "https://api.sepay.vn:8443/health"]) {
      process.env.FINOVA_BILLING_PROVIDER_HEALTH_URL = url;
      await expect(sampleBillingProviderHealth()).rejects.toThrow("INVALID_PROVIDER_HEALTH_CONFIG");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses an independent no-redirect GET and treats errors as probe failures", async () => {
    process.env.FINOVA_BILLING_PROVIDER_HEALTH_URL = "https://api.sepay.vn/health";
    const fetchSpy = vi.fn().mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchSpy);
    expect(await sampleBillingProviderHealth()).toBe("HEALTHY");
    expect(await sampleBillingProviderHealth()).toBe("UNREACHABLE");
    expect(await sampleBillingProviderHealth()).toBe("UNREACHABLE");
    expect(fetchSpy).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      redirect: "error", cache: "no-store", method: "GET",
    }));
  });
});
