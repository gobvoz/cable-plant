import { S, go } from '../state';
import { esc, toast } from '../utils';
import {
  allTable,
  allSchema,
  getSchema,
  deviceBySchema,
  addDevice,
  updDevice,
  updSchema,
  allCtype,
  addCtype,
  addWire,
  updWire,
  wireBySchema,
} from '../db';
import type { DocJson, DocItem, DocRow, DocSection, ImportResult, KittingJson } from '../types';

function buildChatGptPrompt(): string {
  return `You are extracting wiring data from ONE document page image.

Return valid JSON in this exact format:
{
  "document": {
    "title": "N63015019 (LG58-LG70)",
    "assembly": "15-H001",
    "quantity": 12,
    "page": "2/2",
    "timestamp": "2026-01-19 10:04:26",
    "rev": "A"
  },
  "sections": [
    {
      "section": "022-H001",
      "rows": [
        { "col": "WH", "loc": "XT1", "device": "X15BP4", "pos": "5", "connector": "N77182", "zone": "1-2 Haut"},
        { "col": "WH", "loc": "XT1", "device": "X15BP4", "pos": "8", "connector": "N77182", "zone": "1-2 Haut"}
      ]
    }
  ]
}

Rules:
1) Keep keys exactly: document.title, document.assembly, document.quantity, document.page, document.timestamp, document.rev, sections, section, rows, col, loc, device, pos, connector, zone.
2) Use one section per wire or cable block from the document.
3) Inside rows, preserve top-to-bottom order from the page.
4) If a value is missing, use empty string "".
5) Keep all text in UPPERCASE when possible.
6) document.assembly should be like "15-H001" if visible; otherwise "".
7) document.page should be like "2/2" if visible; otherwise "".
8) document.quantity must be number if visible, otherwise 0.
9) document.rev may be empty string if absent.`;
}

function buildKittingPrompt(): string {
  return `You are extracting a kitting (contents) sheet from a document page image.

The sheet header looks like:
  Line 1: "N63015019 (LG58-LG70)"          <- document title
  Line 2: "Kitting 16 Pages 64-H009 Qt.8"  <- kitting meta; Rev may be absent

The body is a table where columns come in pairs:
  - ODD  column: wire/cable reference (e.g. "022-H001", "CAB1-H001")
  - EVEN column: assembly page number for that ref (e.g. "3")

Read all column-pairs left-to-right and flatten into a single items array.

IMPORTANT scanning method (must follow strictly):
- Process the table row by row from TOP to BOTTOM.
- For each row, process ALL column-pairs from LEFT to RIGHT until the end of row.
- For each non-empty ref in an odd column, read page from the paired even column.
- Do not stop early: continue until the very last visible table row.
- Never skip right-side blocks (2000-, 5000-, CAB- series etc.).

Return valid JSON in this exact format:
{
  "document": {
    "title": "N63015019 (LG58-LG70)",
    "kitting": "64-H009",
    "pages": 16,
    "quantity": 8,
    "rev": ""
  },
  "items": [
    { "ref": "022-H001", "page": "3" },
    { "ref": "CAB1-H001", "page": "4" }
  ]
}

Rules:
1) Keep keys exactly: document.title, document.kitting, document.pages, document.quantity, document.rev, items, ref, page.
2) Flatten all column-pairs left-to-right, top-to-bottom into a single items array.
3) "ref" — wire or cable reference from the odd column, e.g. "022-H001". Keep UPPERCASE.
4) "page" — assembly page number from the paired even column, as a string, e.g. "3".
5) document.kitting — schema identifier like "64-H009" from header line 2.
6) document.pages — integer total assembly pages ("16 Pages" -> 16).
7) document.quantity — integer from "Qt.N" field.
8) document.rev — revision letter if present, else empty string.
9) If a value is missing, use empty string or 0.
10) Before final output, self-check:
  - every processed row includes all visible column-pairs;
  - no truncated ending in the middle of table;
  - items include the last visible rows at the bottom-right.
11) If the full JSON does not fit in one response, split into multiple valid JSON chunks with the SAME document object and partial items arrays.
12) For chunked output, each response must be valid JSON and include only non-duplicate items; user will merge by importing chunks sequentially.`;
}

function parseKittingJson(
  doc: KittingJson,
  schemaId: string,
): { wireNew: number; wireUpd: number } {
  const header = doc.document || {};
  const contract = extractContractFromTitle(header.title || '');
  addContractToSchema(schemaId, contract);

  const wires = wireBySchema(schemaId);
  const wireByRef = Object.fromEntries(wires.map(w => [w.wireRef, w]));

  let wireNew = 0;
  let wireUpd = 0;
  let orderIdx = Object.keys(wireByRef).length;

  for (const entry of doc.items || []) {
    const wireRef = (entry.ref || '').trim().toUpperCase();
    if (!wireRef) continue;

    const page = (entry.page || '').trim();
    const wireNum = wireRef.split('-')[0] ?? wireRef;

    const wireData = {
      schemaId,
      wireRef,
      wireNum,
      color: '' as string,
      contract,
      page,
      pageTotal: '',
      docTimestamp: '',
      docRev: header.rev || '',
      pageOrder: orderIdx++,
      ends: [] as [],
    };

    if (wireByRef[wireRef]) {
      const existing = wireByRef[wireRef];
      // Do not overwrite detailed assembly data with kitting placeholders.
      if ((existing.ends || []).length > 0) {
        if (!existing.page && page) {
          updWire(existing.id, { page, contract: existing.contract || contract });
          wireByRef[wireRef] = { ...existing, page, contract: existing.contract || contract };
          wireUpd++;
        }
      } else {
        const patch: typeof wireData = { ...wireData, pageOrder: existing.pageOrder };
        updWire(existing.id, patch);
        wireByRef[wireRef] = { ...existing, ...patch };
        wireUpd++;
      }
    } else {
      const w = addWire(wireData);
      wireByRef[wireRef] = w;
      wireNew++;
    }
  }

  return { wireNew, wireUpd };
}

export function importKittingAction(): void {
  const raw = ((document.getElementById('f-kitting-json') as HTMLTextAreaElement)?.value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
  if (!raw) {
    toast('Warning: paste kitting JSON first');
    return;
  }

  let doc: KittingJson;
  try {
    doc = JSON.parse(raw) as KittingJson;
  } catch {
    toast('Error: invalid JSON');
    return;
  }

  if (!Array.isArray(doc.items) || doc.items.length === 0) {
    toast('Error: items array missing or empty');
    return;
  }

  let schemaId = (document.getElementById('f-import-schema') as HTMLSelectElement)?.value ?? '';

  if (!schemaId) {
    // Auto-detect from kitting field (same pattern as assembly)
    const kitStr = (doc.document?.kitting || '').replace(/\u2013/g, '-').replace(/\u2014/g, '-');
    const m = kitStr.match(/\b(\d+)-(H\d+)\b/i);
    if (m) {
      const allSchemas = allSchema();
      const allTables = allTable();
      const matchTable = allTables.find(t => t.name === m[1]);
      if (matchTable) {
        const matchSchema = allSchemas.find(
          s => s.tableId === matchTable.id && s.cableType === m[2].toUpperCase(),
        );
        if (matchSchema) {
          schemaId = matchSchema.id;
          toast(`Detected target: Table ${m[1]} - ${m[2].toUpperCase()}`);
        }
      }
    }
  }

  if (!schemaId) {
    toast('Warning: select schema or provide kitting field like "64-H015"');
    return;
  }

  const schema = getSchema(schemaId);
  if (!schema) {
    toast('Error: schema not found');
    return;
  }

  try {
    const r = parseKittingJson(doc, schemaId);
    toast(`Kitting imported: ${r.wireNew} new wires, ${r.wireUpd} updated`);
    go('schema', { schemaId, tab: 'wires' });
  } catch (e) {
    toast(`Error: ${(e as Error).message ?? 'parse error'}`);
  }
}

export function viewImportDoc(): string {
  const tables = allTable()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const schemas = allSchema();

  const preSchemaId = S.schemaId ?? '';
  const backTarget = preSchemaId ? `go('schema',{schemaId:'${preSchemaId}'})` : `go('home')`;

  const schemasByTable: Record<string, typeof schemas> = {};
  for (const s of schemas) {
    (schemasByTable[s.tableId] ??= []).push(s);
  }

  const optgroups = tables
    .map(t => {
      const opts = (schemasByTable[t.id] ?? [])
        .slice()
        .sort((a, b) => a.cableType.localeCompare(b.cableType))
        .map(
          s =>
            `<option value="${s.id}"${s.id === preSchemaId ? ' selected' : ''}>${esc(s.cableType)}</option>`,
        )
        .join('');
      return opts ? `<optgroup label="Table ${esc(t.name)}">${opts}</optgroup>` : '';
    })
    .join('');

  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="${backTarget}"><</button>
  <div class="hdr-title">Import document page</div>
</header>
<main class="main">
  <div class="card mb12">
    <div class="card-title">Target</div>
    <div class="form-group mt8">
      <label>Schema</label>
      <select id="f-import-schema">
        <option value="">-- auto-detect from JSON --</option>
        ${optgroups}
      </select>
    </div>
    <div class="form-group">
      <label>Page <span class="txt-muted">(optional override if JSON has no page)</span></label>
      <input id="f-import-page" type="text" placeholder="e.g. 3" autocomplete="off" inputmode="numeric">
    </div>
  </div>

  <div class="card mb12">
    <div class="card-title">Prompt for ChatGPT</div>
    <textarea rows="14" class="mono" readonly>${esc(buildChatGptPrompt())}</textarea>
  </div>

  <div class="card mb12">
    <div class="card-title">Document JSON</div>
    <div class="txt-sm txt-muted mt4 mb12">
      Paste JSON produced by ChatGPT using the prompt above.
      Existing devices and wires are updated; new ones are added.
    </div>
    <textarea id="f-import-json" rows="12" class="mono"
      placeholder='{"document":{"title":"N... (LG58-LG70)","assembly":"15-H001","page":"2/2"},"sections":[...]}'></textarea>
    <button class="btn btn-primary w-full mt12" onclick="importDocAction()">
      Import page
    </button>
  </div>

  <div class="card mb12">
    <div class="card-title">Kitting JSON</div>
    <div class="txt-sm txt-muted mt4 mb12">
      Kitting sheet — list of wires/cables with page references only.
      Creates wires without endpoint detail; page numbers show where to find full assembly info.
    </div>
    <div class="form-group mb8">
      <label>Prompt for ChatGPT</label>
      <textarea rows="10" class="mono" readonly>${esc(buildKittingPrompt())}</textarea>
    </div>
    <textarea id="f-kitting-json" rows="10" class="mono"
      placeholder='{"document":{"kitting":"15-H001","page":"1/2"},"items":[{"ref":"022-H001","col":"WH","page":"3"}]}'></textarea>
    <button class="btn btn-secondary w-full mt12" onclick="importKittingAction()">
      Import kitting
    </button>
  </div>

  <button class="btn btn-ghost w-full" onclick="${backTarget}">Cancel</button>
</main>`;
}

function parseZone(
  zone: string,
): { subtable: number; section: number; side: 'Haut' | 'Bas' } | null {
  if (!zone) return null;
  const m = zone.trim().match(/^(\d+)\s*-\s*(\d+)\s+(?:-\s*)?(Haut|Bas)\s*$/i);
  if (!m) return null;
  return {
    subtable: parseInt(m[1], 10),
    section: parseInt(m[2], 10),
    side: (m[3].charAt(0).toUpperCase() + m[3].slice(1).toLowerCase()) as 'Haut' | 'Bas',
  };
}

function getDocHeader(doc: DocJson): {
  title: string;
  assembly: string;
  page: string;
  timestamp: string;
  rev: string;
} {
  if (typeof doc.document === 'string') {
    return {
      title: '',
      assembly: doc.document,
      page: doc.page || '',
      timestamp: '',
      rev: '',
    };
  }

  return {
    title: doc.document.title || '',
    assembly: doc.document.assembly || '',
    page: doc.document.page || doc.page || '',
    timestamp: doc.document.timestamp || '',
    rev: doc.document.rev || '',
  };
}

function extractContractFromTitle(title: string): string {
  const inParens = title.match(/\(([^)]*LG[^)]*)\)/i);
  if (inParens?.[1]) return inParens[1].replace(/\s+/g, '').toUpperCase();

  const fallback = title.match(/LG\d+(?:\s*-\s*LG?\d+)?/i);
  return fallback?.[0]?.replace(/\s+/g, '').toUpperCase() || '';
}

function splitPage(pageRaw: string): { page: string; pageTotal: string } {
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

function normalizeRow(sectionName: string, row: DocRow): DocItem {
  return {
    pre_middle: sectionName,
    col: (row.col || '').trim().toUpperCase(),
    loc: (row.loc || '').trim().toUpperCase(),
    device: (row.device || '').trim().toUpperCase(),
    pos: (row.pos || '').trim().toUpperCase(),
    connector: (row.connector || '').trim().toUpperCase(),
    zone: (row.zone || '').trim(),
  };
}

function normalizeSectionRows(section: DocSection): DocItem[] {
  const sectionName = (section.section || '').trim().toUpperCase();
  const rows = Array.isArray(section.rows) ? section.rows : [];
  if (!sectionName || rows.length === 0) return [];
  if (rows.length < 2) throw new Error(`section ${sectionName} must have at least 2 rows`);

  if (rows.length === 2) {
    const c0 = (rows[0].col || '').trim().toUpperCase();
    const c1 = (rows[1].col || '').trim().toUpperCase();
    if (c0 && c1 && c0 !== c1) {
      throw new Error(`section ${sectionName} has mismatched endpoint colors: ${c0}/${c1}`);
    }
    return rows.map(row => normalizeRow(sectionName, row));
  }

  const byColor = new Map<string, DocRow[]>();
  for (const row of rows) {
    const colorKey = (row.col || '').trim().toUpperCase();
    if (!colorKey) throw new Error(`section ${sectionName} has cable rows without color`);
    if (!byColor.has(colorKey)) byColor.set(colorKey, []);
    byColor.get(colorKey)!.push(row);
  }

  const items: DocItem[] = [];
  for (const [colorKey, colorRows] of byColor.entries()) {
    if (colorRows.length !== 2) {
      throw new Error(
        `section ${sectionName} must have exactly 2 rows per color; ${colorKey} has ${colorRows.length}`,
      );
    }
    for (const row of colorRows) items.push(normalizeRow(`${sectionName}:${colorKey}`, row));
  }

  return items;
}

function normalizeItems(doc: DocJson): DocItem[] {
  if (Array.isArray(doc.items) && doc.items.length > 0) {
    return doc.items.map(item => ({
      pre_middle: (item.pre_middle || '').trim().toUpperCase(),
      col: (item.col || '').trim().toUpperCase(),
      loc: (item.loc || '').trim().toUpperCase(),
      device: (item.device || '').trim().toUpperCase(),
      pos: (item.pos || '').trim().toUpperCase(),
      connector: (item.connector || '').trim().toUpperCase(),
      zone: (item.zone || '').trim(),
    }));
  }

  if (Array.isArray(doc.sections) && doc.sections.length > 0) {
    return doc.sections.flatMap(normalizeSectionRows);
  }

  return [];
}

function parseDocumentJson(doc: DocJson, schemaId: string, pageOverride: string): ImportResult {
  const items = normalizeItems(doc);
  if (!items.length) throw new Error('sections/items missing');

  const header = getDocHeader(doc);
  const contract = extractContractFromTitle(header.title);
  addContractToSchema(schemaId, contract);
  const rawPage = header.page || pageOverride;
  const pageInfo = splitPage(rawPage);

  const ctypes = allCtype();
  const ctypeByName = Object.fromEntries(ctypes.map(t => [t.name.toUpperCase(), t.id]));
  const existing = deviceBySchema(schemaId);
  const devByCode = Object.fromEntries(existing.map(d => [d.code, d]));
  const wires = wireBySchema(schemaId);
  const wireByRef = Object.fromEntries(wires.map(w => [w.wireRef, w]));

  let devNew = 0;
  let devUpd = 0;
  let wireNew = 0;
  let wireUpd = 0;

  const wireGroups: Record<string, DocItem[]> = {};
  const wireOrder: Record<string, number> = {};
  let orderIdx = 0;
  for (const item of items) {
    const ref = item.pre_middle?.trim();
    if (!ref) continue;
    if (!wireGroups[ref]) {
      wireGroups[ref] = [];
      wireOrder[ref] = orderIdx++;
    }
    wireGroups[ref].push(item);
  }

  for (const [wireRef, items] of Object.entries(wireGroups)) {
    const wireNum = wireRef.split('-')[0] ?? wireRef;

    for (const item of items) {
      const code = buildDeviceCode(item.loc, item.device);

      const ctName = (item.connector || '').trim().toUpperCase();
      let typeId: string | null = null;
      if (ctName) {
        if (ctypeByName[ctName]) {
          typeId = ctypeByName[ctName];
        } else {
          const newCt = addCtype({
            name: item.connector.trim(),
            pins: null,
            description: '',
            svgConnector: '',
            svgPinout: '',
          });
          ctypeByName[ctName] = newCt.id;
          typeId = newCt.id;
        }
      }

      const zone = parseZone(item.zone || '');
      if (devByCode[code]) {
        const dev = devByCode[code];
        const patch: Partial<typeof dev> = {};
        if (typeId && !dev.typeId) patch.typeId = typeId;
        if (zone && dev.subtable == null) patch.subtable = zone.subtable;
        if (zone && dev.section == null) patch.section = zone.section;
        if (zone && dev.side == null) patch.side = zone.side;
        if (contract) {
          const existing = dev.contracts
            ? dev.contracts
                .split(',')
                .map(c => c.trim())
                .filter(Boolean)
            : [];
          if (!existing.includes(contract)) {
            patch.contracts = [...existing, contract].join(', ');
          }
        }
        if (Object.keys(patch).length) {
          updDevice(dev.id, patch);
          devByCode[code] = { ...dev, ...patch };
          devUpd++;
        }
      } else {
        const d = addDevice({
          schemaId,
          code,
          typeId,
          subtable: zone?.subtable ?? null,
          section: zone?.section ?? null,
          side: zone?.side ?? null,
          notes: '',
          contracts: contract,
          accessories: [],
        });
        devByCode[code] = d;
        devNew++;
      }
    }

    const ends = items.map(item => {
      const z = parseZone(item.zone || '');
      return {
        loc: item.loc,
        device: item.device,
        code: buildDeviceCode(item.loc, item.device),
        pos: item.pos || '',
        typeRef: item.connector || '',
        zone: item.zone || '',
        subtable: z?.subtable ?? null,
        section: z?.section ?? null,
        side: z?.side ?? null,
      };
    });

    const color = items.map(i => (i.col || '').trim()).find(c => c) || '';
    const wireData = {
      schemaId,
      wireRef,
      wireNum,
      color,
      contract,
      page: pageInfo.page,
      pageTotal: pageInfo.pageTotal,
      docTimestamp: header.timestamp,
      docRev: header.rev,
      pageOrder: wireOrder[wireRef] ?? 0,
      ends,
    };

    if (wireByRef[wireRef]) {
      updWire(wireByRef[wireRef].id, wireData);
      wireByRef[wireRef] = { ...wireByRef[wireRef], ...wireData };
      wireUpd++;
      continue;
    }

    // If kitting created a placeholder base ref (e.g. "CAB064-H009"),
    // the first detailed color import (e.g. "CAB064-H009:WH") should reuse it
    // instead of creating a duplicate entry.
    const baseRef = wireRef.includes(':') ? wireRef.split(':')[0] : '';
    const base = baseRef ? wireByRef[baseRef] : undefined;
    const canReuseBase =
      !!base && (!base.color || !base.color.trim()) && (!base.ends || base.ends.length === 0);

    if (canReuseBase && base) {
      const patch = { ...wireData };
      updWire(base.id, patch);
      delete wireByRef[baseRef];
      wireByRef[wireRef] = { ...base, ...patch };
      wireUpd++;
    } else {
      const w = addWire(wireData);
      wireByRef[wireRef] = w;
      wireNew++;
    }
  }

  return { devNew, devUpd, wireNew, wireUpd };
}

function addContractToSchema(schemaId: string, contract: string): void {
  if (!contract) return;
  const schema = getSchema(schemaId);
  if (!schema) return;
  const existing = schema.contracts || [];
  if (!existing.includes(contract)) {
    updSchema(schemaId, { contracts: [...existing, contract] });
  }
}

function detectDocSchema(doc: DocJson): { tableNum: string; cableType: string } | null {
  const header = getDocHeader(doc);
  const docStrRaw = header.assembly;
  const docStr = docStrRaw.replace(/\u2013/g, '-').replace(/\u2014/g, '-');
  const m = docStr.match(/\b(\d+)-(H\d+)\b/i);
  if (!m) return null;
  return { tableNum: m[1], cableType: m[2].toUpperCase() };
}

export function importDocAction(): void {
  const raw = ((document.getElementById('f-import-json') as HTMLTextAreaElement)?.value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
  if (!raw) {
    toast('Warning: paste JSON first');
    return;
  }

  const pageOverride = (
    (document.getElementById('f-import-page') as HTMLInputElement)?.value ?? ''
  ).trim();

  let doc: DocJson;
  try {
    doc = JSON.parse(raw) as DocJson;
  } catch {
    toast('Error: invalid JSON');
    return;
  }

  let schemaId = (document.getElementById('f-import-schema') as HTMLSelectElement)?.value ?? '';

  if (!schemaId) {
    const detected = detectDocSchema(doc);
    if (detected) {
      const allSchemas = allSchema();
      const allTables = allTable();
      const matchTable = allTables.find(t => t.name === detected.tableNum);
      if (matchTable) {
        const matchSchema = allSchemas.find(
          s => s.tableId === matchTable.id && s.cableType === detected.cableType,
        );
        if (matchSchema) {
          schemaId = matchSchema.id;
          toast(`Detected target: Table ${detected.tableNum} - ${detected.cableType}`);
        }
      }
    }
  }

  if (!schemaId) {
    toast('Warning: select schema or provide document like 64-H015');
    return;
  }

  const schema = getSchema(schemaId);
  if (!schema) {
    toast('Error: schema not found');
    return;
  }

  // If assembly header exists, verify it matches selected schema.
  const detected = detectDocSchema(doc);
  if (detected) {
    const schemaTable = allTable().find(t => t.id === schema.tableId);
    const selectedTableNum = schemaTable?.name || '';
    const selectedCableType = schema.cableType.toUpperCase();
    if (selectedTableNum !== detected.tableNum || selectedCableType !== detected.cableType) {
      toast(
        `Error: assembly ${detected.tableNum}-${detected.cableType} does not match selected ${selectedTableNum}-${selectedCableType}`,
      );
      return;
    }
  }

  try {
    const r = parseDocumentJson(doc, schemaId, pageOverride);
    toast(`Imported: ${r.devNew} new devices, ${r.wireNew} new wires`);
    go('schema', { schemaId, tab: 'wires' });
  } catch (e) {
    const msg = (e as Error).message ?? 'parse error';
    toast(`Error: ${msg}`);
    console.error('importDocAction error:', e, '\nraw (first 200):', raw.slice(0, 200));
  }
}
