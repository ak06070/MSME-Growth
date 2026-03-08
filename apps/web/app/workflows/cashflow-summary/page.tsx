export default function CashflowSummaryWorkflowPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Cashflow Summary Workflow</h1>
      <p>This page is the v1 shell for generating and reviewing cashflow summary workflows.</p>
      <p>Generate endpoint: <code>POST /workflows/cashflow-summary/generate</code></p>
      <p>Approval endpoint: <code>POST /workflows/cashflow-summary/:executionId/approve</code></p>
    </main>
  );
}
