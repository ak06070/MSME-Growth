import { randomUUID } from "node:crypto";
import type { Customer, Invoice } from "@msme/types";

interface FindCustomerInput {
  tenantId: string;
  organizationId: string;
  externalCode?: string;
  customerName: string;
}

export class InMemoryInvoiceDomainStore {
  private readonly customers: Customer[] = [];
  private readonly invoices: Invoice[] = [];

  findOrCreateCustomer(input: FindCustomerInput): Customer {
    const existing = this.customers.find((customer) => {
      if (customer.tenantId !== input.tenantId || customer.organizationId !== input.organizationId) {
        return false;
      }

      if (input.externalCode && customer.externalCode === input.externalCode) {
        return true;
      }

      return customer.name.toLowerCase() === input.customerName.toLowerCase();
    });

    if (existing) {
      return existing;
    }

    const customer: Customer = {
      id: randomUUID(),
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      name: input.customerName,
      externalCode: input.externalCode,
      status: "active"
    };

    this.customers.push(customer);
    return customer;
  }

  hasInvoice(tenantId: string, organizationId: string, invoiceNumber: string): boolean {
    return Boolean(this.findInvoiceByNumber(tenantId, organizationId, invoiceNumber));
  }

  findInvoiceByNumber(
    tenantId: string,
    organizationId: string,
    invoiceNumber: string
  ): Invoice | undefined {
    return this.invoices.find(
      (invoice) =>
        invoice.tenantId === tenantId &&
        invoice.organizationId === organizationId &&
        invoice.invoiceNumber === invoiceNumber
    );
  }

  saveInvoice(invoice: Invoice, mode: "insert" | "upsert" = "insert"): Invoice {
    if (mode === "upsert") {
      const existingIndex = this.invoices.findIndex(
        (candidate) =>
          candidate.tenantId === invoice.tenantId &&
          candidate.organizationId === invoice.organizationId &&
          candidate.invoiceNumber === invoice.invoiceNumber
      );

      if (existingIndex >= 0) {
        const existing = this.invoices[existingIndex];
        const updated: Invoice = {
          ...existing,
          ...invoice,
          id: existing.id
        };
        this.invoices[existingIndex] = updated;
        return updated;
      }
    }

    this.invoices.push(invoice);
    return invoice;
  }

  listInvoices(): Invoice[] {
    return [...this.invoices];
  }
}
