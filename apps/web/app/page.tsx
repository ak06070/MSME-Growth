import { loadWebEnv } from "../src/env";

const env = loadWebEnv();

export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>{env.appName}</h1>
      <p>Foundation scaffold is active.</p>
      <p>No business workflows are implemented in this stage.</p>
    </main>
  );
}
