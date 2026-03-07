import { describe, expect, it } from "vitest";
import type { ConnectorRunResult } from "./index";

describe("connector placeholders", () => {
  it("supports connector result shape", () => {
    const result: ConnectorRunResult = {
      status: "idle",
      importedCount: 0,
      errorCount: 0
    };

    expect(result.status).toBe("idle");
  });
});
