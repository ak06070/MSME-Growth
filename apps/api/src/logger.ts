import type { LogContext, Logger } from "@msme/types";

const write = (level: string, message: string, context?: LogContext): void => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context: context ?? {}
  };

  // Foundation-level logger hook with structured JSON output.
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

export const createLogger = (baseContext: LogContext = {}): Logger => {
  const merge = (context?: LogContext): LogContext => ({
    ...baseContext,
    ...(context ?? {})
  });

  return {
    debug(message, context) {
      write("debug", message, merge(context));
    },
    info(message, context) {
      write("info", message, merge(context));
    },
    warn(message, context) {
      write("warn", message, merge(context));
    },
    error(message, context) {
      write("error", message, merge(context));
    },
    child(context) {
      return createLogger(merge(context));
    }
  };
};
