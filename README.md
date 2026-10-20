# Cable Plant

Small Vite + TypeScript SPA for importing wiring documentation into a local interactive assembly view.

## Stack

- Vite 5
- TypeScript
- No framework
- Data stored in `localStorage`
- UI rendered as HTML strings with handlers exposed on `window`

## Main entities

- `Table` — top-level group, display number like `64`
- `Schema` — cable/assembly type under a table, e.g. `H009`
- `Device` — connector/device placed on a table
- `Wire` — wire or cable core with page, color, ends, and import order
- `CType` — connector type metadata

## Data model notes

- `Schema` belongs to `Table` by `tableId`
- `Wire.wireRef` is the unique wire/core identifier used for upsert
- `Wire.pageOrder` preserves the order from the imported JSON page
- Data version includes migration to v8 with `Table` entity support

## Import format

### Assembly JSON

Used for full wiring detail from one page.

- `document.assembly` like `64-H009`
- `document.page` like `6/16`
- `sections[]`
- each `section` is one wire or one cable core group
- `rows[]` hold endpoints with `col`, `loc`, `device`, `pos`, `connector`, `zone`

Rules:

- normal wire: 2 rows
- cable: each color must appear exactly 2 times
- cable cores are stored as `BASE_REF:COLOR`

## Important behavior

- Wires list page groups are sorted by page number naturally: `1, 2, 3, ... 10`
- Within a page, order should match `pageOrder` from imported JSON
- Zone parsing accepts both `4-2 Haut` and `4-2 - BAS`

## Storage

Main keys in `localStorage`:

- `cp_table`
- `cp_schema`
- `cp_skon`
- `cp_ctype`
- `cp_wire`

## Server static catalog (read-only)

App boot flow now starts from static JSON served from `/public/data/index.json`:

- load only `tables` at app start
- when user opens a table, load that table's schemas/contracts from its table file
- user selects `table -> schema -> contract`
- on contract open, app checks local data first
- if no local data for that contract, app loads contract JSON from `contract.file`
- all further edits are local-only in browser storage

Contract JSON can be a multi-page manifest. This is useful when one contract has many pages (5, 20, etc.).

Manifest format (aggregates multiple page files):

```json
{
  "files": [
    "/data/contracts/64-h020-lg58-lg70-p01.json",
    "/data/contracts/64-h020-lg58-lg70-p02.json",
    "/data/contracts/64-h020-lg58-lg70-p03.json"
  ]
}
```

Each page file can contain `ctypes`, `devices` (or `skon`) and `wires` arrays. All pages are merged into local storage on first contract open.

`index.json` format (tables only):

```json
{
  "version": 1,
  "tables": [{ "id": "t64", "name": "64", "file": "/data/tables/t64.json" }]
}
```

Table file format:

```json
{
  "tableId": "t64",
  "schemas": [
    {
      "id": "t64-h020",
      "tableId": "t64",
      "cableType": "H020",
      "contracts": [
        { "id": "LG58-LG70", "rev": "A", "file": "/data/contracts/64-h020-lg58-lg70.json" }
      ]
    }
  ]
}
```

## Run

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Release note

Project no longer uses service worker / offline mode. It is intentionally online-only.
