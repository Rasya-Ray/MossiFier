import type { ReactNode } from "react";

/**
 * Renderer markdown mini untuk balasan chatbot: **tebal**, `kode`, dan daftar
 * (- / * / 1.). Semua dirender sebagai node React (bukan HTML mentah), jadi aman
 * dari injeksi walau isi balasan berasal dari model.
 */

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-forest-mist">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

type Block =
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const kind = bullet ? "ul" : numbered ? "ol" : null;

    if (kind) {
      const text = (bullet ?? numbered)![1];
      const last = blocks.at(-1);
      if (last && last.type === kind) last.items.push(text);
      else blocks.push({ type: kind, items: [text] });
    } else {
      blocks.push({ type: "p", text: line.replace(/^#{1,6}\s+/, "") });
    }
  }
  return blocks;
}

export function ChatMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === "p") {
          return <p key={index}>{renderInline(block.text)}</p>;
        }
        const Tag = block.type;
        return (
          <Tag
            key={index}
            className={`space-y-1 pl-5 ${block.type === "ul" ? "list-disc" : "list-decimal"} marker:text-forest-lime`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
