import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } = require("next/constants");
const configure = require("../../next.config.js");
const config = configure(PHASE_PRODUCTION_BUILD);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SANDBOX-PREVIEW-001: authenticated single-origin preview", () => {
  it("routes browser API requests internally without a second sandbox host", async () => {
    vi.stubEnv("INTERNAL_API_URL", "http://localhost:80/api/v1");
    expect(await config.rewrites()).toEqual([
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:80/api/v1/:path*",
      },
    ]);
  });

  it("preserves the existing development backend default", async () => {
    vi.stubEnv("INTERNAL_API_URL", "");
    expect((await config.rewrites())[0].destination).toBe(
      "http://localhost:4000/api/v1/:path*",
    );
  });

  it("keeps the sandbox session host-only and browser calls same-origin", () => {
    const env = readFileSync(
      resolve(__dirname, "../../../.env.sandbox"),
      "utf8",
    );
    expect(env).toMatch(/^NEXT_PUBLIC_API_URL=$/m);
    expect(env).toMatch(/^SESSION_COOKIE_DOMAIN=$/m);
  });

  it("isolates a running development preview from agent production builds", () => {
    expect(configure(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-dev");
    expect(config.distDir).toBe(".next");
    expect(configure(PHASE_DEVELOPMENT_SERVER).rewrites).toBe(config.rewrites);
  });
});
