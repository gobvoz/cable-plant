import { go, set, S } from './state';
import { toast } from './utils';
import {
  delSchema as dbDelSchema,
  delTable as dbDelTable,
  exportAll,
  importAll,
  clearAll,
  startAssembly as dbStartAssembly,
  stopAssembly as dbStopAssembly,
  resetAssemblyDone as dbResetAssemblyDone,
  toggleAssemblyWire as dbToggleAssemblyWire,
} from './db';
import { saveSchema } from './views/schema-form';
import { saveTableAction } from './views/table-form';
import { saveSkon, delSkon, skonBack, toggleAcc } from './views/skon-form';
import { saveCtypeForm, delCtypeAction, loadSvgFile, clearSvg } from './views/ctypes';
import { importDocAction, importKittingAction } from './views/import-doc';

/* ── Modal ─────────────────────────────────────────────────────── */
export function openModal(id: string): void {
  set({ modal: id });
}

/* ── Clipboard ──────────────────────────────────────────────────── */
export function copyCode(code: string): void {
  navigator.clipboard
    ?.writeText(code)
    .then(() => toast(`📋 "${code}" copied`))
    .catch(() => toast(code));
}

/* ── Schema delete ──────────────────────────────────────────────── */
/* ── Table delete ───────────────────────────────────────────────── */
export function delTableAction(id: string): void {
  if (!confirm('Delete this table and ALL its schemas, devices and wires?')) return;
  dbDelTable(id);
  toast('🗑 Table deleted');
  go('home');
}

/* ── Schema delete ──────────────────────────────────────────────── */
export function delSchema(id: string): void {
  if (!confirm('Delete this cable plan and all its devices?')) return;
  dbDelSchema(id);
  toast('🗑 Cable plan deleted');
  go('home');
}

/* ── Filter accessory chips ─────────────────────────────────────── */
export function toggleFilterAcc(name: string): void {
  const arr = [...(S.filterAcc || [])];
  const i = arr.indexOf(name);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(name);
  set({ filterAcc: arr });
}

/* ── Export / Import / Clear ─────────────────────────────────────── */
export function doExport(): void {
  const json = JSON.stringify(exportAll(), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `cableplan-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
  toast('📤 Backup downloaded');
}

export function doImport(input: HTMLInputElement): void {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      importAll(JSON.parse((e.target as FileReader).result as string));
      toast('✅ Data imported');
      go('home');
    } catch {
      toast('❌ Invalid file');
    }
  };
  reader.readAsText(file);
}

export function doClear(): void {
  if (!confirm('Clear ALL data?\nIrreversible action.')) return;
  clearAll();
  toast('🗑 Data cleared');
  go('home');
}

/* ── Assembly session ────────────────────────────────────────── */
export function startAssemblyAction(schemaId: string): void {
  dbStartAssembly(schemaId);
  set({});
}

export function stopAssemblyAction(schemaId: string): void {
  dbStopAssembly(schemaId);
  set({});
}

export function resetAssemblyAction(schemaId: string): void {
  if (!confirm('Reset all assembly marks?\nAll wire done-state will be cleared.')) return;
  dbResetAssemblyDone(schemaId);
  set({});
}

export function toggleWireDoneAction(schemaId: string, wireId: string): void {
  dbToggleAssemblyWire(schemaId, wireId);
  set({});
}

// Re-export everything needed on window
export {
  go,
  set,
  saveTableAction,
  saveSchema,
  saveSkon,
  delSkon,
  skonBack,
  toggleAcc,
  saveCtypeForm,
  delCtypeAction,
  loadSvgFile,
  clearSvg,
  importDocAction,
  importKittingAction,
};
