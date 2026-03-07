import { describe, expect, it } from "vitest";
import { AppError, type TenantContext } from "./index";

describe("types foundation", () => {
  it("constructs AppError with metadata", () => {
    const error = new AppError("ERR_CODE", "failure", 400, { field: "name" });

    expect(error.code).toBe("ERR_CODE");
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: "name" });
  });

  it("supports tenant context shape", () => {
    const context: TenantContext = {
      tenantId: "tenant-1",
      organizationId: "org-1",
      actorId: "user-1"
    };

    expect(context.tenantId).toBe("tenant-1");
  });
});
