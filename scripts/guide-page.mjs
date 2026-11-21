// 문서(마크다운) 한 장을 폰에서 읽는 웹 화면 한 장으로 바꾼다. 바깥 패키지를 쓰지 않는다.
// 쓰는 법: node scripts/guide-page.mjs docs/테스터_안내.md dist/testers/index.html
// 아는 꼴: 머리(--- … ---)는 건너뛴다 · # ## ### · 문단 · - 목록 · 1. 목록 · 표 · ``` 글 상자(복사 단추가 붙는다) · `글` · **굵게** · [글](주소).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 줄 안의 꼴. 먼저 글자를 안전하게 바꾸고 그 위에 꼴을 입힌다. 주소는 https와 같은 자리(./ ../ #)만 받는다.
export function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(((?:https:\/\/|\.\.?\/|#)[^)\s]*)\)/g, (m, label, href) => `<a href="${href}"${href.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`);
}

export function toHtml(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  let i = 0;
  if (lines[0] === '---') { i = lines.indexOf('---', 1) + 1; }
  const out = [];
  let title = '';
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (line.startsWith('```')) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { body.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<div class="copybox"><pre>${esc(body.join('\n'))}</pre><button class="btn" type="button" data-copy>이 글 복사</button><p class="note" role="status"></p></div>`);
      continue;
    }
    const head = line.match(/^(#{1,3}) (.+)$/);
    if (head) {
      const level = head[1].length;
      if (level === 1 && !title) title = head[2];
      out.push(`<h${level}>${inline(head[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.startsWith('|') && /^\|[\s:|-]+\|$/.test((lines[i + 1] || '').trim())) {
      const headCells = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(cells(lines[i])); i += 1; }
      out.push(`<div class="tablebox"><table><thead><tr>${headCells.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const bullet = /^- (.+)$/;
    const numbered = /^\d+\. (.+)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const re = bullet.test(line) ? bullet : numbered;
      const tag = re === bullet ? 'ul' : 'ol';
      const items = [];
      while (i < lines.length && re.test(lines[i])) { items.push(lines[i].match(re)[1]); i += 1; }
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |- |\d+\. |```|\|)/.test(lines[i])) { para.push(lines[i]); i += 1; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return { title, body: out.join('\n') };
}

// 화면 한 장. 앱의 모양(../app.css)을 같이 쓴다. 복사 단추는 글 상자의 글을 그대로 복사한다.
export function page({ title, body }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · 글로벌 어학연수 (비공식)</title>
<link rel="stylesheet" href="../app.css">
<style>
main { max-width: 720px; margin: 0 auto; padding: 16px 12px 48px; display: grid; gap: 12px; }
main h1 { font-size: 24px; line-height: 1.3; margin: 8px 4px 0; }
main h2 { font-size: 18px; margin: 16px 4px 0; }
main h3 { font-size: 16px; margin: 8px 4px 0; }
main p, main ul, main ol { margin: 0 4px; overflow-wrap: anywhere; }
main ul, main ol { padding-left: 22px; display: grid; gap: 6px; }
main code { background: var(--panel-2); border-radius: 6px; padding: 1px 6px; font-size: 0.92em; }
main a { color: var(--accent); }
.tablebox { overflow-x: auto; border-radius: 12px; background: var(--panel); }
.tablebox table { border-collapse: collapse; width: 100%; font-size: 14px; }
.tablebox th, .tablebox td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.tablebox th { color: var(--ink-2); white-space: nowrap; }
.tablebox td:first-child { white-space: nowrap; font-weight: 700; }
.copybox { display: grid; gap: 8px; padding: 12px; border-radius: 16px; background: var(--panel); }
.copybox pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body>
<main>
${body}
</main>
<script>
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const box = button.closest('.copybox');
    const note = box.querySelector('[role=status]');
    try { await navigator.clipboard.writeText(box.querySelector('pre').textContent); note.textContent = '복사했다. 단톡방에 붙여 넣고 고친다.'; }
    catch { note.textContent = '복사하지 못했다. 글을 길게 눌러 직접 복사한다.'; }
  });
}
</script>
</body>
</html>
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) { console.error('쓰는 법: node scripts/guide-page.mjs <문서.md> <나올 곳.html>'); process.exit(1); }
  const made = toHtml(await readFile(from, 'utf8'));
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, page(made));
  console.log(`${from} → ${to} ("${made.title}")`);
}
