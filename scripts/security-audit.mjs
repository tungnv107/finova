// Fail CI for any runtime advisory or a new development advisory.
// The temporary exception is the dev-only ESLint chain still requiring old minimatch.
// See docs/SYSTEM_AUDIT_2026-10-31.md for runtime remediation and compatibility evidence.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ADVISORY = "GHSA-g3hv-75wg-m249";
const RECHECK_BY = "2026-12-01";
const expectedChain = new Map([
  [
    "@eslint-community/eslint-utils",
    [
      "eslint"
    ]
  ],
  [
    "@eslint/config-array",
    [
      "minimatch"
    ]
  ],
  [
    "@eslint/eslintrc",
    [
      "minimatch"
    ]
  ],
  [
    "@next/eslint-plugin-next",
    [
      "@eslint-community/eslint-utils"
    ]
  ],
  [
    "@typescript-eslint/eslint-plugin",
    [
      "@typescript-eslint/parser",
      "@typescript-eslint/type-utils",
      "@typescript-eslint/utils",
      "eslint"
    ]
  ],
  [
    "@typescript-eslint/parser",
    [
      "@typescript-eslint/typescript-estree",
      "eslint"
    ]
  ],
  [
    "@typescript-eslint/type-utils",
    [
      "@typescript-eslint/typescript-estree",
      "@typescript-eslint/utils",
      "eslint"
    ]
  ],
  [
    "@typescript-eslint/typescript-estree",
    [
      "minimatch"
    ]
  ],
  [
    "@typescript-eslint/utils",
    [
      "@eslint-community/eslint-utils",
      "@typescript-eslint/typescript-estree",
      "eslint"
    ]
  ],
  [
    "eslint",
    [
      "@eslint-community/eslint-utils",
      "@eslint/config-array",
      "@eslint/eslintrc",
      "minimatch"
    ]
  ],
  [
    "eslint-config-next",
    [
      "@next/eslint-plugin-next",
      "eslint",
      "eslint-plugin-import",
      "eslint-plugin-jsx-a11y",
      "eslint-plugin-react",
      "typescript-eslint"
    ]
  ],
  [
    "eslint-plugin-import",
    [
      "minimatch"
    ]
  ],
  [
    "eslint-plugin-jsx-a11y",
    [
      "minimatch"
    ]
  ],
  [
    "eslint-plugin-react",
    [
      "minimatch"
    ]
  ],
  [
    "minimatch",
    [
      "GHSA-g3hv-75wg-m249"
    ]
  ],
  [
    "typescript-eslint",
    [
      "@typescript-eslint/eslint-plugin",
      "@typescript-eslint/parser",
      "@typescript-eslint/typescript-estree",
      "@typescript-eslint/utils",
      "eslint"
    ]
  ]
]);

function audit(flags = "") {
  let output;
  try {
    output = execSync(`npm audit --json ${flags}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    });
  } catch (error) {
    // npm audit returns exit code 1 when it finds a vulnerability.
    output = error.stdout?.toString();
  }

  let result;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error("npm audit did not return valid JSON; registry/connectivity check failed.");
  }
  if (!result.metadata?.vulnerabilities || !result.vulnerabilities) {
    throw new Error("npm audit has no complete vulnerability report; refusing to treat it as clean.");
  }
  return result;
}

function check() {
  const production = audit("--omit=dev --omit=peer");
  if (production.metadata.vulnerabilities.total !== 0) {
    throw new Error(`Production dependency audit has ${production.metadata.vulnerabilities.total} advisory findings.`);
  }
  console.log("PASS: production dependencies have 0 npm audit findings.");

  const full = audit();
  const findings = Object.entries(full.vulnerabilities);
  if (findings.length === 0 && full.metadata.vulnerabilities.total === 0) {
    console.log("PASS: full dependency tree has 0 npm audit findings.");
    return;
  }

  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const [name, finding] of findings) {
    const expected = expectedChain.get(name);
    if (!expected || finding.severity !== "moderate" || finding.via.length !== expected.length) {
      throw new Error(`New/unexpected audit advisory for ${name} (${finding.severity}).`);
    }
    const actual = finding.via.map(item => {
      if (typeof item === "string") return item;
      if (item.name !== "minimatch" || item.severity !== "moderate" || !item.url?.endsWith(`/${ADVISORY}`)) {
        throw new Error(`New advisory for ${name}.`);
      }
      return ADVISORY;
    }).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Audit advisory chain changed for ${name}.`);
    if (!finding.nodes?.length || finding.nodes.some((node) => lock.packages?.[node]?.dev !== true)) {
      throw new Error(`Audit finding ${name} is not exclusively dev-only.`);
    }
  }
  if (findings.length !== expectedChain.size || full.metadata.vulnerabilities.total !== findings.length) {
    throw new Error("Audit advisory set changed; inspect and update the remediation plan.");
  }
  if (new Date().toISOString().slice(0, 10) >= RECHECK_BY) {
    throw new Error(`Temporary dev-only ${ADVISORY} review deadline ${RECHECK_BY} has passed.`);
  }
  console.log(`TRACKED (still vulnerable): ${findings.length} dev-only audit nodes from ${ADVISORY}; reassess by ${RECHECK_BY}.`);
}

try {
  check();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
