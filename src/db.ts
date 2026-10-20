import type { Table, Schema, Device, CType, Wire, Assembly, ServerIndex } from './types';
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
  openIdb()
    .then(db => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(snapshot, IDB_KEY);
    })
    .catch(() => {
      /* silently ignore */
    });
}

function idbLoad(): Promise<Record<string, string> | null> {
  return openIdb()
    .then(
      db =>
        new Promise<Record<string, string> | null>((resolve, reject) => {
          const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
          req.onsuccess = () => resolve((req.result as Record<string, string>) ?? null);
          req.onerror = () => reject(req.error);
        }),
    )
    .catch(() => null);
}

const DATA_KEYS = ['cp_table', 'cp_schema', 'cp_skon', 'cp_ctype', 'cp_wire'];

function parseArraySafe(raw: string | null): unknown[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function scheduleIdbBackup(): void {
  // Debounce: write once per microtask batch
  if ((scheduleIdbBackup as { _p?: boolean })._p) return;
  (scheduleIdbBackup as { _p?: boolean })._p = true;
  queueMicrotask(() => {
    (scheduleIdbBackup as { _p?: boolean })._p = false;
    const snapshot: Record<string, string> = {};
    DATA_KEYS.forEach(k => {
      snapshot[k] = localStorage.getItem(k) ?? '[]';
    });
    idbSave(snapshot);
  });
}

/** Call once at app start: if localStorage is empty, restore from IndexedDB backup */
export async function restoreFromIdbIfNeeded(): Promise<void> {
  const snapshot = await idbLoad();
  if (!snapshot) return;

  const hasMeaningfulData = DATA_KEYS.some(k => {
    const arr = parseArraySafe(localStorage.getItem(k));
    return !!arr && arr.length > 0;
  });

  // iOS may keep only part of keys after eviction; restore missing/empty/corrupt keys.
  DATA_KEYS.forEach(k => {
    const current = parseArraySafe(localStorage.getItem(k));
    const backup = parseArraySafe(snapshot[k] ?? null);
    if (!backup) return;

    const shouldRestoreKey = !current || (!hasMeaningfulData && current.length === 0);
    if (shouldRestoreKey) localStorage.setItem(k, JSON.stringify(backup));
  });
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

type ContractPayload = {
  table?: Partial<Table>;
  schema?: Partial<Schema>;
  contract?: string;
  devices?: Partial<Device>[];
  skon?: Partial<Device>[];
  ctypes?: Partial<CType>[];
  wires?: Partial<Wire>[];
  files?: string[];
  pages?: ContractPayload[];
  document?:
    | string
    | {
        page?: string;
        timestamp?: string;
        rev?: string;
      };
  sections?: Array<{
    section?: string;
    rows?: Array<{
      col?: string;
      loc?: string;
      device?: string;
      pos?: string;
      connector?: string;
      zone?: string;
    }>;
  }>;
};

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string' && v.trim().length > 0);
}

function resolvePayloadUrl(baseFile: string, rel: string): string {
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.startsWith('/')) return rel;
  try {
    const base = new URL(baseFile, window.location.origin);
    return new URL(rel, base).pathname;
  } catch {
    return rel;
  }
}

async function fetchPayload(file: string): Promise<ContractPayload> {
  const resp = await fetch(file, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Failed to load ${file}: ${resp.status}`);
  return (await resp.json()) as ContractPayload;
}

async function resolvePayloads(
  file: string,
  visited = new Set<string>(),
): Promise<ContractPayload[]> {
  const resolvedFile = resolvePayloadUrl(window.location.pathname, file);
  if (visited.has(resolvedFile)) return [];
  visited.add(resolvedFile);

  const payload = await fetchPayload(resolvedFile);
  const out: ContractPayload[] = [];

  if (Array.isArray(payload.pages) && payload.pages.length > 0) {
    out.push(...payload.pages);
  }

  if (isNonEmptyStringArray(payload.files)) {
    for (const child of payload.files) {
      const childFile = resolvePayloadUrl(resolvedFile, child);
      const childPayloads = await resolvePayloads(childFile, visited);
      out.push(...childPayloads);
    }
  }

  if (
    Array.isArray(payload.ctypes) ||
    Array.isArray(payload.devices) ||
    Array.isArray(payload.skon) ||
    Array.isArray(payload.wires) ||
    Array.isArray(payload.sections)
  ) {
    out.push(payload);
  }

  return out;
}

function splitDocPage(pageRaw: string): { page: string; pageTotal: string } {
  const p = (pageRaw || '').trim();
  if (!p) return { page: '', pageTotal: '' };
  if (!p.includes('/')) return { page: p, pageTotal: '' };
  const [curr, total] = p.split('/').map(v => v.trim());
  return { page: curr || '', pageTotal: total || '' };
}

function buildDeviceCode(loc: string, device: string): string {
  const cleanLoc = (loc || '').trim().toUpperCase();
  const cleanDevice = (device || '').trim().toUpperCase();
  if (cleanLoc && cleanDevice) return `${cleanLoc}-${cleanDevice}`;
  return cleanDevice || cleanLoc;
}

function parseZoneLabel(zone: string): {
  subtable: number | null;
  section: number | null;
  side: 'Haut' | 'Bas' | null;
} {
  const m = (zone || '').trim().match(/^(\d+)\s*-\s*(\d+)\s+(?:-\s*)?(Haut|Bas)$/i);
  if (!m) return { subtable: null, section: null, side: null };
  const sideRaw = (m[3] || '').toLowerCase();
  return {
    subtable: parseInt(m[1], 10),
    section: parseInt(m[2], 10),
    side: sideRaw === 'haut' ? 'Haut' : 'Bas',
  };
}

function toContractPayloadFromDocPage(
  payload: ContractPayload,
  schemaId: string,
  contract: string,
): ContractPayload | null {
  if (!Array.isArray(payload.sections) || payload.sections.length === 0) return null;

  const ctypes: Partial<CType>[] = [];
  const ctypeSeen = new Set<string>();
  const devicesByCode = new Map<string, Partial<Device>>();
  const wires: Partial<Wire>[] = [];

  const headerDoc = typeof payload.document === 'string' ? null : payload.document;
  const pageInfo = splitDocPage(headerDoc?.page || '');
  const docTimestamp = headerDoc?.timestamp || '';
  const docRev = headerDoc?.rev || '';

  let pageOrder = 0;

  for (const sec of payload.sections) {
    const sectionRef = (sec.section || '').trim().toUpperCase();
    const rows = Array.isArray(sec.rows) ? sec.rows : [];
    if (!sectionRef || rows.length < 2) continue;

    const normalized = rows.map(r => ({
      col: (r.col || '').trim().toUpperCase(),
      loc: (r.loc || '').trim().toUpperCase(),
      device: (r.device || '').trim().toUpperCase(),
      pos: (r.pos || '').trim().toUpperCase(),
      connector: (r.connector || '').trim().toUpperCase(),
      zone: (r.zone || '').trim(),
    }));

    for (const row of normalized) {
      const code = buildDeviceCode(row.loc, row.device);
      if (!code) continue;

      const z = parseZoneLabel(row.zone);
      const existing = devicesByCode.get(code);
      if (!existing) {
        devicesByCode.set(code, {
          schemaId,
          code,
          typeId: null,
          subtable: z.subtable,
          section: z.section,
          side: z.side,
          notes: '',
          contracts: contract,
          accessories: [],
        });
      }

      if (row.connector && !ctypeSeen.has(row.connector)) {
        ctypeSeen.add(row.connector);
        ctypes.push({
          name: row.connector,
          pins: null,
          description: '',
          svgConnector: '',
          svgPinout: '',
        });
      }
    }

    const groups = new Map<string, typeof normalized>();
    if (normalized.length === 2) {
      groups.set(sectionRef, normalized);
    } else {
      const byColor = new Map<string, typeof normalized>();
      for (const row of normalized) {
        const color = row.col;
        if (!color) continue;
        const arr = byColor.get(color) || [];
        arr.push(row);
        byColor.set(color, arr);
      }
      byColor.forEach((rowsByColor, color) => {
        if (rowsByColor.length === 2) groups.set(`${sectionRef}:${color}`, rowsByColor);
      });
    }

    groups.forEach((wireRows, wireRef) => {
      const wireNum = wireRef.split('-')[0] || wireRef;
      const color = (wireRows[0]?.col || '').trim();
      const ends = wireRows.map(r => {
        const z = parseZoneLabel(r.zone);
        return {
          loc: r.loc,
          device: r.device,
          code: buildDeviceCode(r.loc, r.device),
          pos: r.pos,
          typeRef: r.connector,
          zone: r.zone,
          subtable: z.subtable,
          section: z.section,
          side: z.side,
        };
      });

      wires.push({
        schemaId,
        wireRef,
        wireNum,
        color,
        contract,
        page: pageInfo.page,
        pageTotal: pageInfo.pageTotal,
        docTimestamp,
        docRev,
        pageOrder: pageOrder++,
        ends,
      });
    });
  }

  return {
    contract,
    ctypes,
    devices: [...devicesByCode.values()],
    wires,
  };
}

function normalizeContracts(input: string[] | undefined): string[] {
  return [...new Set((input || []).map(v => v.trim()).filter(Boolean))];
}

function containsContract(devContracts: string, contract: string): boolean {
  const parts = devContracts
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  return parts.includes(contract);
}

function addContractToList(devContracts: string, contract: string): string {
  const parts = devContracts
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  if (!parts.includes(contract)) parts.push(contract);
  return parts.join(', ');
}

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

export const applyServerTables = (tablesIn: ServerIndex['tables']): void => {
  const now = Date.now();
  const tables: Table[] = tablesIn.map(t => ({
    id: t.id,
    name: t.name,
    notes: t.notes || '',
    at: now,
  }));

  wr(KEY_T, tables);
};

export const applyServerSchemasForTable = (
  tableId: string,
  serverSchemas: Array<{
    id: string;
    tableId: string;
    cableType: string;
    subtables?: number;
    notes?: string;
    contracts: Array<{ id: string }>;
  }>,
): void => {
  const now = Date.now();

  const schemas: Schema[] = serverSchemas.map(s => ({
    id: s.id,
    tableId: s.tableId,
    cableType: s.cableType,
    subtables: s.subtables ?? 5,
    contracts: normalizeContracts(s.contracts.map(c => c.id)),
    notes: s.notes || '',
    at: now,
  }));

  const keep = rd<Schema>(KEY_S).filter(s => s.tableId !== tableId);
  wr(KEY_S, [...keep, ...schemas]);
};

export const applyServerStructure = (index: ServerIndex): void => {
  applyServerTables(index.tables);
  if (Array.isArray(index.schemas)) {
    const byTable: Record<string, typeof index.schemas> = {};
    for (const s of index.schemas) {
      (byTable[s.tableId] ??= []).push(s);
    }
    Object.entries(byTable).forEach(([tableId, schemas]) => {
      applyServerSchemasForTable(tableId, schemas);
    });
  }
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

export const hasLocalContractData = (schemaId: string, contract: string): boolean => {
  if (!contract) return false;

  const hasWire = rd<Wire>(KEY_W).some(w => w.schemaId === schemaId && w.contract === contract);
  if (hasWire) return true;

  return rd<Device>(KEY_SK).some(
    d => d.schemaId === schemaId && !!d.contracts && containsContract(d.contracts, contract),
  );
};

export const ensureContractLoaded = async (
  schemaId: string,
  contract: string,
  file: string,
): Promise<'local' | 'server'> => {
  if (!schemaId || !contract || !file) throw new Error('Missing contract load parameters');
  if (hasLocalContractData(schemaId, contract)) return 'local';

  const payloads = await resolvePayloads(file);
  if (payloads.length === 0) throw new Error(`No contract payload data found in ${file}`);
  const now = Date.now();

  const schemas = rd<Schema>(KEY_S);
  const schemaIdx = schemas.findIndex(s => s.id === schemaId);
  if (schemaIdx >= 0 && !schemas[schemaIdx].contracts.includes(contract)) {
    schemas[schemaIdx] = {
      ...schemas[schemaIdx],
      contracts: [...schemas[schemaIdx].contracts, contract],
    };
    wr(KEY_S, schemas);
  }

  const ctypeList = rd<CType>(KEY_CT);
  const ctypeByName = new Map(ctypeList.map(c => [c.name.toUpperCase(), c]));
  const devList = rd<Device>(KEY_SK);
  const wireList = rd<Wire>(KEY_W);
  let ctypeChanged = false;
  let devChanged = false;
  let wireChanged = false;

  for (const rawPayload of payloads) {
    const payload =
      Array.isArray(rawPayload.sections) && rawPayload.sections.length > 0
        ? toContractPayloadFromDocPage(rawPayload, schemaId, contract) || rawPayload
        : rawPayload;

    if (Array.isArray(payload.ctypes)) {
      for (const row of payload.ctypes) {
        const name = (row.name || '').trim();
        if (!name) continue;
        const hit = ctypeByName.get(name.toUpperCase());
        if (!hit) {
          const created: CType = {
            id: row.id || uid(),
            name,
            pins: row.pins ?? null,
            description: row.description || '',
            svgConnector: row.svgConnector || '',
            svgPinout: row.svgPinout || '',
            at: now,
          };
          ctypeList.push(created);
          ctypeByName.set(created.name.toUpperCase(), created);
          ctypeChanged = true;
        }
      }
    }

    const inputDevices = Array.isArray(payload.devices)
      ? payload.devices
      : Array.isArray(payload.skon)
        ? payload.skon
        : [];
    for (const d of inputDevices) {
      const code = (d.code || '').trim();
      if (!code) continue;
      const idx = devList.findIndex(row => row.schemaId === schemaId && row.code === code);
      if (idx >= 0) {
        const prev = devList[idx];
        devList[idx] = {
          ...prev,
          typeId: d.typeId ?? prev.typeId,
          subtable: d.subtable ?? prev.subtable,
          section: d.section ?? prev.section,
          side: d.side ?? prev.side,
          notes: d.notes ?? prev.notes,
          accessories: Array.isArray(d.accessories) ? d.accessories : prev.accessories,
          contracts: addContractToList(prev.contracts || '', contract),
        };
      } else {
        devList.push({
          id: d.id || uid(),
          schemaId,
          code,
          typeId: d.typeId ?? null,
          subtable: d.subtable ?? null,
          section: d.section ?? null,
          side: d.side ?? null,
          notes: d.notes || '',
          contracts: addContractToList(d.contracts || '', contract),
          accessories: Array.isArray(d.accessories) ? d.accessories : [],
          at: now,
        });
      }
      devChanged = true;
    }

    if (Array.isArray(payload.wires)) {
      for (const w of payload.wires) {
        const wireRef = (w.wireRef || '').trim();
        if (!wireRef) continue;
        const idx = wireList.findIndex(row => row.schemaId === schemaId && row.wireRef === wireRef);
        const normalized: Wire = {
          id: w.id || (idx >= 0 ? wireList[idx].id : uid()),
          schemaId,
          wireRef,
          wireNum: w.wireNum || wireRef.split('-')[0] || wireRef,
          color: w.color || '',
          contract: w.contract || contract,
          page: w.page || '',
          pageTotal: w.pageTotal || '',
          docTimestamp: w.docTimestamp || '',
          docRev: w.docRev || '',
          pageOrder: w.pageOrder ?? 0,
          ends: Array.isArray(w.ends) ? w.ends : [],
          at: w.at || now,
        };

        if (idx >= 0) wireList[idx] = { ...wireList[idx], ...normalized };
        else wireList.push(normalized);
        wireChanged = true;
      }
    }
  }

  if (ctypeChanged) wr(KEY_CT, ctypeList);
  if (devChanged) wr(KEY_SK, devList);
  if (wireChanged) wr(KEY_W, wireList);

  return 'server';
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
