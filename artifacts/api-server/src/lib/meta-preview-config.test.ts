import { afterEach, expect, it, vi } from "vitest";
import { metaConfig } from "./meta-hiring";

afterEach(() => vi.unstubAllEnvs());
it("binds the no-code preview to platform runtime metadata, not a stale saved alias", () => {
  for (const name of ["Meta_model_api_key", "META_MODEL_API_KEY", "MODEL_API_KEY"]) vi.stubEnv(name, "");
  vi.stubEnv("HIRESENSE_META_DEV_PREVIEW_NO_CODE", "true");
  vi.stubEnv("REPLIT_DEV_DOMAIN", "project-current.worf.replit.dev");
  vi.stubEnv("HIRESENSE_META_ALLOWED_ORIGIN", "https://project-stale.worf.replit.dev");
  vi.stubEnv("HIRESENSE_META_ADDITIONAL_ORIGIN", "https://project-explicit.worf.replit.dev");
  const config = metaConfig();
  expect(config.origin).toBe("https://project-current.worf.replit.dev");
  expect(config.previewDemo?.canonicalOrigin).toBe(config.origin);
  expect(config.additionalOrigin).toBe("https://project-explicit.worf.replit.dev");
});
