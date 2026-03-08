export interface ApiEnv {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  sessionSecret: string;
}

const validNodeEnvs = new Set(["development", "test", "production"]);
const validLogLevels = new Set(["debug", "info", "warn", "error"]);

export const loadApiEnv = (source: NodeJS.ProcessEnv = process.env): ApiEnv => {
  const nodeEnv = source.NODE_ENV ?? "development";
  const logLevel = source.LOG_LEVEL ?? "info";
  const portRaw = source.PORT ?? "3001";
  const sessionSecret = source.SESSION_SECRET ?? "dev-session-secret";
  const port = Number(portRaw);

  if (!validNodeEnvs.has(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
  }

  if (!validLogLevels.has(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  return {
    nodeEnv: nodeEnv as ApiEnv["nodeEnv"],
    logLevel: logLevel as ApiEnv["logLevel"],
    port,
    sessionSecret
  };
};
