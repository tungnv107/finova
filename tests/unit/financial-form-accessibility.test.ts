import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function inspectForm(sourcePath: string) {
  const content = readFileSync(join(process.cwd(), sourcePath), "utf8");
  const source = ts.createSourceFile(sourcePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const labels: string[] = [];
  const controls: string[] = [];

  function attribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
    const entry = node.attributes.properties.find(value => ts.isJsxAttribute(value) && value.name.getText(source) === name);
    return entry?.getText(source);
  }

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (tag === "label") labels.push(attribute(node, "htmlFor")?.replace(/^htmlFor=/, "") ?? "");
      if (["input", "select", "textarea"].includes(tag)) {
        controls.push(attribute(node, "id")?.replace(/^id=/, "") ?? "");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { content, labels, controls };
}

describe.each([
  ["credit cards", "src/components/cards-manager.tsx", 17],
  ["debts", "src/components/debts-manager.tsx", 16],
] as const)("accessible %s forms", (_feature, filename, count) => {
  it("associates every field with a unique explicit label using React useId", () => {
    const { content, labels, controls } = inspectForm(filename);
    expect(content).toContain("useId()");
    expect(controls).toHaveLength(count);
    expect(labels).toHaveLength(count);
    expect(labels.every(Boolean)).toBe(true);
    expect(labels).toEqual(controls);
    expect(new Set(controls).size).toBe(controls.length);
  });

  it("announces form errors and successful saves", () => {
    const { content } = inspectForm(filename);
    expect(content).toMatch(/role="alert"/);
    expect(content).toMatch(/role="status"/);
  });
});
