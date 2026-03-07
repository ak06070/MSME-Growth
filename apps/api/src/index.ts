import { buildServer } from "./server";
import { loadApiEnv } from "./env";

const start = async (): Promise<void> => {
  const env = loadApiEnv();
  const app = buildServer();

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  void start();
}
