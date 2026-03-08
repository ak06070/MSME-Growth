import type {
  Invoice,
  LoanApplicationWorkspace,
  Payment,
  TenantScopedCollection,
  WorkflowInstance
} from "./core-domain";

const isValidDateString = (value: string): boolean => {
  return !Number.isNaN(new Date(value).getTime());
};

export const validateInvoice = (invoice: Invoice): string[] => {
  const errors: string[] = [];

  if (invoice.subtotalAmount < 0 || invoice.taxAmount < 0 || invoice.totalAmount < 0) {
    errors.push("Invoice amounts must be non-negative.");
  }

  if (invoice.outstandingAmount < 0) {
    errors.push("Outstanding amount cannot be negative.");
  }

  if (invoice.outstandingAmount > invoice.totalAmount) {
    errors.push("Outstanding amount cannot exceed total amount.");
  }

  if (!isValidDateString(invoice.invoiceDate) || !isValidDateString(invoice.dueDate)) {
    errors.push("Invoice and due dates must be valid date strings.");
  } else if (new Date(invoice.dueDate).getTime() < new Date(invoice.invoiceDate).getTime()) {
    errors.push("Due date cannot be before invoice date.");
  }

  return errors;
};

export const validatePayment = (payment: Payment, invoice?: Invoice): string[] => {
  const errors: string[] = [];

  if (payment.amount <= 0) {
    errors.push("Payment amount must be greater than zero.");
  }

  if (!isValidDateString(payment.paymentDate)) {
    errors.push("Payment date must be valid.");
  }

  if (invoice) {
    if (payment.tenantId !== invoice.tenantId || payment.organizationId !== invoice.organizationId) {
      errors.push("Payment tenant/organization must match invoice tenant/organization.");
    }

    if (payment.amount > invoice.totalAmount) {
      errors.push("Payment amount cannot exceed invoice total amount in baseline validation.");
    }
  }

  return errors;
};

export const validateLoanWorkspace = (workspace: LoanApplicationWorkspace): string[] => {
  const errors: string[] = [];

  if (workspace.checklistProgress < 0 || workspace.checklistProgress > 100) {
    errors.push("Checklist progress must be between 0 and 100.");
  }

  return errors;
};

export const validateWorkflowInstance = (workflow: WorkflowInstance): string[] => {
  const errors: string[] = [];

  if (workflow.retryCount < 0) {
    errors.push("Retry count cannot be negative.");
  }

  if (!isValidDateString(workflow.startedAt)) {
    errors.push("Workflow startedAt must be a valid date string.");
  }

  if (workflow.completedAt && !isValidDateString(workflow.completedAt)) {
    errors.push("Workflow completedAt must be a valid date string when provided.");
  }

  return errors;
};

export const validateTenantScopedCollection = (
  collection: TenantScopedCollection
): string[] => {
  const errors: string[] = [];

  for (const invoice of collection.invoices) {
    if (invoice.tenantId !== collection.tenantId || invoice.organizationId !== collection.organizationId) {
      errors.push(`Invoice ${invoice.id} violates tenant scope.`);
    }
  }

  for (const payment of collection.payments) {
    if (payment.tenantId !== collection.tenantId || payment.organizationId !== collection.organizationId) {
      errors.push(`Payment ${payment.id} violates tenant scope.`);
    }
  }

  for (const ledgerEntry of collection.ledgerEntries) {
    if (
      ledgerEntry.tenantId !== collection.tenantId ||
      ledgerEntry.organizationId !== collection.organizationId
    ) {
      errors.push(`Ledger entry ${ledgerEntry.id} violates tenant scope.`);
    }
  }

  for (const notification of collection.notifications) {
    if (
      notification.tenantId !== collection.tenantId ||
      notification.organizationId !== collection.organizationId
    ) {
      errors.push(`Notification ${notification.id} violates tenant scope.`);
    }
  }

  for (const auditEvent of collection.auditEvents) {
    if (auditEvent.tenantId !== collection.tenantId) {
      errors.push(
        `Audit event ${auditEvent.resourceId ?? auditEvent.resourceType} violates tenant scope.`
      );
    }
  }

  return errors;
};
