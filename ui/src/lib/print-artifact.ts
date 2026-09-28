import type { CompanyArtifact } from "@/api/artifacts";

/**
 * 
 * Aupy Consulting
 * 2026
 *
 * Where the printable bytes of an artifact live.
 *
 * Artifact kinds differ: attachment and work-product artifacts expose a file
 * (`contentPath` / `openPath` / `downloadPath`), while `document` artifacts
 * carry no file at all. A document's body lives on its issue and is served by
 * `GET /api/issues/:issueId/documents/:key`, and its `href` points at
 * `/…/issues/<ID>#document-<key>`.
 */
export type ArtifactPrintSource =
  | { kind: "file"; url: string }
  | { kind: "document"; issueId: string; documentKey: string }
  | { kind: "none" };

const DOCUMENT_HREF_MARKER = "#document-";

export function resolvePrintSource(
  artifact: Pick<CompanyArtifact, "contentPath" | "openPath" | "downloadPath" | "href" | "issue">,
): ArtifactPrintSource {
  const fileUrl = artifact.openPath ?? artifact.contentPath ?? artifact.downloadPath;
  if (fileUrl) return { kind: "file", url: fileUrl };

  const href = artifact.href ?? "";
  const markerIndex = href.indexOf(DOCUMENT_HREF_MARKER);
  if (markerIndex >= 0 && artifact.issue?.id) {
    const documentKey = href.slice(markerIndex + DOCUMENT_HREF_MARKER.length);
    if (documentKey) return { kind: "document", issueId: artifact.issue.id, documentKey };
  }

  return { kind: "none" };
}

const PRINT_STYLES = [
  "html,body{background:#fff;color:#111;margin:0}",
  "body{padding:14mm 16mm;font:15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}",
  "h1{font-size:21px;margin:0 0 10px}h2{font-size:18px;margin:18px 0 8px}h3{font-size:16px;margin:16px 0 6px}",
  "h4,h5,h6{font-size:15px;margin:14px 0 6px}h1,h2,h3{break-after:avoid-page}",
  "p,li{margin:0 0 8px}ul,ol{margin:0 0 10px 20px}hr{border:0;border-top:1px solid #bbb;margin:14px 0}",
  "code{font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;background:#f3f3f3;padding:1px 3px;border-radius:3px}",
  "pre{font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-wrap:break-word;",
  "background:#f7f7f7;border:1px solid #ddd;border-radius:4px;padding:8px;margin:0 0 10px;break-inside:avoid-page}",
  "pre.tbl{background:#fff;border:0;padding:0;font-size:11.5px}",
  "blockquote{margin:0 0 10px;padding-left:10px;border-left:3px solid #ccc;color:#333}",
  "a{color:#111}img{max-width:100%}",
].join("");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * Deliberately small Markdown subset renderer for printing issue documents:
 * headings, lists, blockquotes, fenced code, tables (as fixed-width blocks),
 * horizontal rules, paragraphs and inline code / emphasis / links. Printing a
 * document should never depend on the app shell being laid out for paper.
 */
export function documentMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let inCode = false;
  let listTag: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^```/.test(line.trim())) {
      closeList();
      out.push(inCode ? "</pre>" : "<pre>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (/^\|/.test(line.trim())) {
      closeList();
      const rows: string[] = [];
      while (index < lines.length && /^\|/.test(lines[index].trim())) {
        rows.push(escapeHtml(lines[index].trim()));
        index += 1;
      }
      index -= 1;
      out.push(`<pre class="tbl">${rows.join("\n")}</pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
      closeList();
      out.push("<hr>");
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const tag = bullet ? "ul" : "ol";
      if (listTag !== tag) {
        closeList();
        out.push(`<${tag}>`);
        listTag = tag;
      }
      out.push(`<li>${renderInline((bullet ?? numbered)![1])}</li>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    closeList();
    out.push(`<p>${renderInline(line)}</p>`);
  }

  if (inCode) out.push("</pre>");
  closeList();
  return out.join("\n");
}

async function fetchDocumentMarkdown(issueId: string, documentKey: string): Promise<string> {
  const response = await fetch(
    `/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(documentKey)}`,
    { credentials: "same-origin", headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`Document request failed with ${response.status}`);
  const payload = (await response.json()) as {
    body?: string;
    content?: string;
    document?: { body?: string };
  };
  return payload.body ?? payload.content ?? payload.document?.body ?? "";
}

function writePrintableShell(target: Window, title: string, bodyHtml: string): void {
  const documentRef = target.document;
  documentRef.open();
  documentRef.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${PRINT_STYLES}</style></head><body>${bodyHtml}</body></html>`,
  );
  documentRef.close();
}

function printWhenReady(target: Window): void {
  window.setTimeout(() => {
    try {
      target.focus();
      target.print();
    } catch {
      // The tab is open with the artifact in it; the user can print it directly.
    }
  }, 450);
}

/**
 * Print a single artifact, without the app shell around it.
 *
 * Opened as a top-level tab on purpose: a PDF inside a frame prints as blank
 * pages, an off-screen frame is not reliably painted, and `/api/attachments/…`
 * serves HTML artifacts as `Content-Disposition: attachment` so pointing a frame
 * at the URL would download instead of render. The tab must be opened while the
 * click is still being handled, otherwise popup blockers drop it.
 */
export function printArtifact(artifact: CompanyArtifact): void {
  const target = window.open("", "_blank");
  if (!target) {
    const fallback = artifact.openPath ?? artifact.contentPath ?? artifact.downloadPath ?? artifact.href;
    if (fallback) window.open(fallback, "_blank");
    return;
  }

  const source = resolvePrintSource(artifact);

  if (source.kind === "document") {
    fetchDocumentMarkdown(source.issueId, source.documentKey)
      .then((markdown) => {
        writePrintableShell(target, artifact.title, documentMarkdownToHtml(markdown));
        printWhenReady(target);
      })
      .catch(() => {
        writePrintableShell(
          target,
          artifact.title,
          `<h1>${escapeHtml(artifact.title)}</h1><p>This document could not be loaded for printing. Open it on ${escapeHtml(artifact.issue?.identifier ?? "the issue")} instead.</p>`,
        );
        printWhenReady(target);
      });
    return;
  }

  if (source.kind === "none") {
    target.close();
    return;
  }

  fetch(source.url, { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(`Artifact request failed with ${response.status}`);
      return response.blob();
    })
    .then((blob) => {
      const type = (blob.type || "").toLowerCase();
      if (type.includes("html") || type.includes("pdf") || type.startsWith("image/")) {
        const objectUrl = URL.createObjectURL(blob);
        target.addEventListener(
          "load",
          () => {
            printWhenReady(target);
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
          },
          { once: true },
        );
        target.location.replace(objectUrl);
        return;
      }
      blob.text().then((text) => {
        writePrintableShell(target, artifact.title, `<pre>${escapeHtml(text)}</pre>`);
        printWhenReady(target);
      });
    })
    .catch(() => {
      try {
        target.location.replace(source.url);
      } catch {
        window.open(source.url, "_blank");
      }
    });
}
