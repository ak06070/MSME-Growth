export interface WebEnv {
  appName: string;
}

export const loadWebEnv = (
  source: Record<string, string | undefined> = process.env
): WebEnv => {
  return {
    appName: source.NEXT_PUBLIC_APP_NAME ?? "MSME Growth Platform"
  };
};
