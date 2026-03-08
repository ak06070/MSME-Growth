export default function LoanReadinessWorkflowPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Loan Readiness Workspace Workflow</h1>
      <p>This page is the v1 shell for managing loan-readiness workspaces and export approvals.</p>
      <p>Create endpoint: <code>POST /workflows/loan-readiness/create</code></p>
      <p>Checklist update endpoint: <code>POST /workflows/loan-readiness/:workspaceId/checklist</code></p>
      <p>Export flow endpoints:
        <code>POST /workflows/loan-readiness/:workspaceId/export-start</code> and
        <code>POST /workflows/loan-readiness/:executionId/approve-export</code>
      </p>
    </main>
  );
}
