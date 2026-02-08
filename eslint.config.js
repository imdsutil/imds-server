import js from "@eslint/js";
import nodePlugin from "eslint-plugin-n";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/", "dist/", "coverage/"],
  },
  js.configs.recommended,
  nodePlugin.configs["flat/recommended-module"],
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "n/no-unsupported-features/node-builtins": ["error", { version: ">=20.0.0" }],
    },
  },
  {
    files: ["eslint.config.js", "commitlint.config.js"],
    rules: {
      "n/no-unpublished-import": "off",
    },
  },
  {
    files: ["test/**/*.js"],
    rules: {
      "n/no-unsupported-features/node-builtins": "off",
    },
  },
];
