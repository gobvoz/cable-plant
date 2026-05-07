export interface Table {
  id: string;
  /** Display number, e.g. "64" */
  name: string;
  notes: string;
  at: number;
}

export interface Schema {
  id: string;
  tableId: string;
  /** Schema / cable type identifier, e.g. "H019" */
  cableType: string;
  subtables: number;
  contracts: string[];
  notes: string;
  at: number;
}

/** A physical connector / device on the assembly table */
export interface Device {
  id: string;
  schemaId: string;
  /** Full code = loc + '-' + device, e.g. "EN-X64B" */
  code: string;
  typeId: string | null;
  subtable: number | null;
  section: number | null;
  side: 'Haut' | 'Bas' | null;
  notes: string;
  /** Comma-separated contract numbers this device belongs to */
  contracts: string;
  accessories: string[];
  at: number;
}

export interface CType {
  id: string;
  name: string;
  pins: number | null;
  description: string;
  svgConnector: string;
  svgPinout: string;
  at: number;
}

export interface WireEnd {
  loc: string;
  device: string;
  /** loc + '-' + device */
  code: string;
  pos: string;
  typeRef: string;
  zone: string;
  subtable: number | null;
  section: number | null;
  side: string | null;
}

export interface Wire {
  id: string;
  schemaId: string;
  /** Full reference e.g. "2938-H015" */
  wireRef: string;
  /** Numeric part before '-' e.g. "2938" */
  wireNum: string;
  color: string;
  contract: string;
  /** Document page identifier, e.g. "LG01 H019" */
  page: string;
  /** Total pages from header.page, e.g. "2" from "1/2" */
  pageTotal?: string;
  /** Source document timestamp from header */
  docTimestamp?: string;
  /** Optional document revision from header */
  docRev?: string;
  /** Position index within the imported page (preserves document order) */
  pageOrder: number;
  ends: WireEnd[];
  at: number;
}

export interface Assembly {
  schemaId: string;
  startedAt: string;
  /** Whether assembly session is currently active (cards clickable) */
  active: boolean;
  /** IDs of wires marked as assembled */
  done: string[];
}

export interface AppState {
  view: string;
  tableId: string | null;
  editTableId: string | null;
  schemaId: string | null;
  editSchemaId: string | null;
  editCtypeId: string | null;
  skonId: string | null;
  tab: string;
  q: string;
  wireQ: string;
  /** Selected page filter for Wires tab (null = all pages) */
  wirePage: string | null;
  modal: string | null;
  prefill: { subtable: number; section: number; side: string } | null;
  selectedCon: string | null;
  filterAcc: string[];
}

export interface ViewCtx {
  formView: string;
  idProp: string;
  id: string;
  konIdProp: string;
  subtables: number;
  returnView?: string;
  returnId?: string;
}

/** Raw JSON from ChatGPT document extraction */
export interface DocItem {
  pre_middle: string;
  col: string;
  loc: string;
  device: string;
  pos: string;
  connector: string;
  zone: string;
}

export interface DocRow {
  col?: string;
  loc?: string;
  device?: string;
  pos?: string;
  connector?: string;
  zone?: string;
}

export interface DocSection {
  section: string;
  rows: DocRow[];
}

export interface DocJson {
  document:
    | string
    | {
        title?: string;
        assembly?: string;
        quantity?: number;
        page?: string;
        timestamp?: string;
        rev?: string;
      };
  page?: string;
  items?: DocItem[];
  sections?: DocSection[];
}

export interface ImportResult {
  devNew: number;
  devUpd: number;
  wireNew: number;
  wireUpd: number;
}

/** One entry in a kitting sheet: wire/cable ref + assembly page reference */
export interface KittingEntry {
  /** Wire or cable reference, e.g. "2938-H015" */
  ref: string;
  /** Assembly page where the full wiring detail is found, e.g. "3" */
  page?: string;
}

/** JSON format produced by ChatGPT from a kitting (contents) sheet */
export interface KittingJson {
  document: {
    /** Document title line, e.g. "N63015019 (LG58-LG70)" */
    title?: string;
    /** Schema identifier from header, e.g. "64-H009" */
    kitting?: string;
    /** Total number of assembly pages referenced, e.g. 16 */
    pages?: number;
    /** Quantity from Qt. field */
    quantity?: number;
    /** Rev. letter if present */
    rev?: string;
  };
  items: KittingEntry[];
}
