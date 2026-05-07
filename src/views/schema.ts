import { S, go, set } from '../state';
import { esc } from '../utils';
import { getSchema, getTable, deviceBySchema } from '../db';
import { tabGrid } from '../tabs/grid';
import { tabList } from '../tabs/list';
import { tabWires } from '../tabs/wires';
import type { ViewCtx } from '../types';

export function viewSchema(): string {
  const s = getSchema(S.schemaId!);
  if (!s) {
    go('home');
    return '';
  }

  const revs = s.contracts || [];
  const allDevs = deviceBySchema(S.schemaId!);
  const filterAcc = S.filterAcc || [];

  const revFiltered = S.selectedCon
    ? allDevs.filter(k => {
        const parts = (k.contracts || '').split(',').map(r => r.trim());
        return !k.contracts || parts.includes(S.selectedCon!);
      })
    : allDevs;

  const kons =
    filterAcc.length > 0
      ? revFiltered.filter(k => filterAcc.some(a => (k.accessories || []).includes(a)))
      : revFiltered;

  const usedAcc = [...new Set(allDevs.flatMap(k => k.accessories || []))].sort();

  const filterInfo = [
    S.selectedCon ? `Cntr.\u00a0${S.selectedCon}` : '',
    filterAcc.length > 0 ? filterAcc.join(', ') : '',
  ]
    .filter(Boolean)
    .join(' \u00b7 ');

  const tab: string = !S.tab || S.tab === 'search' ? 'list' : S.tab;

  const ctx: ViewCtx = {
    formView: 'skon-form',
    idProp: 'schemaId',
    id: s.id,
    konIdProp: 'skonId',
    subtables: s.subtables || 5,
  };

  const table = getTable(s.tableId);
  const tableLabel = table ? `Table ${esc(table.name)}` : '';

  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="go('home')">‹</button>
  <div class="hdr-title">
    <div>${tableLabel}${s.cableType ? (tableLabel ? ' — ' : '') + esc(s.cableType) : ''}</div>
    <div class="hdr-sub">${filterInfo ? filterInfo + ' \u00b7 ' : ''}${kons.length}${kons.length !== allDevs.length ? `/${allDevs.length}` : ''} device${kons.length !== 1 ? 's' : ''}</div>
  </div>
  <button class="icon-btn" onclick="go('import-doc',{schemaId:'${s.id}'})">📥</button>
  <button class="icon-btn" onclick="go('schema-form',{editSchemaId:'${s.id}'})">✏️</button>
</header>
<main class="main">
  ${
    revs.length > 0
      ? `
  <div class="type-chips">
    <button class="type-chip${!S.selectedCon ? ' active' : ''}" onclick="set({selectedCon:null})">All</button>
    ${revs.map(r => `<button class="type-chip${S.selectedCon === r ? ' active' : ''}" onclick="set({selectedCon:'${esc(r)}'})">${esc(r)}</button>`).join('')}
  </div>`
      : ''
  }
  ${
    usedAcc.length > 0
      ? `
  <div class="type-chips mb8">
    ${usedAcc.map(a => `<button class="type-chip${filterAcc.includes(a) ? ' acc-on' : ''}" onclick="toggleFilterAcc('${a}')">${a}</button>`).join('')}
    ${filterAcc.length > 0 ? `<button class="type-chip opacity-60" onclick="set({filterAcc:[]})">✕ clear</button>` : ''}
  </div>`
      : ''
  }
  <div class="tabs">
    <button class="tab${tab === 'grid' ? ' active' : ''}" onclick="set({tab:'grid'})">📐 Plan</button>
    <button class="tab${tab === 'list' ? ' active' : ''}" onclick="set({tab:'list'})">📋 List</button>
    <button class="tab${tab === 'wires' ? ' active' : ''}" onclick="set({tab:'wires'})">🔌 Wires</button>
  </div>
  ${tab === 'grid' ? tabGrid(kons, ctx) : ''}
  ${tab === 'list' ? tabList(kons) : ''}
  ${tab === 'wires' ? tabWires(s.id) : ''}
</main>`;
}

// set / go used in inline onclick templates
void set;
void go;
