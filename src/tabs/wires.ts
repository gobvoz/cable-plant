import { S, set } from '../state';
import { esc, colorSwatch } from '../utils';
import { wireBySchema, deviceBySchema, getAssembly } from '../db';

export function tabWires(schemaId: string): string {
  const wires = wireBySchema(schemaId);
  const asm = getAssembly(schemaId);
  const doneSet = new Set(asm?.done ?? []);
  const wireQ = (S.wireQ || '').trim().toLowerCase();

  const comparePages = (a: string, b: string): number => {
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  };

  // All unique pages (for chips), sorted naturally; empty page last
  const allPages = [...new Set(wires.map(w => w.page || ''))].sort(comparePages);

  // Apply page chip filter first, then text search
  const pageFiltered =
    S.wirePage != null ? wires.filter(w => (w.page || '') === S.wirePage) : wires;

  const filtered = wireQ
    ? pageFiltered.filter(
        w =>
          w.wireRef.toLowerCase().includes(wireQ) ||
          w.wireNum.toLowerCase().includes(wireQ) ||
          (w.color || '').toLowerCase().includes(wireQ) ||
          (w.contract || '').toLowerCase().includes(wireQ) ||
          (w.ends || []).some(e => e.code.toLowerCase().includes(wireQ)),
      )
    : pageFiltered;

  const devMap = Object.fromEntries(deviceBySchema(schemaId).map(d => [d.code, d]));

  const isActive = asm?.active === true;

  /* ── Assembly controls bar ────────────────────────────────────────── */
  const asmBar = /* html */ `
<div class="asm-bar">
  ${
    !asm
      ? `<button class="asm-btn asm-start" title="Start assembly"
           onclick="startAssemblyAction('${schemaId}')">&#9654;</button>
         <span class="asm-label">Start assembly</span>`
      : isActive
        ? `<span class="asm-progress">${doneSet.size}&thinsp;/&thinsp;${wires.length} assembled</span>
           <div class="ml-auto" style="display:flex;gap:6px">
             <button class="asm-btn asm-reset" title="Reset marks"
               onclick="resetAssemblyAction('${schemaId}')">&#8635;</button>
             <button class="asm-btn asm-stop" title="End assembly"
               onclick="stopAssemblyAction('${schemaId}')">&#9632;</button>
           </div>`
        : `<span class="asm-progress">${doneSet.size}&thinsp;/&thinsp;${wires.length} assembled</span>
           <div class="ml-auto" style="display:flex;gap:6px">
             <button class="asm-btn asm-reset" title="Reset marks"
               onclick="resetAssemblyAction('${schemaId}')">&#8635;</button>
             <button class="asm-btn asm-start" title="Resume assembly"
               onclick="startAssemblyAction('${schemaId}')">&#9654;</button>
           </div>`
  }
</div>`;

  /* ── Page chips ─────────────────────────────────────────────── */
  const namedPages = allPages.filter(p => p !== '');
  const pageChips =
    namedPages.length >= 1
      ? /* html */ `<div class="type-chips mb8">
  ${namedPages.length > 1 ? `<button class="type-chip${S.wirePage == null ? ' active' : ''}" onclick="set({wirePage:null})">All</button>` : ''}
  ${namedPages
    .map(
      p =>
        `<button class="type-chip${S.wirePage === p ? ' active' : ''}" onclick="set({wirePage:'${esc(p)}'})">&#128196;&nbsp;${esc(p)}</button>`,
    )
    .join('')}
</div>`
      : '';

  /* ── Search bar ─────────────────────────────────────────────── */
  const searchBar = /* html */ `
<div class="search-wrap">
  <span class="search-lead">&#128299;</span>
  <input id="wire-q" class="search-input" type="search" value="${esc(S.wireQ)}"
    placeholder="Wire ref, color, contract or device\u2026"
    oninput="set({wireQ:this.value})"
    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
  ${S.wireQ ? `<button class="search-clear" onclick="set({wireQ:''})">&#215;</button>` : ''}
</div>`;

  if (wires.length === 0)
    return `${asmBar}${searchBar}<div class="empty"><div class="empty-icon">&#128299;</div><div>No wires imported yet</div><div class="txt-sm txt-muted mt8">Use &#128229; to import a document</div></div>`;

  if (filtered.length === 0)
    return `${asmBar}${pageChips}${searchBar}<div class="empty"><div class="empty-icon">&#128270;</div><div>No results for "${esc(S.wireQ || S.wirePage || '')}"</div></div>`;

  /* ── Group by page, sort within each group by pageOrder ──────── */
  const pageGroups: Map<string, typeof filtered> = new Map();
  for (const w of filtered) {
    const p = w.page || '';
    if (!pageGroups.has(p)) pageGroups.set(p, []);
    pageGroups.get(p)!.push(w);
  }
  // Sort each group strictly by original document order from imported JSON page.
  for (const group of pageGroups.values()) {
    group.sort((a, b) => {
      const aDetailed = (a.ends || []).length > 0;
      const bDetailed = (b.ends || []).length > 0;
      if (aDetailed !== bDetailed) return aDetailed ? -1 : 1;

      const pageOrderCmp = (a.pageOrder ?? 0) - (b.pageOrder ?? 0);
      if (pageOrderCmp !== 0) return pageOrderCmp;

      return a.wireRef.localeCompare(b.wireRef, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }
  // Sort pages naturally; empty page last
  const sortedPages = [...pageGroups.keys()].sort(comparePages);

  const renderWireCard = (w: ReturnType<typeof wireBySchema>[number]) => {
    const ends = w.ends || [];
    const isDone = doneSet.has(w.id);
    // In assembly mode: card click = toggle done; device row click = open modal (stops propagation)
    const cardClick = isActive
      ? `onclick="toggleWireDoneAction('${schemaId}','${w.id}')" style="cursor:pointer"`
      : '';
    return /* html */ `
<div class="config-card wire-card${isDone ? ' wire-done' : ''}" ${cardClick}>
  <div class="wire-card-hdr">
    <div>
      <span class="wire-ref">${esc(w.wireRef)}</span>
      ${w.color ? colorSwatch(w.color) : ''}
      ${w.contract ? `<span class="txt-sm txt-muted">&nbsp;&middot;&nbsp;Cntr.&nbsp;${esc(w.contract)}</span>` : ''}
    </div>
    ${isDone ? `<span class="asm-done-badge">&#10003;</span>` : ''}
  </div>
  ${
    ends.length > 0
      ? `<div class="wire-ends">
    ${ends
      .map(e => {
        const dev = devMap[e.code];
        const pos = dev?.subtable ? `${dev.subtable}-${dev.section} ${dev.side}` : null;
        // Always open modal on device row click; stopPropagation prevents card toggle in asm mode
        const rowClick = dev?.id
          ? `onclick="event.stopPropagation();openModal('${dev.id}')"`
          : `onclick="event.stopPropagation()"`;
        return /* html */ `
    <div class="wire-end-row" ${rowClick}>
      <span class="wire-dev">${esc(e.code)}</span>
      ${e.pos ? `<span class="wire-pin-lbl">pin&nbsp;${esc(e.pos)}</span>` : ''}
      ${pos ? `<span class="pos-badge haut sm ml-auto">${pos}</span>` : '<span class="pos-badge unknown sm ml-auto">?</span>'}
    </div>`;
      })
      .join('')}
  </div>`
      : ''
  }
</div>`;
  };

  const groupsHtml = sortedPages
    .map(page => {
      const group = pageGroups.get(page)!;
      const pageHeader = page ? `<div class="wire-page-hdr">&#128196;&nbsp;${esc(page)}</div>` : '';
      return `${pageHeader}${group.map(renderWireCard).join('')}`;
    })
    .join('');

  return `${asmBar}${pageChips}${searchBar}${groupsHtml}`;
}

// Suppress unused-import warning
void set;
