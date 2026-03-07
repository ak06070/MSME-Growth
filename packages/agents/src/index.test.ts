import { describe, expect, it } from "vitest";
import { defaultAgentPolicy } from "./index";

describe("agent placeholders", () => {
  it("defaults to advisory-only behavior", () => {
    expect(defaultAgentPolicy.advisoryOnly).toBe(true);
    expect(defaultAgentPolicy.allowedTools).toEqual([]);
  });
});
