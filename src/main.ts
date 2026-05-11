import './style.css';

import { render } from './render';
import { setRenderFn } from './state';
import {
  go,
  set,
  openModal,
  copyCode,
  delSchema,
  saveSchema,
  saveTableAction,
  delTableAction,
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
  doExport,
  doImport,
  doClear,
  toggleFilterAcc,
  startAssemblyAction,
  stopAssemblyAction,
  resetAssemblyAction,
  toggleWireDoneAction,
} from './actions';

// Wire the render function into state
setRenderFn(render);

/* ── Data migration & iOS backup restore ────────────────────────── */
import { migrateToV8, restoreFromIdbIfNeeded } from './db';

restoreFromIdbIfNeeded().then(() => {
  migrateToV8();
  render();
});

// Prevent double render below — render() above handles initial draw
/* ── Expose all handlers to window (used from inline onclick HTML) ── */
declare global {
  interface Window {
    go: typeof go;
    set: typeof set;
    openModal: typeof openModal;
    copyCode: typeof copyCode;
    delSchema: typeof delSchema;
    saveSchema: typeof saveSchema;
    saveTableAction: typeof saveTableAction;
    delTableAction: typeof delTableAction;
    saveSkon: typeof saveSkon;
    delSkon: typeof delSkon;
    skonBack: typeof skonBack;
    toggleAcc: typeof toggleAcc;
    toggleFilterAcc: typeof toggleFilterAcc;
    saveCtypeForm: typeof saveCtypeForm;
    delCtypeAction: typeof delCtypeAction;
    loadSvgFile: typeof loadSvgFile;
    clearSvg: typeof clearSvg;
    importDocAction: typeof importDocAction;
    importKittingAction: typeof importKittingAction;
    doExport: typeof doExport;
    doImport: typeof doImport;
    doClear: typeof doClear;
    startAssemblyAction: typeof startAssemblyAction;
    stopAssemblyAction: typeof stopAssemblyAction;
    resetAssemblyAction: typeof resetAssemblyAction;
    toggleWireDoneAction: typeof toggleWireDoneAction;
  }
}

window.go = go;
window.set = set;
window.openModal = openModal;
window.copyCode = copyCode;
window.delSchema = delSchema;
window.saveSchema = saveSchema;
window.saveSkon = saveSkon;
window.delSkon = delSkon;
window.skonBack = skonBack;
window.toggleAcc = toggleAcc;
window.toggleFilterAcc = toggleFilterAcc;
window.saveCtypeForm = saveCtypeForm;
window.delCtypeAction = delCtypeAction;
window.loadSvgFile = loadSvgFile;
window.clearSvg = clearSvg;
window.importDocAction = importDocAction;
window.importKittingAction = importKittingAction;
window.saveTableAction = saveTableAction;
window.delTableAction = delTableAction;
window.doExport = doExport;
window.doImport = doImport;
window.doClear = doClear;
window.startAssemblyAction = startAssemblyAction;
window.stopAssemblyAction = stopAssemblyAction;
window.resetAssemblyAction = resetAssemblyAction;
window.toggleWireDoneAction = toggleWireDoneAction;
