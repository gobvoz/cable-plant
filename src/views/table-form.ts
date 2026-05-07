import { S, go } from '../state';
import { esc, val, toast } from '../utils';
import { getTable, addTable, updTable } from '../db';

export function viewTableForm(): string {
  const isEdit = !!S.editTableId;
  const table = isEdit ? getTable(S.editTableId!) : null;
  if (isEdit && !table) {
    go('home');
    return '';
  }
  const t = table ?? { name: '', notes: '' };
  const tid = table?.id ?? '';

  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="go('home')">‹</button>
  <div class="hdr-title">${isEdit ? 'Edit' : 'New'} table</div>
</header>
<main class="main">
  <div class="form-group">
    <label>Table number *</label>
    <input id="f-table-name" type="text" value="${esc(t.name)}" placeholder="e.g. 64"
      inputmode="numeric" autocomplete="off">
  </div>
  <div class="form-group">
    <label>Notes <span class="txt-muted">(optional)</span></label>
    <textarea id="f-table-notes" rows="2">${esc(t.notes)}</textarea>
  </div>
  <button class="btn btn-primary w-full" onclick="saveTableAction('${tid}')">
    💾 ${isEdit ? 'Save' : 'Create'}
  </button>
  <button class="btn btn-ghost w-full mt8" onclick="go('home')">Cancel</button>
</main>`;
}

export function saveTableAction(id: string): void {
  const name = val('f-table-name').trim();
  const notes = val('f-table-notes').trim();

  if (!name) {
    toast('⚠️ Table number is required');
    return;
  }

  if (id) {
    updTable(id, { name, notes });
    toast('✅ Table updated');
    go('home');
  } else {
    addTable({ name, notes });
    toast('✅ Table created');
    go('home');
  }
}
