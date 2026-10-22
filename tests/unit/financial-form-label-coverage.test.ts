import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const componentsDir = join(process.cwd(), "src/components");
const financialComponents = readdirSync(componentsDir).filter(file => file.endsWith(".tsx"));

function inspect(filename: string) {
  const file = join(componentsDir, filename);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labels = new Set<string>();
  const controls: { line: number; identifier: string | null; implicit: boolean; aria: boolean }[] = [];

  function attribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
    const entry = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(source) === name);
    return entry && ts.isJsxAttribute(entry) && entry.initializer ? entry.initializer.getText(source) : null;
  }

  function visit(node: ts.Node, insideLabel = false) {
    const nestedLabel = insideLabel || (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "label");
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (tag === "label") {
        const htmlFor = attribute(node, "htmlFor");
        if (htmlFor) labels.add(htmlFor);
      }
      if (["input", "select", "textarea"].includes(tag)) {
        controls.push({
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          identifier: attribute(node, "id"),
          implicit: nestedLabel,
          aria: Boolean(attribute(node, "aria-label") || attribute(node, "aria-labelledby")),
        });
      }
    }
    ts.forEachChild(node, child => visit(child, nestedLabel));
  }
  visit(source);
  return { labels, controls };
}

describe("finance form label coverage", () => {
  it("labels every native form control across the application", () => {
    const results = financialComponents.map(filename => ({ filename, ...inspect(filename) }));
    const candidates = results.filter(result => result.controls.length > 0);
    expect(candidates.length).toBeGreaterThanOrEqual(11);
    expect(candidates.reduce((sum, result) => sum + result.controls.length, 0)).toBeGreaterThanOrEqual(91);
    for (const { filename, labels, controls } of candidates) {
      const missing = controls.filter(control => !control.implicit && !control.aria && !(control.identifier && labels.has(control.identifier)));
      expect(missing.map(control => `${filename}:${control.line}`)).toEqual([]);
    }
  });
});
