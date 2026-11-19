import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "*.md",
      "next-env.d.ts",
      "src/prisma/contract.d.ts",
      "migrations/**",
    ],
  },
  {
    rules: {
      "no-empty-object-type": "off",
    },
  },
]);
