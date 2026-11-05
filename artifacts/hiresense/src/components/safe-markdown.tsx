import type { ReactNode } from 'react';

/**
 * Renders a small Markdown subset (headings, paragraphs, bullet and numbered
 * lists, bold, italic, inline code) as React text nodes only. No HTML is
 * interpreted and links are shown as their plain label, never as anchors.
 * The original text is not modified; only the display is structured.
 */
type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => { if (para.length) blocks.push({ kind: 'p', text: para.join(' ') }); para = []; };
  const flushList = () => { if (list) blocks.push(list); list = null; };
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line) || /^```/.test(line)) { flushPara(); flushList(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); blocks.push({ kind: 'h', level: h[1].length, text: h[2].replace(/\s*#+\s*$/, '') }); continue; }
    const ul = /^[-*+•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (!list || list.kind !== kind) { flushList(); list = { kind, items: [] }; }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flushList();
    para.push(line.replace(/^>\s?/, ''));
  }
  flushPara(); flushList();
  return blocks;
}

function inline(text: string, key: string): ReactNode[] {
  // Links -> label only; images -> alt text only.
  const t = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<\/?[a-zA-Z][^>]*>/g, '');
  const out: ReactNode[] = [];
  const re = /(\*\*|__)(.+?)\1|`([^`]+)`|(\*|_)([^*_\s][^*_]*?)\4/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={`${key}-${i++}`} className="font-semibold text-foreground">{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<code key={`${key}-${i++}`} className="rounded bg-muted px-1 font-mono text-[0.9em]">{m[3]}</code>);
    else out.push(<em key={`${key}-${i++}`}>{m[5]}</em>);
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

export function SafeMarkdown({ text, className = '', testId }: { text: string; className?: string; testId?: string }) {
  const blocks = parse(text);
  return (
    <div className={`space-y-3 break-words text-sm leading-relaxed ${className}`} data-testid={testId}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.kind === 'h') {
          return b.level <= 2
            ? <h3 key={k} className="font-display text-lg text-foreground pt-1">{inline(b.text, k)}</h3>
            : <h4 key={k} className="text-sm font-semibold text-foreground pt-1">{inline(b.text, k)}</h4>;
        }
        if (b.kind === 'p') return <p key={k}>{inline(b.text, k)}</p>;
        const List = b.kind === 'ul' ? 'ul' : 'ol';
        return (
          <List key={k} className={`${b.kind === 'ul' ? 'list-disc' : 'list-decimal'} space-y-1.5 pl-5 marker:text-accent-foreground`}>
            {b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}
          </List>
        );
      })}
    </div>
  );
}
