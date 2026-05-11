import type { Table, Schema, Device, CType, Wire, Assembly } from './types';
import { uid, toast } from './utils';

/* ── IndexedDB backup (iOS PWA localStorage eviction workaround) ── */
const IDB_NAME = 'cp_backup';
const IDB_STORE = 'snapshot';
const IDB_KEY = 'data';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbSave(snapshot: Record<string, string>): void {
  openIdb().then(db => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(snapshot, IDB_KEY);
  }).catch(() => {/* silently ignore */});
}

function idbLoad(): Promise<Record<string, string> | null> {
  return openIdb().then(db => new Promise<Record<string, string> | null>((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as Record<string, string>) ?? null);
    req.onerror = () => reject(req.error);
  })).catch(() => null);
}

const DATA_KEYS = ['cp_table', 'cp_schema', 'cp_skon', 'cp_ctype', 'cp_wire'];

function scheduleIdbBackup(): void {
  // Debounce: write once per microtask batch
  if ((scheduleIdbBackup as { _p?: boolean })._p) return;
  (scheduleIdbBackup as { _p?: boolean })._p = true;
  queueMicrotask(() => {
    (scheduleIdbBackup as { _p?: boolean })._p = false;
    const snapshot: Record<string, string> = {};
    DATA_KEYS.forEach(k => { snapshot[k] = localStorage.getItem(k) ?? '[]'; });
    idbSave(snapshot);
  });
}

/** Call once at app start: if localStorage is empty, restore from IndexedDB backup */
export async function restoreFromIdbIfNeeded(): Promise<void> {
  const hasData = DATA_KEYS.some(k => localStorage.getItem(k));
  if (hasData) return;
  const snapshot = await idbLoad();
  if (!snapshot) return;
  DATA_KEYS.forEach(k => { if (snapshot[k]) localStorage.setItem(k, snapshot[k]); });
}

/* ── localStorage helpers ─────────────────────────────────────── */
const rd = <T>(key: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[];
  } catch {
    return [];
  }
};

const wr = <T>(key: string, val: T[]): void => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    scheduleIdbBackup();
  } catch {
    toast('⚠️ Storage full');
  }
};

const KEY_T = 'cp_table';
const KEY_S = 'cp_schema';
const KEY_SK = 'cp_skon';
const KEY_CT = 'cp_ctype';
const KEY_W = 'cp_wire';

/* ── Tables ──────────────────────────────────────────────────── */
export const allTable = (): Table[] => rd<Table>(KEY_T);
export const getTable = (id: string): Table | undefined => rd<Table>(KEY_T).find(t => t.id === id);

export const addTable = (data: Omit<Table, 'id' | 'at'>): Table => {
  const list = rd<Table>(KEY_T);
  const item: Table = { ...data, id: uid(), at: Date.now() };
  list.push(item);
  wr(KEY_T, list);
  return item;
};
export const updTable = (id: string, d: Partial<Table>): void =>
  wr(
    KEY_T,
    rd<Table>(KEY_T).map(t => (t.id === id ? { ...t, ...d } : t)),
  );

export const delTable = (id: string): void => {
  // Cascade: delete each schema (which removes its devices + wires)
  allSchema()
    .filter(s => s.tableId === id)
    .forEach(s => delSchema(s.id));
  wr(
    KEY_T,
    rd<Table>(KEY_T).filter(t => t.id !== id),
  );
};

/** Migrate v7 data (tableNumber on Schema) → v8 (Table entity + tableId on Schema) */
export const migrateToV8 = (): void => {
  type LegacySchema = { tableNumber?: string; tableId?: string } & Record<string, unknown>;
  const rawSchemas = rd<LegacySchema>(KEY_S);
  if (!rawSchemas.some(s => s.tableNumber && !s.tableId)) return;

  const tables: Table[] = rd<Table>(KEY_T);
  const tableByName: Record<string, string> = {};
  tables.forEach(t => {
    tableByName[t.name] = t.id;
  });

  const updatedSchemas = rawSchemas.map(s => {
    if (s.tableId) return s;
    const name = s.tableNumber || 'Unknown';
    if (!tableByName[name]) {
      const t: Table = { id: uid(), name, notes: '', at: Date.now() };
      tables.push(t);
      tableByName[name] = t.id;
    }
    const { tableNumber: _removed, ...rest } = s;
    void _removed;
    return { ...rest, tableId: tableByName[name] };
  });

  wr(KEY_S, updatedSchemas as unknown as Schema[]);
  wr(KEY_T, tables);
};

/* ── Cable plans ─────────────────────────────────────────────── */
export const allSchema = (): Schema[] => rd<Schema>(KEY_S);
export const getSchema = (id: string): Schema | undefined =>
  rd<Schema>(KEY_S).find(s => s.id === id);

export const addSchema = (data: Omit<Schema, 'id' | 'at'>): Schema => {
  const list = rd<Schema>(KEY_S);
  const item: Schema = { ...data, id: uid(), at: Date.now() };
  list.push(item);
  wr(KEY_S, list);
  return item;
};
export const updSchema = (id: string, d: Partial<Schema>): void =>
  wr(
    KEY_S,
    rd<Schema>(KEY_S).map(s => (s.id === id ? { ...s, ...d } : s)),
  );

export const delSchema = (id: string): void => {
  wr(
    KEY_S,
    rd<Schema>(KEY_S).filter(s => s.id !== id),
  );
  wr(
    KEY_SK,
    rd<Device>(KEY_SK).filter(k => k.schemaId !== id),
  );
  wr(
    KEY_W,
    rd<Wire>(KEY_W).filter(w => w.schemaId !== id),
  );
};

/* ── Connector types ─────────────────────────────────────────── */
export const allCtype = (): CType[] => rd<CType>(KEY_CT);
export const getCtype = (id: string | null | undefined): CType | undefined =>
  id ? rd<CType>(KEY_CT).find(t => t.id === id) : undefined;

export const addCtype = (data: Omit<CType, 'id' | 'at'>): CType => {
  const list = rd<CType>(KEY_CT);
  const item: CType = { ...data, id: uid(), at: Date.now() };
  list.push(item);
  wr(KEY_CT, list);
  return item;
};
export const updCtype = (id: string, d: Partial<CType>): void =>
  wr(
    KEY_CT,
    rd<CType>(KEY_CT).map(t => (t.id === id ? { ...t, ...d } : t)),
  );
export const delCtype = (id: string): void =>
  wr(
    KEY_CT,
    rd<CType>(KEY_CT).filter(t => t.id !== id),
  );

/* ── Devices (connectors on table) ──────────────────────────── */
export const allDevice = (): Device[] => rd<Device>(KEY_SK);
export const deviceBySchema = (sid: string): Device[] =>
  rd<Device>(KEY_SK).filter(k => k.schemaId === sid);
export const getDevice = (id: string): Device | undefined =>
  rd<Device>(KEY_SK).find(k => k.id === id);

export const addDevice = (data: Omit<Device, 'id' | 'at'>): Device => {
  const list = rd<Device>(KEY_SK);
  const item: Device = { ...data, id: uid(), at: Date.now() };
  list.push(item);
  wr(KEY_SK, list);
  return item;
};
export const updDevice = (id: string, d: Partial<Device>): void =>
  wr(
    KEY_SK,
    rd<Device>(KEY_SK).map(k => (k.id === id ? { ...k, ...d } : k)),
  );
export const delDevice = (id: string): void =>
  wr(
    KEY_SK,
    rd<Device>(KEY_SK).filter(k => k.id !== id),
  );

/* ── Wires ───────────────────────────────────────────────────── */
export const allWire = (): Wire[] => rd<Wire>(KEY_W);
export const wireBySchema = (sid: string): Wire[] =>
  rd<Wire>(KEY_W).filter(w => w.schemaId === sid);
export const getWire = (id: string): Wire | undefined => rd<Wire>(KEY_W).find(w => w.id === id);

export const addWire = (data: Omit<Wire, 'id' | 'at'>): Wire => {
  const list = rd<Wire>(KEY_W);
  const item: Wire = { ...data, id: uid(), at: Date.now() };
  list.push(item);
  wr(KEY_W, list);
  return item;
};
export const updWire = (id: string, d: Partial<Wire>): void =>
  wr(
    KEY_W,
    rd<Wire>(KEY_W).map(w => (w.id === id ? { ...w, ...d } : w)),
  );
export const delWire = (id: string): void =>
  wr(
    KEY_W,
    rd<Wire>(KEY_W).filter(w => w.id !== id),
  );

/* ── Export / Import / Clear ─────────────────────────────────── */
export const exportAll = () => ({
  v: 8,
  at: new Date().toISOString(),
  tables: rd<Table>(KEY_T),
  schema: rd<Schema>(KEY_S),
  skon: rd<Device>(KEY_SK),
  ctypes: rd<CType>(KEY_CT),
  wires: rd<Wire>(KEY_W),
});

export const importAll = (d: Record<string, unknown>): void => {
  if (!Array.isArray(d?.schema)) throw new Error('Invalid backup format');
  if (Array.isArray(d?.tables)) {
    wr(KEY_T, d.tables as Table[]);
  } else {
    // Old backup without a tables list — clear stale tables so migration starts clean
    localStorage.removeItem(KEY_T);
  }
  wr(KEY_S, d.schema as Schema[]);
  if (Array.isArray(d?.skon)) wr(KEY_SK, d.skon as Device[]);
  if (Array.isArray(d?.ctypes)) wr(KEY_CT, d.ctypes as CType[]);
  if (Array.isArray(d?.wires)) wr(KEY_W, d.wires as Wire[]);
  // Run migration so old backups with tableNumber → tableId are handled
  migrateToV8();
};

export const clearAll = (): void => {
  [KEY_T, KEY_S, KEY_SK, KEY_CT, KEY_W].forEach(k => localStorage.removeItem(k));
};

/* ── Assembly session ────────────────────────────────────────── */
const KEY_ASM = 'cp_asm';

export const getAssembly = (schemaId: string): Assembly | null => {
  try {
    const raw = localStorage.getItem(KEY_ASM);
    if (!raw) return null;
    const a = JSON.parse(raw) as Assembly;
    return a.schemaId === schemaId ? a : null;
  } catch {
    return null;
  }
};

export const startAssembly = (schemaId: string): Assembly => {
  const existing = getAssembly(schemaId);
  const a: Assembly = existing
    ? { ...existing, active: true }
    : { schemaId, startedAt: new Date().toISOString(), active: true, done: [] };
  localStorage.setItem(KEY_ASM, JSON.stringify(a));
  return a;
};

export const stopAssembly = (schemaId: string): void => {
  const a = getAssembly(schemaId);
  if (!a) return;
  localStorage.setItem(KEY_ASM, JSON.stringify({ ...a, active: false }));
};

export const resetAssemblyDone = (schemaId: string): void => {
  const a = getAssembly(schemaId);
  if (!a) return;
  localStorage.setItem(KEY_ASM, JSON.stringify({ ...a, active: false, done: [] }));
};

export const toggleAssemblyWire = (schemaId: string, wireId: string): void => {
  const a = getAssembly(schemaId);
  if (!a) return;
  const done = a.done.includes(wireId) ? a.done.filter(id => id !== wireId) : [...a.done, wireId];
  localStorage.setItem(KEY_ASM, JSON.stringify({ ...a, done }));
};
