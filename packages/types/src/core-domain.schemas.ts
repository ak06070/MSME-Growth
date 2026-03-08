export const organizationSchema = {
  type: "object",
  required: ["id", "tenantId", "name"],
  properties: {
    id: { type: "string", minLength: 1 },
    tenantId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    legalName: { type: "string" },
    gstin: { type: "string" },
    status: { enum: ["active", "inactive"] }
  }
} as const;

export const customerSchema = {
  type: "object",
  required: ["id", "tenantId", "organizationId", "name", "status"],
  properties: {
    id: { type: "string", minLength: 1 },
    tenantId: { type: "string", minLength: 1 },
    organizationId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    contactEmail: { type: "string" },
    contactPhone: { type: "string" },
    status: { enum: ["active", "inactive"] }
  }
} as const;

export const invoiceSchema = {
  type: "object",
  required: [
    "id",
    "tenantId",
    "organizationId",
    "customerId",
    "invoiceNumber",
    "invoiceDate",
    "dueDate",
    "currency",
    "subtotalAmount",
    "taxAmount",
    "totalAmount",
    "outstandingAmount",
    "status",
    "sourceType"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    tenantId: { type: "string", minLength: 1 },
    organizationId: { type: "string", minLength: 1 },
    customerId: { type: "string", minLength: 1 },
    invoiceNumber: { type: "string", minLength: 1 },
    invoiceDate: { type: "string", minLength: 1 },
    dueDate: { type: "string", minLength: 1 },
    currency: { type: "string", minLength: 1 },
    subtotalAmount: { type: "number", minimum: 0 },
    taxAmount: { type: "number", minimum: 0 },
    totalAmount: { type: "number", minimum: 0 },
    outstandingAmount: { type: "number", minimum: 0 },
    status: { enum: ["draft", "issued", "partially_paid", "paid", "overdue"] },
    sourceType: { enum: ["csv", "manual"] }
  }
} as const;

export const paymentSchema = {
  type: "object",
  required: [
    "id",
    "tenantId",
    "organizationId",
    "invoiceId",
    "customerId",
    "paymentDate",
    "amount",
    "mode",
    "status"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    tenantId: { type: "string", minLength: 1 },
    organizationId: { type: "string", minLength: 1 },
    invoiceId: { type: "string", minLength: 1 },
    customerId: { type: "string", minLength: 1 },
    paymentDate: { type: "string", minLength: 1 },
    amount: { type: "number", exclusiveMinimum: 0 },
    mode: { type: "string", minLength: 1 },
    status: { enum: ["pending", "completed", "reversed"] }
  }
} as const;

export const loanWorkspaceSchema = {
  type: "object",
  required: ["id", "tenantId", "organizationId", "name", "status", "checklistProgress"],
  properties: {
    id: { type: "string", minLength: 1 },
    tenantId: { type: "string", minLength: 1 },
    organizationId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    status: { enum: ["open", "in_review", "submitted", "closed"] },
    checklistProgress: { type: "number", minimum: 0, maximum: 100 }
  }
} as const;

export const workflowInstanceSchema = {
  type: "object",
  required: [
    "id",
    "tenantId",
    "organizationId",
    "workflowType",
    "triggerType",
    "status",
    "startedAt",
    "retryCount"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    tenantId: { type: "string", minLength: 1 },
    organizationId: { type: "string", minLength: 1 },
    workflowType: { type: "string", minLength: 1 },
    triggerType: { type: "string", minLength: 1 },
    status: {
      enum: ["pending", "running", "awaiting_approval", "completed", "failed", "cancelled"]
    },
    startedAt: { type: "string", minLength: 1 },
    retryCount: { type: "number", minimum: 0 }
  }
} as const;

export const notificationRecordSchema = {
  type: "object",
  required: [
    "id",
    "tenantId",
    "organizationId",
    "channel",
    "templateKey",
    "recipientRef",
    "status"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    tenantId: { type: "string", minLength: 1 },
    organizationId: { type: "string", minLength: 1 },
    channel: { enum: ["in_app", "email", "whatsapp"] },
    templateKey: { type: "string", minLength: 1 },
    recipientRef: { type: "string", minLength: 1 },
    status: { enum: ["queued", "sent", "failed"] }
  }
} as const;
