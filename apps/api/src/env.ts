export interface ApiEnv {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  sessionSecret: string;
  authTokenSecret: string;
  databaseUrl?: string;
  notificationEmailWebhookUrl?: string;
  notificationWhatsappWebhookUrl?: string;
  notificationMaxAttempts: number;
  notificationRetryDelayMs: number;
}

const validNodeEnvs = new Set(["development", "test", "production"]);
const validLogLevels = new Set(["debug", "info", "warn", "error"]);

export const loadApiEnv = (source: NodeJS.ProcessEnv = process.env): ApiEnv => {
  const nodeEnv = source.NODE_ENV ?? "development";
  const logLevel = source.LOG_LEVEL ?? "info";
  const portRaw = source.PORT ?? "3001";
  const sessionSecret = source.SESSION_SECRET ?? "dev-session-secret";
  const authTokenSecret = source.AUTH_TOKEN_SECRET ?? "dev-auth-token-secret";
  const databaseUrl = source.DATABASE_URL;
  const notificationEmailWebhookUrl = source.NOTIFICATION_EMAIL_WEBHOOK_URL;
  const notificationWhatsappWebhookUrl = source.NOTIFICATION_WHATSAPP_WEBHOOK_URL;
  const notificationMaxAttemptsRaw = source.NOTIFICATION_MAX_ATTEMPTS ?? "3";
  const notificationRetryDelayMsRaw = source.NOTIFICATION_RETRY_DELAY_MS ?? "60000";
  const port = Number(portRaw);
  const notificationMaxAttempts = Number(notificationMaxAttemptsRaw);
  const notificationRetryDelayMs = Number(notificationRetryDelayMsRaw);

  if (!validNodeEnvs.has(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
  }

  if (!validLogLevels.has(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  if (!Number.isInteger(notificationMaxAttempts) || notificationMaxAttempts <= 0) {
    throw new Error(`Invalid NOTIFICATION_MAX_ATTEMPTS: ${notificationMaxAttemptsRaw}`);
  }

  if (!Number.isInteger(notificationRetryDelayMs) || notificationRetryDelayMs < 0) {
    throw new Error(`Invalid NOTIFICATION_RETRY_DELAY_MS: ${notificationRetryDelayMsRaw}`);
  }

  return {
    nodeEnv: nodeEnv as ApiEnv["nodeEnv"],
    logLevel: logLevel as ApiEnv["logLevel"],
    port,
    sessionSecret,
    authTokenSecret,
    databaseUrl,
    notificationEmailWebhookUrl,
    notificationWhatsappWebhookUrl,
    notificationMaxAttempts,
    notificationRetryDelayMs
  };
};
