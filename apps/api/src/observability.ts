import type { ObservabilityHooks } from "@msme/types";

export const noopObservabilityHooks: ObservabilityHooks = {
  recordMetric() {
    // Placeholder for metrics backend integration in later specs.
  },
  recordSpan() {
    // Placeholder for tracing backend integration in later specs.
  }
};
