import { describe, expect, it } from "vitest";
import { loadWebEnv } from "./env";

describe("web env", () => {
  it("loads default app name", () => {
    expect(loadWebEnv({}).appName).toBe("MSME Growth Platform");
  });

  it("loads app name from env", () => {
    expect(
      loadWebEnv({
        NEXT_PUBLIC_APP_NAME: "Pilot Workspace"
      }).appName
    ).toBe("Pilot Workspace");
  });
});
