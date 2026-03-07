import { describe, expect, it } from "vitest";
import { renderCardText } from "./index";

describe("ui primitives", () => {
  it("renders text for placeholder card", () => {
    expect(
      renderCardText({
        title: "Foundation",
        description: "Scaffold complete"
      })
    ).toBe("Foundation: Scaffold complete");
  });
});
