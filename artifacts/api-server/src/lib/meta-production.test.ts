import { expect, it, vi } from "vitest";
import { createMetaAccessChecker, createMetaExplainer } from "./meta-hiring";

it("allows only the explicit published HTTPS origin without code", async () => {
  const config = () => ({ enabled: true, key: "mock", publicOrigin: "https://judges.example.org" });
  const checker = createMetaAccessChecker(config, { consume: async () => true });
  expect(await checker("https://judges.example.org")).toMatchObject({ status: "allowed", providerRequestMade: false });
  await expect(checker("https://evil.example.org")).rejects.toMatchObject({ code: "DEMO_ORIGIN_DENIED" });
  await expect(checker(undefined)).rejects.toThrow();
  const fetcher = vi.fn();
  const reserve = vi.fn();
  const explain = createMetaExplainer(config, { reserve }, fetcher, checker);
  await expect(explain({ profileId: "northstar-studio", consent: true }, "https://evil.example.org")).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
});
it("rejects malformed or non-HTTPS public configuration", async () => {
  for (const publicOrigin of ["http://judges.example.org", "https://judges.example.org/path", "https://*.example.org"]) {
    const checker = createMetaAccessChecker(() => ({ enabled: true, key: "mock", publicOrigin }), { consume: async () => true });
    await expect(checker(publicOrigin)).rejects.toMatchObject({ code: "PUBLIC_ORIGIN_INVALID" });
  }
});
