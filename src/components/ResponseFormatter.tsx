'use client';

interface Props {
  content: string;
}

function formatResponse(text: string): string {
  let html = text;
  html = html.replace(/## (.*?)(\n|$)/g, '<h3>$1</h3>');
  html = html.replace(
    /### (.*?) \[(Easy|Medium|Hard)\] \[(\d+) marks?\]/gi,
    (_m, title, diff, marks) =>
      `<div style="margin:10px 0 4px"><strong>${title}</strong> <span class="badge ${diff.toLowerCase()}">${diff}</span> <span class="badge m">${marks} marks</span></div>`
  );
  html = html.replace(/### (.*?)(\n|$)/g, '<div style="font-weight:500;margin:8px 0 4px;color:var(--accent)">$1</div>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background:var(--faint);padding:1px 4px;border-radius:3px;font-family:\'DM Mono\',monospace;font-size:11px;color:var(--accent2)">$1</code>'
  );

  const lines = html.split('\n');
  let result = '';
  let inUl = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (inUl) { result += '</ul>'; inUl = false; }
      continue;
    }
    if (t.match(/^\d+\. /)) {
      if (inUl) { result += '</ul>'; inUl = false; }
      const num = t.match(/^(\d+)\./)![1];
      const rest = t.replace(/^\d+\. /, '');
      result += `<div class="step-row"><span class="step-num">${num}</span><span>${rest}</span></div>`;
    } else if (t.startsWith('- ') || t.startsWith('• ')) {
      if (!inUl) { result += '<ul>'; inUl = true; }
      result += '<li>' + t.replace(/^[-•] /, '') + '</li>';
    } else if (/^(Paper|Topic|Subtopic|Difficulty|Estimated Marks|Skills Tested|Common Cambridge Trap|Priority|Action|A\* Tip|M marks|A marks|B marks|Hint):/.test(t)) {
      if (inUl) { result += '</ul>'; inUl = false; }
      const colon = t.indexOf(':');
      const key = t.substring(0, colon);
      const val = t.substring(colon + 1).trim();
      let display = val;
      if (key === 'Difficulty') {
        const cls = val.toLowerCase().includes('hard') ? 'hard' : val.toLowerCase().includes('medium') ? 'medium' : 'easy';
        display = `<span class="badge ${cls}">${val}</span>`;
      } else if (key === 'M marks') display = `<span class="badge m">M</span> ${val}`;
      else if (key === 'A marks') display = `<span class="badge a">A</span> ${val}`;
      else if (key === 'B marks') display = `<span class="badge m" style="background:#f0fdf4;color:#166534;border-color:#86efac">B</span> ${val}`;
      else if (key === 'Hint') display = `<span style="color:var(--gold);font-style:italic;font-size:12px">${val}</span>`;
      else if (key === 'A* Tip') display = `<span style="background:var(--gold-bg);color:var(--gold);padding:2px 6px;border-radius:4px;font-weight:500">${val}</span>`;
      result += `<p><strong style="font-size:10px;font-family:'DM Mono',monospace;color:var(--muted)">${key}:</strong> ${display}</p>`;
    } else if (
      t.includes('=') &&
      (t.includes('^') || t.includes('int') || t.includes('dy/dx') || t.includes('sqrt') || t.includes('±') || t.includes('∫'))
    ) {
      if (inUl) { result += '</ul>'; inUl = false; }
      result += `<div class="math-block">${t}</div>`;
    } else {
      if (inUl) { result += '</ul>'; inUl = false; }
      result += `<p>${t}</p>`;
    }
  }
  if (inUl) result += '</ul>';
  return result;
}

export default function ResponseFormatter({ content }: Props) {
  return (
    <div dangerouslySetInnerHTML={{ __html: formatResponse(content) }} />
  );
}
