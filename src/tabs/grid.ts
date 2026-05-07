import { esc } from '../utils';
import { posLabel, sideClass } from '../utils';
import type { Device, ViewCtx } from '../types';

export function tabGrid(kons: Device[], ctx: ViewCtx): string {
  // Lookup: "st-sec-side" → connectors
  const lkp: Record<string, Device[]> = {};
  for (const k of kons) {
    if (!k.subtable) continue;
    const key = `${k.subtable}-${k.section}-${k.side}`;
    (lkp[key] = lkp[key] || []).push(k);
  }
  const unloc = kons.filter(k => !k.subtable);
  const stCount = ctx.subtables || 5;

  let html = '<div class="plan-scroll">';
  for (let st = 1; st <= stCount; st++) {
    const cnt = kons.filter(k => k.subtable === st).length;
    html += `
<div class="st-block">
  <div class="st-title">Sub-table ${st} <span class="badge">${cnt}</span></div>
  <div class="plan-grid">
    <div class="pg-hdr">Section 1</div>
    <div class="pg-hdr">Section 2</div>
    <div class="pg-hdr">Section 3</div>
    <div class="pg-hdr">Section 4</div>`;
    for (const side of ['Haut', 'Bas']) {
      for (let sec = 1; sec <= 4; sec++) {
        const cell = lkp[`${st}-${sec}-${side}`] || [];
        html += `<div class="plan-cell"
  onclick="go('${ctx.formView}',{${ctx.idProp}:'${ctx.id}',${ctx.konIdProp}:null,prefill:{subtable:${st},section:${sec},side:'${side}'}})">
  <div class="chip-wrap">
    ${cell
      .map(
        k => `<span class="chip ${side.toLowerCase()}"
      onclick="event.stopPropagation();openModal('${k.id}')">${esc(k.code)}</span>`,
      )
      .join('')}
    <span class="chip empty">+</span>
  </div></div>`;
      }
    }
    html += `</div></div>`;
  }
  html += '</div>';

  if (unloc.length > 0) {
    html += `
<div class="unloc-section">
  <div class="unloc-title">⚠️ Unlocated (${unloc.length})</div>
  <div class="chip-wrap">
    ${unloc.map(k => `<span class="chip unknown" onclick="openModal('${k.id}')">${esc(k.code)}</span>`).join('')}
  </div>
</div>`;
  }
  return html;
}

// Keep unused imports happy
void posLabel;
void sideClass;
