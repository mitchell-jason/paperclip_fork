/*********
* 
* Aupy Consulting
* 2026
*
********/

import { describe, expect, it } from "vitest";

import type { CompanyArtifact } from "@/api/artifacts";

import { documentMarkdownToHtml, resolvePrintSource } from "./print-artifact";

const ISSUE = { id: "issue-1", identifier: "AUP-45", title: "Printing Artifacts", href: "/AUP/issues/AUP-45" };

function artifact(overrides: Partial<CompanyArtifact> = {}): CompanyArtifact {
  return {
    id: "artifact-1",
    source: "attachment",
    mediaKind: "file",
    title: "Evidence",
    previewText: null,
    contentType: "text/plain",
    contentPath: "/api/attachments/abc/content",
    openPath: "/api/attachments/abc/content?raw=1",
    downloadPath: "/api/attachments/abc/content?download=1",
    issue: ISSUE as CompanyArtifact["issue"],
    project: null,
    createdByAgent: null,
    updatedAt: "2026-09-28T20:00:00.000Z",
    href: "/AUP/issues/AUP-45#attachment-abc",
    ...overrides,
  } as CompanyArtifact;
}

describe("resolvePrintSource", () => {
  it("prefers the file paths of attachment artifacts", () => {
    expect(resolvePrintSource(artifact())).toEqual({
      kind: "file",
      url: "/api/attachments/abc/content?raw=1",
    });
  });

  it("falls back through contentPath and downloadPath", () => {
    expect(resolvePrintSource(artifact({ openPath: null }))).toEqual({
      kind: "file",
      url: "/api/attachments/abc/content",
    });
    expect(resolvePrintSource(artifact({ openPath: null, contentPath: null }))).toEqual({
      kind: "file",
      url: "/api/attachments/abc/content?download=1",
    });
  });

  it("resolves document artifacts from their href fragment", () => {
    expect(
      resolvePrintSource(
        artifact({
          source: "document",
          mediaKind: "document",
          contentPath: null,
          openPath: null,
          downloadPath: null,
          href: "/AUP/issues/AUP-45#document-design-notes",
        }),
      ),
    ).toEqual({ kind: "document", issueId: "issue-1", documentKey: "design-notes" });
  });

  it("returns none when there is nothing printable", () => {
    expect(
      resolvePrintSource(
        artifact({
          mediaKind: "empty",
          contentPath: null,
          openPath: null,
          downloadPath: null,
          href: "/AUP/issues/AUP-45",
        }),
      ),
    ).toEqual({ kind: "none" });
  });
});

describe("documentMarkdownToHtml", () => {
  it("renders headings, lists and code fences", () => {
    const html = documentMarkdownToHtml("# Title\n\n- one\n- two\n\n```\nconst a = 1;\n```\n");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("<pre>");
    expect(html).toContain("const a = 1;");
  });

  it("keeps tables readable as fixed-width blocks", () => {
    const html = documentMarkdownToHtml("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(html).toContain('<pre class="tbl">');
    expect(html).toContain("| 1 | 2 |");
  });

  it("escapes markup instead of trusting document content", () => {
    const html = documentMarkdownToHtml('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
