import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const utils = require("archiver-utils") as { file: { expand: (pattern: string) => string[] } };
const readdirGlob = require("readdir-glob") as (root: string, options: { pattern: string }) => {
  on: (event: string, listener: (value?: { relative: string }) => void) => ReturnType<typeof readdirGlob>;
};

describe("patched Excel archive dependency contracts", () => {
  it("keeps synchronous file patterns compatible with Archiver", () => {
    expect(utils.file.expand("package*.json")).toContain("package.json");
  });
  it("keeps streaming directory traversal compatible with the new Minimatch API", async () => {
    const matches = await new Promise<string[]>((resolve, reject) => {
      const files: string[] = [];
      readdirGlob("src/lib", { pattern: "**/money.ts" })
        .on("match", value => { if (value) files.push(value.relative); })
        .on("error", reject).on("end", () => resolve(files));
    });
    expect(matches).toContain("money.ts");
  });
});
