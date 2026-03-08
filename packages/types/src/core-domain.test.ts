import { describe, expect, it } from "vitest";
import {
  fixtureInvoice,
  fixtureLoanWorkspace,
  fixtureNotificationRecord,
  fixturePayment
} from "./core-domain.fixtures";
import {
  validateInvoice,
  validateLoanWorkspace,
  validatePayment,
  validateTenantScopedCollection
} from "./core-domain.validators";

describe("core domain validation", () => {
  it("accepts valid invoice baseline", () => {
    expect(validateInvoice(fixtureInvoice)).toEqual([]);
  });

  it("flags invoice due date before invoice date", () => {
    const invalid = {
      ...fixtureInvoice,
      dueDate: "2026-02-01"
    };

    expect(validateInvoice(invalid)).toContain("Due date cannot be before invoice date.");
  });

  it("accepts payment aligned with invoice", () => {
    expect(validatePayment(fixturePayment, fixtureInvoice)).toEqual([]);
  });

  it("flags payment tenant mismatch", () => {
    const invalidPayment = {
      ...fixturePayment,
      tenantId: "ten_999"
    };

    expect(validatePayment(invalidPayment, fixtureInvoice)).toContain(
      "Payment tenant/organization must match invoice tenant/organization."
    );
  });

  it("flags invalid loan workspace progress", () => {
    const invalid = {
      ...fixtureLoanWorkspace,
      checklistProgress: 120
    };

    expect(validateLoanWorkspace(invalid)).toContain(
      "Checklist progress must be between 0 and 100."
    );
  });

  it("flags cross-tenant records in collection", () => {
    const errors = validateTenantScopedCollection({
      tenantId: "ten_001",
      organizationId: "org_001",
      invoices: [fixtureInvoice],
      payments: [{ ...fixturePayment, tenantId: "ten_002" }],
      ledgerEntries: [],
      notifications: [fixtureNotificationRecord],
      auditEvents: []
    });

    expect(errors).toContain("Payment pay_001 violates tenant scope.");
  });
});
