import { describe, it, expect } from "vitest";
import {
  markdownToBlocks,
  normalizeNotionCodeLanguage,
  isLikelyValidLinkUrl,
} from "../markdown-to-blocks.js";

describe("markdownToBlocks", () => {
  it("converts heading 1", () => {
    const blocks = markdownToBlocks("# Title");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("heading_1");
  });

  it("converts heading 2", () => {
    const blocks = markdownToBlocks("## Subtitle");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("heading_2");
  });

  it("converts heading 3", () => {
    const blocks = markdownToBlocks("### Section");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("heading_3");
  });

  it("converts bulleted list", () => {
    const blocks = markdownToBlocks("- Item 1\n- Item 2");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("bulleted_list_item");
    expect(blocks[1].type).toBe("bulleted_list_item");
  });

  it("converts numbered list", () => {
    const blocks = markdownToBlocks("1. First\n2. Second");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("numbered_list_item");
    expect(blocks[1].type).toBe("numbered_list_item");
  });

  it("converts code block", () => {
    const blocks = markdownToBlocks("```typescript\nconst x = 1;\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code");
    const code = blocks[0].code as any;
    expect(code.language).toBe("typescript");
    expect(code.rich_text[0].text.content).toBe("const x = 1;");
  });

  it("maps a non-Notion code fence language to a valid enum value (text -> plain text)", () => {
    // Notion's code block `language` is a fixed enum; "text" is not a member
    // of it (the API rejects page creation otherwise).
    const blocks = markdownToBlocks("```text\nhello\n```");
    const code = blocks[0].code as any;
    expect(code.language).toBe("plain text");
  });

  it("normalizeNotionCodeLanguage maps common aliases and falls back for unknowns", () => {
    expect(normalizeNotionCodeLanguage("text")).toBe("plain text");
    expect(normalizeNotionCodeLanguage("sh")).toBe("shell");
    expect(normalizeNotionCodeLanguage("TypeScript")).toBe("typescript");
    expect(normalizeNotionCodeLanguage("bash")).toBe("bash");
    expect(normalizeNotionCodeLanguage("not-a-real-language")).toBe("plain text");
  });

  it("converts divider", () => {
    const blocks = markdownToBlocks("---");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("divider");
  });

  it("converts quote", () => {
    const blocks = markdownToBlocks("> Quoted text");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("quote");
  });

  it("converts paragraph (default)", () => {
    const blocks = markdownToBlocks("Just some text");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
  });

  it("skips empty lines", () => {
    const blocks = markdownToBlocks("Line 1\n\nLine 2");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[1].type).toBe("paragraph");
  });

  it("handles bold inline formatting", () => {
    const blocks = markdownToBlocks("This is **bold** text");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    const boldPart = richText.find((rt: any) => rt.annotations.bold);
    expect(boldPart).toBeDefined();
    expect(boldPart.text.content).toBe("bold");
  });

  it("handles italic inline formatting", () => {
    const blocks = markdownToBlocks("This is *italic* text");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    const italicPart = richText.find((rt: any) => rt.annotations.italic);
    expect(italicPart).toBeDefined();
    expect(italicPart.text.content).toBe("italic");
  });

  it("handles code inline formatting", () => {
    const blocks = markdownToBlocks("Use `code` here");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    const codePart = richText.find((rt: any) => rt.annotations.code);
    expect(codePart).toBeDefined();
    expect(codePart.text.content).toBe("code");
  });

  it("handles links", () => {
    const blocks = markdownToBlocks("Click [here](https://example.com)");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    const linkPart = richText.find((rt: any) => rt.text.link);
    expect(linkPart).toBeDefined();
    expect(linkPart.text.link.url).toBe("https://example.com");
  });

  it("renders [text](url) as plain text when url is not an actual URL (e.g. a template placeholder)", () => {
    // Notion rejects pages.create/update with "Invalid URL for link." if the
    // url isn't a real absolute URL.
    const blocks = markdownToBlocks("[元のSlackスレッド]({SlackスレッドURL})");
    const richText = (blocks[0].paragraph as any).rich_text;
    expect(richText.some((rt: any) => rt.text.link)).toBe(false);
    expect(richText[0].text.content).toBe("元のSlackスレッド（{SlackスレッドURL}）");
  });

  it("isLikelyValidLinkUrl accepts http(s)/mailto and rejects placeholders", () => {
    expect(isLikelyValidLinkUrl("https://example.com")).toBe(true);
    expect(isLikelyValidLinkUrl("http://example.com")).toBe(true);
    expect(isLikelyValidLinkUrl("mailto:a@example.com")).toBe(true);
    expect(isLikelyValidLinkUrl("{SlackスレッドURL}")).toBe(false);
    expect(isLikelyValidLinkUrl("see below")).toBe(false);
  });

  it("handles strikethrough inline formatting", () => {
    const blocks = markdownToBlocks("This is ~~deleted~~ text");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    const strikePart = richText.find((rt: any) => rt.annotations.strikethrough);
    expect(strikePart).toBeDefined();
    expect(strikePart.text.content).toBe("deleted");
  });

  it("handles bold+italic inline formatting", () => {
    const blocks = markdownToBlocks("This is ***important*** text");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    const part = richText.find(
      (rt: any) => rt.annotations.bold && rt.annotations.italic,
    );
    expect(part).toBeDefined();
    expect(part.text.content).toBe("important");
  });

  it("handles multiple inline formats in one line", () => {
    const blocks = markdownToBlocks("**bold** and *italic* and `code`");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    expect(richText.find((rt: any) => rt.annotations.bold)).toBeDefined();
    expect(richText.find((rt: any) => rt.annotations.italic)).toBeDefined();
    expect(richText.find((rt: any) => rt.annotations.code)).toBeDefined();
  });

  it("converts code block without language", () => {
    const blocks = markdownToBlocks("```\nsome code\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code");
    const code = blocks[0].code as any;
    expect(code.language).toBe("plain text");
    expect(code.rich_text[0].text.content).toBe("some code");
  });

  it("converts bullet list with * marker", () => {
    const blocks = markdownToBlocks("* Item A\n* Item B");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("bulleted_list_item");
  });

  it("handles empty input", () => {
    const blocks = markdownToBlocks("");
    expect(blocks).toHaveLength(0);
  });

  it("handles complex document", () => {
    const md = `# Title

Some paragraph.

## Section

- Item 1
- Item 2

\`\`\`js
console.log("hello");
\`\`\`

---

> A quote`;

    const blocks = markdownToBlocks(md);
    const types = blocks.map((b) => b.type);
    expect(types).toEqual([
      "heading_1",
      "paragraph",
      "heading_2",
      "bulleted_list_item",
      "bulleted_list_item",
      "code",
      "divider",
      "quote",
    ]);
  });

  // 裸URL変換テスト
  it("裸URLがtext.link.urlを持つrich_textに変換される", () => {
    const blocks = markdownToBlocks("https://example.com");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    const linkPart = richText.find((rt: any) => rt.text.link);
    expect(linkPart).toBeDefined();
    expect(linkPart.text.link.url).toBe("https://example.com");
  });

  it("裸URLのテキスト内容がURL自体になる", () => {
    const blocks = markdownToBlocks("https://example.com");
    const richText = (blocks[0].paragraph as any).rich_text;
    const linkPart = richText.find((rt: any) => rt.text.link);
    expect(linkPart.text.content).toBe("https://example.com");
  });

  it("文中の裸URLが前後のテキストと正しく分割される", () => {
    const blocks = markdownToBlocks("詳細は https://example.com を参照");
    expect(blocks).toHaveLength(1);
    const richText = (blocks[0].paragraph as any).rich_text;
    expect(richText.length).toBeGreaterThanOrEqual(2);
    const linkPart = richText.find((rt: any) => rt.text.link);
    expect(linkPart).toBeDefined();
    expect(linkPart.text.link.url).toBe("https://example.com");
    const plainParts = richText.filter((rt: any) => !rt.text.link);
    const allPlainText = plainParts.map((rt: any) => rt.text.content).join("");
    expect(allPlainText).toContain("詳細は ");
  });

  // Markdownテーブル変換テスト
  it("Markdownテーブルがtableブロックに変換される", () => {
    const md = `| 名前 | 年齢 |
| --- | --- |
| Alice | 30 |
| Bob | 25 |`;
    const blocks = markdownToBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");
  });

  it("tableのhas_column_headerがtrueになる", () => {
    const md = `| 名前 | 年齢 |
| --- | --- |
| Alice | 30 |`;
    const blocks = markdownToBlocks(md);
    const table = blocks[0].table as any;
    expect(table.has_column_header).toBe(true);
  });

  it("tableのtable_widthが列数と一致する", () => {
    const md = `| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |`;
    const blocks = markdownToBlocks(md);
    const table = blocks[0].table as any;
    expect(table.table_width).toBe(3);
  });

  it("table_rowのcellsが正しいセル内容になる", () => {
    const md = `| 名前 | 年齢 |
| --- | --- |
| Alice | 30 |`;
    const blocks = markdownToBlocks(md);
    // Notion API 仕様: table_row は table プロパティ内の children に入る
    const children = (blocks[0].table as any).children as any[];
    // ヘッダー行 + データ行 = 2行
    expect(children).toHaveLength(2);
    const headerRow = children[0].table_row;
    expect(headerRow.cells[0][0].text.content).toBe("名前");
    expect(headerRow.cells[1][0].text.content).toBe("年齢");
    const dataRow = children[1].table_row;
    expect(dataRow.cells[0][0].text.content).toBe("Alice");
    expect(dataRow.cells[1][0].text.content).toBe("30");
  });

  it("区切り行（| --- |）がテーブルに含まれない", () => {
    const md = `| A | B |
| --- | --- |
| 1 | 2 |
| 3 | 4 |`;
    const blocks = markdownToBlocks(md);
    // Notion API 仕様: table_row は table プロパティ内の children に入る
    const children = (blocks[0].table as any).children as any[];
    // ヘッダー行 + データ2行 = 3行（区切り行は含まない）
    expect(children).toHaveLength(3);
  });

  it("テーブルの前後のブロックが維持される", () => {
    const md = `## セクション

| A | B |
| --- | --- |
| 1 | 2 |

末尾の段落`;
    const blocks = markdownToBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("heading_2");
    expect(blocks[1].type).toBe("table");
    expect(blocks[2].type).toBe("paragraph");
  });
});
