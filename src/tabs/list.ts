import { S, set } from '../state';
import { esc, posLabel, sideClass } from '../utils';
import { getCtype } from '../db';
import type { Device } from '../types';

export function tabList(kons: Device[]): string {
  const q = S.q.trim().toLowerCase();

  const types = [
    ...new Set(kons.map(k => getCtype(k.typeId)?.name).filter(Boolean) as string[]),
  ].sort();

  const hl = (text: string) => {
    if (!q || !text) return esc(text || '');
    const safe = esc(text);
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${safeQ})`, 'gi'), '<mark class="hl">$1</mark>');
  };

  const visible = q
    ? kons.filter(k => {
        const typeName = getCtype(k.typeId)?.name ?? '';
        return (
          k.code.toLowerCase().includes(q) ||
          typeName.toLowerCase().includes(q) ||
          (k.notes || '').toLowerCase().includes(q)
        );
      })
    : kons;

  const searchBar = /* html */ `
<div class="search-wrap">
  <span class="search-lead">🔍</span>
  <input id="search-q" class="search-input" type="text" inputmode="text" value="${esc(S.q)}"
    placeholder="Device code or type…"
    oninput="set({q:this.value})"
    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
  ${S.q ? `<button class="search-clear" onclick="set({q:''})">×</button>` : ''}
</div>
${
  types.length > 0
    ? `<div class="type-chips mb8">
  ${types
    .map(
      t =>
        `<button class="type-chip${S.q.trim() === t ? ' active' : ''}" onclick="set({q:'${esc(t)}'})">
    ${esc(t)}
  </button>`,
    )
    .join('')}
</div>`
    : ''
}`;

  if (!visible.length)
    return `${searchBar}
<div class="empty">
  <div class="empty-icon">${q ? '🔎' : '📋'}</div>
  <div>${q ? `No results for "${esc(q)}"` : 'No devices'}</div>
  ${!q ? `<div class="txt-sm txt-muted mt8">Tap + to add one</div>` : ''}
</div>`;

  const groups: Record<string, Device[]> = {};
  for (const k of visible) {
    const g = k.subtable ? `Sub-table ${k.subtable}` : '⚠️ Unlocated';
    (groups[g] = groups[g] || []).push(k);
  }

  const sideOrder = (side: string | null) => (side === 'Haut' ? 0 : side === 'Bas' ? 1 : 2);
  const sortDevices = (items: Device[]) =>
    [...items].sort((a, b) => {
      const sSec = (a.section ?? 99) - (b.section ?? 99);
      if (sSec !== 0) return sSec;
      const sSide = sideOrder(a.side) - sideOrder(b.side);
      if (sSide !== 0) return sSide;
      return a.code.localeCompare(b.code);
    });

  /** Render items with a divider line between section changes */
  const renderItems = (items: Device[]) => {
    const sorted = sortDevices(items);
    let lastSec: number | null | undefined = undefined;
    return sorted
      .map(k => {
        const divider =
          lastSec !== undefined && k.section !== null && lastSec !== null && k.section !== lastSec
            ? `<div class="section-divider"></div>`
            : '';
        lastSec = k.section;
        return /* html */ `${divider}
  <div class="list-item" onclick="openModal('${k.id}')">
    <div class="list-item-info">
      <div class="fw-bold">${hl(k.code)}</div>
      ${k.typeId ? `<div class="txt-sm txt-muted">${hl(getCtype(k.typeId)?.name || '')}</div>` : ''}
      ${(k.accessories || []).length > 0 ? `<div class="acc-list mt4">${(k.accessories || []).map(a => `<span class="acc-badge">${a}</span>`).join('')}</div>` : ''}
      ${k.contracts ? `<div class="contracts-label">Cntr. ${esc(k.contracts)}</div>` : ''}
    </div>
    ${
      posLabel(k)
        ? `<span class="pos-badge ${sideClass(k.side)} sm">${posLabel(k)}</span>`
        : `<span class="pos-badge unknown sm">?</span>`
    }
  </div>`;
      })
      .join('');
  };

  const sortGroups = ([a]: [string, Device[]], [b]: [string, Device[]]) => {
    if (a.startsWith('⚠️')) return 1;
    if (b.startsWith('⚠️')) return -1;
    return a.localeCompare(b, undefined, { numeric: true });
  };

  const groupsHtml = Object.entries(groups)
    .sort(sortGroups)
    .map(
      ([g, items]) => `
<div class="mb16">
  <div class="st-title">${esc(g)}</div>
  ${renderItems(items)}
</div>`,
    )
    .join('');

  return `${searchBar}${groupsHtml}`;
}

// set used in inline onclick HTML
void set;
