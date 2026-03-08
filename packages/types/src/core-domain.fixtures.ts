import type {
  Customer,
  Invoice,
  LoanApplicationWorkspace,
  NotificationRecord,
  Payment,
  WorkflowInstance
} from "./core-domain";

export const fixtureCustomer: Customer = {
  id: "cust_001",
  tenantId: "ten_001",
  organizationId: "org_001",
  name: "Acme Traders",
  externalCode: "ACME01",
  status: "active"
};

export const fixtureInvoice: Invoice = {
  id: "inv_001",
  tenantId: "ten_001",
  organizationId: "org_001",
  customerId: fixtureCustomer.id,
  invoiceNumber: "INV-1001",
  invoiceDate: "2026-03-01",
  dueDate: "2026-03-15",
  currency: "INR",
  subtotalAmount: 10000,
  taxAmount: 1800,
  totalAmount: 11800,
  outstandingAmount: 11800,
  status: "issued",
  sourceType: "csv"
};

export const fixturePayment: Payment = {
  id: "pay_001",
  tenantId: "ten_001",
  organizationId: "org_001",
  invoiceId: fixtureInvoice.id,
  customerId: fixtureCustomer.id,
  paymentDate: "2026-03-10",
  amount: 2000,
  mode: "bank_transfer",
  status: "completed"
};

export const fixtureLoanWorkspace: LoanApplicationWorkspace = {
  id: "loan_ws_001",
  tenantId: "ten_001",
  organizationId: "org_001",
  name: "Q2 Working Capital",
  status: "open",
  checklistProgress: 40,
  riskFlags: ["pending_gst_reference"]
};

export const fixtureWorkflowInstance: WorkflowInstance = {
  id: "wf_001",
  tenantId: "ten_001",
  organizationId: "org_001",
  workflowType: "collections_followup",
  triggerType: "manual",
  status: "pending",
  startedAt: "2026-03-08T10:00:00.000Z",
  retryCount: 0
};

export const fixtureNotificationRecord: NotificationRecord = {
  id: "notif_001",
  tenantId: "ten_001",
  organizationId: "org_001",
  channel: "in_app",
  templateKey: "collections.reminder",
  recipientRef: "usr_finance",
  status: "queued"
};
