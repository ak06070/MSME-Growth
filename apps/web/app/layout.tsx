import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadWebEnv } from "../src/env";

const env = loadWebEnv();

export const metadata: Metadata = {
  title: env.appName,
  description: "Foundation shell for MSME Growth Platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
