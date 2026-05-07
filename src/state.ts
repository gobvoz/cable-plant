import type { AppState } from './types';

export let S: AppState = {
  view: 'home',
  tableId: null,
  editTableId: null,
  schemaId: null,
  editSchemaId: null,
  editCtypeId: null,
  skonId: null,
  tab: 'search',
  q: '',
  wireQ: '',
  wirePage: null,
  modal: null,
  prefill: null,
  selectedCon: null,
  filterAcc: [],
};

export const set = (patch: Partial<AppState>): void => {
  S = { ...S, ...patch };
  renderLater();
};

export const go = (view: AppState['view'], patch: Partial<AppState> = {}): void => {
  S = { ...S, view, modal: null, ...patch };
  scrollTo(0, 0);
  renderLater();
};

// Deferred to let callers chain multiple set() without double-render
let _pending = false;
const renderLater = () => {
  if (_pending) return;
  _pending = true;
  queueMicrotask(() => {
    _pending = false;
    renderNow();
  });
};

// Will be wired by render.ts
let renderNow: () => void = () => {};
export const setRenderFn = (fn: () => void): void => {
  renderNow = fn;
};
