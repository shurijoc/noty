/**
 * Parse Markdown into Notion Block objects (line-based parser).
 */

/**
 * Notion's code block `language` property only accepts a fixed enum
 * (see the Notion API error for the full list). Common fence tags that are
 * NOT in that enum map to the closest valid value; anything unrecognized
 * falls back to "plain text" so page creation never fails on this field.
 */
const NOTION_CODE_LANGUAGE_ALIASES: Record<string, string> = {
  text: "plain text",
  txt: "plain text",
  plaintext: "plain text",
  sh: "shell",
  zsh: "shell",
  js: "javascript",
  ts: "typescript",
  jsx: "javascript",
  tsx: "typescript",
  py: "python",
  yml: "yaml",
  md: "markdown",
  "objective-c": "objective-c",
  cpp: "c++",
  cs: "c#",
};

const NOTION_VALID_CODE_LANGUAGES = new Set([
  "abap", "abc", "agda", "arduino", "ascii art", "assembly", "bash", "basic",
  "bnf", "c", "c#", "c++", "clojure", "coffeescript", "coq", "css", "dart",
  "dhall", "diff", "docker", "ebnf", "elixir", "elm", "erlang", "f#", "flow",
  "fortran", "gherkin", "glsl", "go", "graphql", "groovy", "haskell", "hcl",
  "html", "idris", "java", "javascript", "json", "julia", "kotlin", "latex",
  "less", "lisp", "livescript", "llvm ir", "lua", "makefile", "markdown",
  "markup", "matlab", "mathematica", "mermaid", "nix", "notion formula",
  "objective-c", "ocaml", "pascal", "perl", "php", "plain text", "powershell",
  "prolog", "protobuf", "purescript", "python", "r", "racket", "reason",
  "ruby", "rust", "sass", "scala", "scheme", "scss", "shell", "smalltalk",
  "solidity", "sql", "swift", "toml", "typescript", "vb.net", "verilog",
  "vhdl", "visual basic", "webassembly", "xml", "yaml", "java/c/c++/c#",
]);

/** Map an arbitrary fenced-code-block language tag to a Notion-valid one. */
export function normalizeNotionCodeLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase();
  if (NOTION_VALID_CODE_LANGUAGES.has(normalized)) return normalized;
  if (NOTION_CODE_LANGUAGE_ALIASES[normalized]) {
    return NOTION_CODE_LANGUAGE_ALIASES[normalized];
  }
  return "plain text";
}

type RichTextObject = {
  type: "text";
  text: { content: string; link?: { url: string } | null };
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
  };
};

type NotionBlock = {
  object: "block";
  type: string;
  [key: string]: unknown;
};

const DEFAULT_ANNOTATIONS = {
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  code: false,
};

function parseInlineFormatting(text: string): RichTextObject[] {
  const results: RichTextObject[] = [];

  // Regex to match markdown inline formatting
  // Order matters: bare URLs first, then markdown links, then formatting
  // Group 1: bare URL (https?://...)
  // Group 2: [text](url) link — Group 3: text, Group 4: url
  // Group 5: `code` — Group 6: content
  // Group 7: ***bold+italic*** — Group 8: content
  // Group 9: **bold** — Group 10: content
  // Group 11: *italic* — Group 12: content
  // Group 13: ~~strikethrough~~ — Group 14: content
  const pattern =
    /(https?:\/\/[^\s\)\]>]+)|(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)|(\*\*\*([^*]+)\*\*\*)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\~\~([^~]+)\~\~)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain) {
        results.push({
          type: "text",
          text: { content: plain },
          annotations: { ...DEFAULT_ANNOTATIONS },
        });
      }
    }

    if (match[1]) {
      // Bare URL: https://...
      results.push({
        type: "text",
        text: { content: match[1], link: { url: match[1] } },
        annotations: { ...DEFAULT_ANNOTATIONS },
      });
    } else if (match[2]) {
      // Link: [text](url)
      results.push({
        type: "text",
        text: { content: match[3], link: { url: match[4] } },
        annotations: { ...DEFAULT_ANNOTATIONS },
      });
    } else if (match[5]) {
      // Code: `text`
      results.push({
        type: "text",
        text: { content: match[6] },
        annotations: { ...DEFAULT_ANNOTATIONS, code: true },
      });
    } else if (match[7]) {
      // Bold+Italic: ***text***
      results.push({
        type: "text",
        text: { content: match[8] },
        annotations: { ...DEFAULT_ANNOTATIONS, bold: true, italic: true },
      });
    } else if (match[9]) {
      // Bold: **text**
      results.push({
        type: "text",
        text: { content: match[10] },
        annotations: { ...DEFAULT_ANNOTATIONS, bold: true },
      });
    } else if (match[11]) {
      // Italic: *text*
      results.push({
        type: "text",
        text: { content: match[12] },
        annotations: { ...DEFAULT_ANNOTATIONS, italic: true },
      });
    } else if (match[13]) {
      // Strikethrough: ~~text~~
      results.push({
        type: "text",
        text: { content: match[14] },
        annotations: { ...DEFAULT_ANNOTATIONS, strikethrough: true },
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      results.push({
        type: "text",
        text: { content: remaining },
        annotations: { ...DEFAULT_ANNOTATIONS },
      });
    }
  }

  // If no matches at all, return the whole text as plain
  if (results.length === 0 && text) {
    results.push({
      type: "text",
      text: { content: text },
      annotations: { ...DEFAULT_ANNOTATIONS },
    });
  }

  return results;
}

function makeRichText(text: string): RichTextObject[] {
  return parseInlineFormatting(text);
}

/** セパレーター行（| --- | :---: | など）かどうか判定 */
function isTableSeparator(line: string): boolean {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|");
  return cells.every((cell) => /^[\s\-:]+$/.test(cell));
}

/** テーブル行をパースしてセル文字列の配列を返す */
function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** テーブル行の配列から Notion table ブロックを生成 */
function buildTableBlock(tableLines: string[]): NotionBlock {
  const dataLines = tableLines.filter((l) => !isTableSeparator(l));
  const tableWidth = parseTableRow(dataLines[0]).length;

  const children = dataLines.map((line) => {
    const cells = parseTableRow(line);
    return {
      object: "block" as const,
      type: "table_row",
      table_row: {
        cells: cells.map((cell) => makeRichText(cell)),
      },
    };
  });

  return {
    object: "block",
    type: "table",
    table: {
      table_width: tableWidth,
      has_column_header: true,
      has_row_header: false,
      children,
    },
  };
}

export function markdownToBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.split("\n");
  const blocks: NotionBlock[] = [];
  let i = 0;

  /** テーブル行を収集して確定する */
  function flushTable(tableLines: string[]): void {
    if (tableLines.length > 0) {
      blocks.push(buildTableBlock(tableLines));
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Table row
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      flushTable(tableLines);
      continue;
    }

    // Fenced code block
    const codeMatch = line.match(/^```(\w*)$/);
    if (codeMatch) {
      const lang = normalizeNotionCodeLanguage(codeMatch[1] || "plain text");
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        object: "block",
        type: "code",
        code: {
          rich_text: [
            {
              type: "text",
              text: { content: codeLines.join("\n") },
              annotations: { ...DEFAULT_ANNOTATIONS },
            },
          ],
          language: lang,
        },
      });
      continue;
    }

    // Divider
    if (/^---+$/.test(line.trim())) {
      blocks.push({ object: "block", type: "divider", divider: {} });
      i++;
      continue;
    }

    // Headings
    const h1Match = line.match(/^# (.+)$/);
    if (h1Match) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: makeRichText(h1Match[1]) },
      });
      i++;
      continue;
    }

    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: makeRichText(h2Match[1]) },
      });
      i++;
      continue;
    }

    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: makeRichText(h3Match[1]) },
      });
      i++;
      continue;
    }

    // Bulleted list
    const bulletMatch = line.match(/^[-*] (.+)$/);
    if (bulletMatch) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: makeRichText(bulletMatch[1]) },
      });
      i++;
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^\d+\. (.+)$/);
    if (numMatch) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: makeRichText(numMatch[1]) },
      });
      i++;
      continue;
    }

    // Quote
    const quoteMatch = line.match(/^> (.+)$/);
    if (quoteMatch) {
      blocks.push({
        object: "block",
        type: "quote",
        quote: { rich_text: makeRichText(quoteMatch[1]) },
      });
      i++;
      continue;
    }

    // Empty line → skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (default)
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: makeRichText(line) },
    });
    i++;
  }

  return blocks;
}
