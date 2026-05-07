import { go } from '../state';
import { esc } from '../utils';
import { allTable, allSchema, deviceBySchema } from '../db';

export function viewHome(): string {
  const tables = allTable()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const schemas = allSchema();
  const schemasByTable: Record<string, typeof schemas> = {};
  for (const s of schemas) {
    (schemasByTable[s.tableId] ??= []).push(s);
  }

  return /* html */ `
<header class="hdr">
  <span class="hdr-icon">🔌</span>
  <div class="hdr-title">CablePlan</div>
  <button class="icon-btn" onclick="go('settings')" title="Settings">⚙️</button>
</header>
<main class="main">
  <button class="btn btn-primary w-full mb12" onclick="go('table-form',{editTableId:null})">
    + New table
  </button>
  ${
    tables.length === 0
      ? `<div class="empty-sm">No tables yet — add one to get started</div>`
      : tables
          .map(t => {
            const tableSchemas = (schemasByTable[t.id] ?? [])
              .slice()
              .sort((a, b) => a.cableType.localeCompare(b.cableType));
            return /* html */ `
        <div class="table-group">
          <div class="table-group-hdr">
            <span class="table-group-name">Table ${esc(t.name)}</span>
            ${t.notes ? `<span class="txt-sm txt-muted ml8">${esc(t.notes)}</span>` : ''}
            <div class="table-group-actions">
              <button class="icon-btn" title="Import document"
                onclick="go('import-doc',{schemaId:null})">📥</button>
              <button class="icon-btn" title="Edit table"
                onclick="go('table-form',{editTableId:'${t.id}'})">✏️</button>
              <button class="icon-btn danger" title="Delete table"
                onclick="delTableAction('${t.id}')">🗑</button>
            </div>
          </div>
          ${
            tableSchemas.length === 0
              ? `<div class="empty-sm ml16 mb8">No schemas yet</div>`
              : tableSchemas
                  .map(s => {
                    const devs = deviceBySchema(s.id);
                    const total = devs.length;
                    const unloc = devs.filter(k => !k.subtable).length;
                    const revs = s.contracts || [];
                    return /* html */ `
            <div class="config-card"
              onclick="go('schema',{schemaId:'${s.id}',tableId:'${t.id}',tab:'list',q:'',selectedCon:null})">
              <div class="config-info">
                <div class="config-title">${esc(s.cableType)}</div>
                <div class="config-meta">
                  ${total} device${total !== 1 ? 's' : ''}
                  ${unloc > 0 ? `&nbsp;·&nbsp;<span class="danger-inline">⚠️&nbsp;${unloc}&nbsp;unlocated</span>` : ''}
                  ${revs.length > 0 ? `&nbsp;·&nbsp;${revs.map(r => esc(r)).join(', ')}` : ''}
                </div>
                ${s.notes ? `<div class="txt-sm txt-muted mt4">${esc(s.notes)}</div>` : ''}
              </div>
              <div class="config-actions" onclick="event.stopPropagation()">
                <button class="icon-btn" title="Import document"
                  onclick="go('import-doc',{schemaId:'${s.id}',tableId:'${t.id}'})">📥</button>
                <button class="icon-btn" title="Edit schema"
                  onclick="go('schema-form',{editSchemaId:'${s.id}',tableId:'${t.id}'})">✏️</button>
                <button class="icon-btn danger" onclick="delSchema('${s.id}')">🗑</button>
              </div>
            </div>`;
                  })
                  .join('')
          }
          <button class="btn btn-ghost w-full mt4 mb4"
            onclick="go('schema-form',{editSchemaId:null,tableId:'${t.id}'})">
            + Add schema to Table ${esc(t.name)}
          </button>
        </div>`;
          })
          .join('')
  }
</main>`;
}

// go() referenced in inline onclick HTML
void go;
