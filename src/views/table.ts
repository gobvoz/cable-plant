import { S, go } from '../state';
import { esc } from '../utils';
import { getCatalogSchemas, getCatalogTables } from '../catalog';

export function viewTable(): string {
  const tableId = S.tableId || '';
  const table = getCatalogTables().find(t => t.id === tableId);
  if (!table) {
    go('home');
    return '';
  }

  const schemas = getCatalogSchemas(tableId);

  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="go('home')">‹</button>
  <div class="hdr-title">Table ${esc(table.name)}</div>
</header>
<main class="main">
  ${
    schemas.length === 0
      ? `<div class="empty-sm">No schemas found for this table</div>`
      : schemas
          .map(
            s => `
      <div class="config-card" onclick="go('contracts',{tableId:'${table.id}',schemaId:'${s.id}',selectedCon:null})">
        <div class="config-info">
          <div class="config-title">${esc(s.cableType)}</div>
          <div class="config-meta">${s.contracts.length} contract${s.contracts.length !== 1 ? 's' : ''}</div>
          ${s.notes ? `<div class="txt-sm txt-muted mt4">${esc(s.notes)}</div>` : ''}
        </div>
      </div>`,
          )
          .join('')
  }
</main>`;
}

void go;
