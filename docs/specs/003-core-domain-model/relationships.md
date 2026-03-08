# Spec 003 Entity Relationships

## Primary Relationship Map
- Tenant -> Organization (1:N)
- Organization -> Branch (1:N)
- Organization -> Customer (1:N)
- Organization -> Vendor (1:N)
- Customer -> Invoice (1:N)
- Invoice -> Payment (1:N)
- Invoice/Payment -> LedgerEntry (1:N)
- Organization -> TaxProfile (1:N, typically one active)
- TaxProfile -> GSTReturnReference (1:N)
- Organization -> LoanApplicationWorkspace (1:N)
- Organization -> WorkflowInstance (1:N)
- Organization -> NotificationRecord (1:N)
- Tenant/Organization context -> AuditEvent (1:N)

## Tenant Safety Rule
Every mutable entity includes `tenantId`; all tenant-scoped entities except Tenant include `organizationId`.

## Referential Integrity Guidance
- Customer must exist before Invoice creation.
- Invoice must exist before Payment creation.
- TaxProfile must exist before GSTReturnReference creation.
- Organization must exist before creating Branch/Customer/Vendor/Workflow/Loan workspace records.
