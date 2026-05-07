import { S, go, set } from '../state';
import { esc, val, toast } from '../utils';
import {
  getDevice,
  addDevice,
  updDevice,
  delDevice,
  getSchema,
  deviceBySchema,
  allCtype,
} from '../db';

export function viewSkonForm(): string {
  const isEdit = !!S.skonId;
  const device = isEdit ? getDevice(S.skonId!) : null;
  if (isEdit && !device) {
    go('schema', { schemaId: S.schemaId });
    return '';
  }
  const k = device ?? {
    code: '',
    typeId: null as string | null,
    subtable: S.prefill?.subtable ?? (null as number | null),
    section: S.prefill?.section ?? (null as number | null),
    side: (S.prefill?.side ?? 'Haut') as 'Haut' | 'Bas',
    notes: '',
    contracts: S.selectedCon ?? '',
    accessories: [] as string[],
  };
  const kid = device?.id ?? '';

  const schemaSubtables = getSchema(S.schemaId!)?.subtables ?? 5;
  const opt = (arr: (string | number)[], cur: unknown) =>
    arr
      .map(v => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${v}</option>`)
      .join('');

  const ctypes = allCtype();

  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="skonBack()">‹</button>
  <div class="hdr-title">${isEdit ? 'Edit device' : 'Add device'}</div>
</header>
<main class="main">
  <div class="form-group">
    <label>Device *</label>
    <input id="f-code" type="text" value="${esc(k.code)}" placeholder="e.g. EN-X64B"
      autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">
  </div>
  <div class="form-group">
    <label>Physical type <span class="txt-muted">(optional)</span></label>
    ${
      ctypes.length === 0
        ? `<div class="txt-sm txt-muted mb8">No types in catalog yet.</div>
           <button type="button" class="btn btn-ghost btn-sm" onclick="go('ctypes')">+ Add connector types</button>
           <input type="hidden" id="f-typeid" value="">`
        : `<select id="f-typeid">
            <option value="">— None —</option>
            ${ctypes.map(t => `<option value="${t.id}"${k.typeId === t.id ? ' selected' : ''}>${esc(t.name)}${t.pins ? ` (${t.pins}p)` : ''}</option>`).join('')}
           </select>
           <div class="txt-sm txt-muted mt6"><button type="button" class="link-btn" onclick="go('ctypes')">Manage types ›</button></div>`
    }
  </div>
  <div class="divider"></div>
  <div class="txt-sm txt-muted mb12">📍 Position on the table</div>
  <div class="grid-2">
    <div class="form-group mb0">
      <label>Sub-table</label>
      <select id="f-st"><option value="">—</option>${opt(
        Array.from({ length: schemaSubtables }, (_, i) => i + 1),
        k.subtable,
      )}</select>
    </div>
    <div class="form-group mb0">
      <label>Section</label>
      <select id="f-sec"><option value="">—</option>${opt([1, 2, 3, 4], k.section)}</select>
    </div>
  </div>
  <div class="form-group mt12">
    <label>Side</label>
    <select id="f-side">
      <option value="Haut"${k.side === 'Haut' ? ' selected' : ''}>Haut</option>
      <option value="Bas" ${k.side === 'Bas' ? ' selected' : ''}>Bas</option>
    </select>
  </div>
  <div class="form-group">
    <label>Notes <span class="txt-muted">(optional)</span></label>
    <textarea id="f-notes" rows="2">${esc(k.notes)}</textarea>
  </div>
  <div class="form-group">
    <label>Accessories</label>
    <input type="hidden" id="f-accessories" value="${esc(JSON.stringify(k.accessories || []))}">
    <div class="acc-chips">
      ${['BOOT', 'CAP', 'LOCK', 'LABEL', 'FUSE', 'BACKSHELL']
        .map(
          a =>
            `<button type="button" id="f-acc-${a}" class="acc-chip${(k.accessories || []).includes(a) ? ' on' : ''}" onclick="toggleAcc('${a}')">${a}</button>`,
        )
        .join('')}
    </div>
  </div>
  <div class="form-group">
    <label>Contracts <span class="txt-muted">(empty = all, e.g. 01,02)</span></label>
    <input id="f-contracts" type="text" value="${esc(k.contracts || '')}"
      placeholder="e.g. 01 or 01,02 — leave empty for all contracts"
      autocomplete="off" autocapitalize="characters" spellcheck="false">
  </div>
  <button class="btn btn-primary w-full" onclick="saveSkon('${kid}')">
    💾 ${isEdit ? 'Save' : 'Add'}
  </button>
  ${isEdit ? `<button class="btn btn-danger w-full mt8" onclick="delSkon('${kid}')">🗑 Delete</button>` : ''}
  <button class="btn btn-ghost w-full mt8" onclick="skonBack()">Cancel</button>
</main>`;
}

/* ── Actions ─────────────────────────────────────────────────── */
export function saveSkon(id: string): void {
  const code = val('f-code').trim().toUpperCase();
  const typeId = val('f-typeid') || null;
  const subtable = val('f-st');
  const section = val('f-sec');
  const side = val('f-side');
  const notes = val('f-notes').trim();
  const contracts = val('f-contracts').trim();
  const accessories: string[] = JSON.parse(
    (document.getElementById('f-accessories') as HTMLInputElement)?.value || '[]',
  );

  if (!code) {
    toast('⚠️ Device code is required');
    return;
  }

  const dup = deviceBySchema(S.schemaId!).find(k => k.code === code && k.id !== id);
  if (dup) {
    toast(`⚠️ Code "${code}" already used`);
    return;
  }

  const data = {
    code,
    typeId,
    notes,
    accessories,
    schemaId: S.schemaId!,
    subtable: subtable ? +subtable : null,
    section: section ? +section : null,
    side: subtable ? (side as 'Haut' | 'Bas') : null,
    contracts,
  };

  if (id) {
    updDevice(id, data);
    toast('✅ Device updated');
  } else {
    addDevice(data);
    toast('✅ Device added');
  }
  skonBack();
}

export function delSkon(id: string): void {
  if (!confirm('Delete this device?')) return;
  delDevice(id);
  toast('🗑 Device deleted');
  skonBack();
}

export function skonBack(): void {
  go('schema', { schemaId: S.schemaId });
}

export function toggleAcc(name: string): void {
  const inp = document.getElementById('f-accessories') as HTMLInputElement | null;
  if (!inp) return;
  let arr: string[] = JSON.parse(inp.value || '[]');
  const i = arr.indexOf(name);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(name);
  inp.value = JSON.stringify(arr);
  const btn = document.getElementById(`f-acc-${name}`);
  if (btn) btn.classList.toggle('on');
}

// Suppress unused warning
void set;
