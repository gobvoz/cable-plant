import type {
  ServerContract,
  ServerIndex,
  ServerSchema,
  ServerTable,
  ServerTableFile,
} from './types';
import { applyServerSchemasForTable, applyServerTables } from './db';

const INDEX_URL = '/data/index.json';
const CACHE_KEY = 'cp_server_catalog_cache_v2';

type CatalogCache = {
  index: ServerIndex;
  schemasByTable: Record<string, ServerSchema[]>;
};

let _loading = false;
let _error = '';
let _loadingTableId = '';
let _index: ServerIndex | null = null;
let _schemasByTable: Record<string, ServerSchema[]> = {};

function isServerContract(value: unknown): value is ServerContract {
  const row = value as Partial<ServerContract> | null;
  return !!row && typeof row.id === 'string' && typeof row.file === 'string';
}

function isServerSchema(value: unknown): value is ServerSchema {
  const row = value as Partial<ServerSchema> | null;
  return (
    !!row &&
    typeof row.id === 'string' &&
    typeof row.tableId === 'string' &&
    typeof row.cableType === 'string' &&
    Array.isArray(row.contracts) &&
    row.contracts.every(isServerContract)
  );
}

function isServerTable(value: unknown): value is ServerTable {
  const row = value as Partial<ServerTable> | null;
  return (
    !!row &&
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    (row.file === undefined || typeof row.file === 'string')
  );
}

function parseIndex(raw: unknown): ServerIndex {
  const data = raw as Partial<ServerIndex> | null;
  if (!data || !Array.isArray(data.tables)) {
    throw new Error('Invalid server index format');
  }

  const tables = data.tables.filter(isServerTable);
  if (tables.length !== data.tables.length) throw new Error('Invalid rows in index.tables');

  let schemas: ServerSchema[] | undefined;
  if (Array.isArray(data.schemas)) {
    const rows = data.schemas.filter(isServerSchema);
    if (rows.length !== data.schemas.length) throw new Error('Invalid rows in index.schemas');
    schemas = rows;
  }

  return {
    version: data.version ?? 'unknown',
    tables,
    schemas,
  };
}

function parseTableFile(raw: unknown): ServerTableFile {
  const data = raw as Partial<ServerTableFile> | null;
  if (!data || typeof data.tableId !== 'string' || !Array.isArray(data.schemas)) {
    throw new Error('Invalid table file format');
  }
  const schemas = data.schemas.filter(isServerSchema);
  if (schemas.length !== data.schemas.length) throw new Error('Invalid rows in table schemas');
  return { tableId: data.tableId, schemas };
}

function persistCache(): void {
  if (!_index) return;
  const payload: CatalogCache = {
    index: _index,
    schemasByTable: _schemasByTable,
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* cache write best effort */
  }
}

function readCache(): CatalogCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogCache>;
    if (!parsed || !parsed.index) return null;

    const index = parseIndex(parsed.index as unknown);
    const schemasByTable: Record<string, ServerSchema[]> = {};
    if (parsed.schemasByTable && typeof parsed.schemasByTable === 'object') {
      Object.entries(parsed.schemasByTable).forEach(([tableId, schemas]) => {
        if (!Array.isArray(schemas)) return;
        const rows = schemas.filter(isServerSchema);
        if (rows.length === schemas.length) schemasByTable[tableId] = rows;
      });
    }

    return { index, schemasByTable };
  } catch {
    return null;
  }
}

function upsertSchemas(tableId: string, schemas: ServerSchema[]): void {
  _schemasByTable[tableId] = schemas.slice().sort((a, b) => a.cableType.localeCompare(b.cableType));
  applyServerSchemasForTable(tableId, _schemasByTable[tableId]);
}

function tableFileUrl(table: ServerTable): string {
  if (table.file && table.file.trim()) return table.file.trim();
  const safeId = encodeURIComponent(table.id);
  return `/data/tables/${safeId}.json`;
}

export function getCatalogStatus(): {
  loading: boolean;
  error: string;
  version: string;
  loadingTableId: string;
} {
  return {
    loading: _loading,
    error: _error,
    version: _index ? String(_index.version) : '',
    loadingTableId: _loadingTableId,
  };
}

export function getCatalogTables(): ServerTable[] {
  if (!_index) return [];
  return _index.tables
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function getCatalogSchemas(tableId: string): ServerSchema[] {
  return (_schemasByTable[tableId] || []).slice();
}

export function getCatalogSchema(schemaId: string): ServerSchema | null {
  const rows = Object.values(_schemasByTable).flat();
  return rows.find(s => s.id === schemaId) ?? null;
}

export function getSchemaContracts(schemaId: string): ServerContract[] {
  const schema = getCatalogSchema(schemaId);
  return schema ? schema.contracts : [];
}

export async function loadServerCatalog(force = false): Promise<void> {
  if (_loading) return;
  if (_index && !force) return;

  _loading = true;
  _error = '';
  _loadingTableId = '';

  try {
    const resp = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const parsed = parseIndex((await resp.json()) as unknown);

    _index = parsed;
    _schemasByTable = {};
    applyServerTables(parsed.tables);

    if (Array.isArray(parsed.schemas)) {
      const grouped: Record<string, ServerSchema[]> = {};
      parsed.schemas.forEach(s => {
        (grouped[s.tableId] ??= []).push(s);
      });
      Object.entries(grouped).forEach(([tableId, schemas]) => upsertSchemas(tableId, schemas));
    }

    persistCache();
  } catch (e) {
    const cached = readCache();
    if (cached) {
      _index = cached.index;
      _schemasByTable = cached.schemasByTable;
      applyServerTables(_index.tables);
      Object.entries(_schemasByTable).forEach(([tableId, schemas]) => {
        applyServerSchemasForTable(tableId, schemas);
      });
      _error = 'Server catalog unavailable; using cached copy.';
    } else {
      _error = `Catalog load failed: ${(e as Error).message || 'unknown error'}`;
    }
  } finally {
    _loading = false;
  }
}

export async function ensureTableSchemasLoaded(tableId: string, force = false): Promise<void> {
  if (!_index) await loadServerCatalog();
  if (!_index) throw new Error('Catalog not loaded');

  if (!force && _schemasByTable[tableId]) return;

  const table = _index.tables.find(t => t.id === tableId);
  if (!table) throw new Error(`Unknown table ${tableId}`);

  _loading = true;
  _loadingTableId = tableId;
  _error = '';

  try {
    const resp = await fetch(tableFileUrl(table), { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const parsed = parseTableFile((await resp.json()) as unknown);
    if (parsed.tableId !== tableId) {
      throw new Error(`Table file mismatch: expected ${tableId}, got ${parsed.tableId}`);
    }

    upsertSchemas(tableId, parsed.schemas);
    persistCache();
  } catch (e) {
    if (!_schemasByTable[tableId]) {
      throw new Error(`Failed to load table ${tableId}: ${(e as Error).message || 'error'}`);
    }
    _error = `Table ${tableId} refresh failed; using cached schemas.`;
  } finally {
    _loadingTableId = '';
    _loading = false;
  }
}
