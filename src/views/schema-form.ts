import { S, go } from '../state';
import { esc, val, toast } from '../utils';
import { getSchema, addSchema, updSchema, getTable } from '../db';

export function viewSchemaForm(): string {
  const isEdit = !!S.editSchemaId;
  const schema = isEdit ? getSchema(S.editSchemaId!) : null;
  if (isEdit && !schema) {
    go('home');
    return '';
  }

  // Determine tableId: from existing schema or from navigation state
  const tableId = schema?.tableId ?? S.tableId ?? '';
  const table = tableId ? getTable(tableId) : null;
  if (!table) {
    go('home');
    return '';
  }

  const s = schema ?? {
    cableType: '',
    subtables: 5,
    contracts: [] as string[],
    notes: '',
  };
  const sid = schema?.id ?? '';

  const revStr = s.contracts.join(', ');
  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="go('home')">‹</button>
  <div class="hdr-title">${isEdit ? 'Edit' : 'New'} schema</div>
</header>
<main class="main">
  <div class="form-group">
    <label>Table</label>
    <div class="input-static">Table ${esc(table.name)}</div>
  </div>
  <div class="form-group">
    <label>Cable type / schema ID *</label>
    <input id="f-ctype-schema" type="text" value="${esc(s.cableType)}" placeholder="e.g. H019"
      autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">
  </div>
  <div class="form-group">
    <label>Number of sub-tables</label>
    <select id="f-subtables">
      ${[3, 4, 5].map(n => `<option value="${n}"${(s.subtables || 5) === n ? ' selected' : ''}>${n}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label>Contracts <span class="txt-muted">(comma-separated, e.g. 01, 02)</span></label>
    <input id="f-contracts" type="text" value="${esc(revStr)}"
      placeholder="e.g. 01, 02 — leave empty if no contracts"
      autocomplete="off" autocapitalize="characters" spellcheck="false">
  </div>
  <div class="form-group">
    <label>Notes <span class="txt-muted">(optional)</span></label>
    <textarea id="f-notes" rows="2">${esc(s.notes)}</textarea>
  </div>
  <button class="btn btn-primary w-full" onclick="saveSchema('${sid}','${tableId}')">
    💾 ${isEdit ? 'Save' : 'Create'}
  </button>
  <button class="btn btn-ghost w-full mt8" onclick="go(${isEdit ? `'schema',{schemaId:'${sid}'}` : `'home'`})">
    Cancel
  </button>
</main>`;
}

export function saveSchema(id: string, tableId: string): void {
  const cableType = val('f-ctype-schema').trim().toUpperCase();
  const notes = val('f-notes').trim();
  const subtables = +(val('f-subtables') || 5);
  const contracts = val('f-contracts')
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);

  if (!cableType) {
    toast('⚠️ Cable type is required');
    return;
  }

  if (id) {
    updSchema(id, { cableType, notes, subtables, contracts });
    toast('✅ Schema updated');
    go('schema', { schemaId: id });
  } else {
    const item = addSchema({ tableId, cableType, notes, subtables, contracts });
    toast('✅ Schema created');
    go('schema', { schemaId: item.id, tableId });
  }
}
