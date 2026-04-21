function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineFormat(s: string): string {
  s = s.replace(/`([^`]+)`/g, (_m, g1) => `<code>${g1}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?;:])/g, "$1<em>$2</em>");
  return s;
}

export function renderMarkdown(input: string): string {
  if (!input) return "";
  const escaped = escapeHtml(input);
  const lines = escaped.split(/\r?\n/);

  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length) {
      out.push(`<p>${inlineFormat(paragraphBuf.join(" "))}</p>`);
      paragraphBuf = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const ulMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (ulMatch) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }
    if (olMatch) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    paragraphBuf.push(line.trim());
  }

  flushParagraph();
  closeList();

  return out.join("\n");
}
