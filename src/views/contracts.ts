import { S, go } from '../state';
import { esc } from '../utils';
import { getCatalogSchema, getCatalogTables, getSchemaContracts } from '../catalog';

export function viewContracts(): string {
  const tableId = S.tableId || '';
  const schemaId = S.schemaId || '';

  const table = getCatalogTables().find(t => t.id === tableId);
  const schema = getCatalogSchema(schemaId);

  if (!table || !schema) {
    go('home');
    return '';
  }

  const contracts = getSchemaContracts(schemaId);

  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="go('table',{tableId:'${tableId}'})">‹</button>
  <div class="hdr-title">${esc(table.name)} - ${esc(schema.cableType)}</div>
</header>
<main class="main">
  <div class="card mb12">
    <div class="card-title">Contracts & revisions</div>
    <div class="txt-sm txt-muted mt4">Select contract to open local working data.</div>
  </div>
  ${
    contracts.length === 0
      ? `<div class="empty-sm">No contracts configured for this schema</div>`
      : contracts
          .map(c => {
            const rev = c.rev ? ` · rev ${esc(c.rev)}` : '';
            const contractArg = encodeURIComponent(c.id);
            const fileArg = encodeURIComponent(c.file);
            return `<button class="btn btn-primary w-full mb8" onclick="openContractAction('${tableId}','${schemaId}','${contractArg}','${fileArg}')">${esc(c.id)}${rev}</button>`;
          })
          .join('')
  }
</main>`;
}

void go;
