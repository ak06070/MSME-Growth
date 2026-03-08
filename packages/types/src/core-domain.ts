import type { AuditEvent, OrganizationId, TenantId } from "./index";

export type RecordStatus = "active" | "inactive";

export interface Branch {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  name: string;
  code: string;
  address?: string;
  status: RecordStatus;
}

export interface Customer {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  branchId?: string;
  name: string;
  externalCode?: string;
  taxId?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: RecordStatus;
}

export interface Vendor {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  name: string;
  externalCode?: string;
  taxId?: string;
  status: RecordStatus;
}

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue";

export interface Invoice {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  branchId?: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  outstandingAmount: number;
  status: InvoiceStatus;
  sourceType: "csv" | "manual";
}

export type PaymentStatus = "pending" | "completed" | "reversed";

export interface Payment {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  invoiceId: string;
  customerId: string;
  paymentDate: string;
  amount: number;
  mode: string;
  referenceNumber?: string;
  status: PaymentStatus;
}

export interface LedgerEntry {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  entryDate: string;
  entryType: string;
  referenceType?: "invoice" | "payment";
  referenceId?: string;
  debitAmount: number;
  creditAmount: number;
  currency: string;
  description?: string;
}

export interface TaxProfile {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  gstin?: string;
  registrationType: string;
  filingFrequency: "monthly" | "quarterly";
  stateCode?: string;
  status: RecordStatus;
}

export type GSTReturnStatus = "draft" | "ready" | "filed" | "rejected";

export interface GSTReturnReference {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  taxProfileId: string;
  returnType: string;
  period: string;
  status: GSTReturnStatus;
  referenceNumber?: string;
  filedAt?: string;
}

export interface LoanApplicationWorkspace {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  name: string;
  status: "open" | "in_review" | "submitted" | "closed";
  checklistProgress: number;
  riskFlags: string[];
  exportSnapshotPath?: string;
}

export type WorkflowInstanceStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowInstance {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  workflowType: string;
  triggerType: string;
  status: WorkflowInstanceStatus;
  startedAt: string;
  completedAt?: string;
  currentStep?: string;
  retryCount: number;
  errorCode?: string;
}

export type NotificationStatus = "queued" | "sent" | "failed" | "dismissed";

export interface NotificationRecord {
  id: string;
  tenantId: TenantId;
  organizationId: OrganizationId;
  channel: "in_app" | "email" | "whatsapp";
  templateKey: string;
  recipientRef: string;
  status: NotificationStatus;
  sentAt?: string;
  failureReason?: string;
}

export interface EntityRelationshipSnapshot {
  organizationId: string;
  branchIds: string[];
  customerIds: string[];
  vendorIds: string[];
  invoiceIds: string[];
  paymentIds: string[];
  loanWorkspaceIds: string[];
  workflowInstanceIds: string[];
  notificationRecordIds: string[];
  auditEventIds: string[];
}

export interface TenantScopedCollection {
  tenantId: string;
  organizationId: string;
  invoices: Invoice[];
  payments: Payment[];
  ledgerEntries: LedgerEntry[];
  notifications: NotificationRecord[];
  auditEvents: AuditEvent[];
}
