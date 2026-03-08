export default function CollectionsFollowupWorkflowPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Collections Follow-up Workflow</h1>
      <p>This page is the v1 shell for triggering and reviewing collections follow-up runs.</p>
      <p>API start endpoint: <code>POST /workflows/collections-followup/start</code></p>
      <p>Approval endpoint: <code>POST /workflows/:executionId/approve</code></p>
    </main>
  );
}
