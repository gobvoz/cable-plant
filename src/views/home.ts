import { go } from '../state';
import { esc } from '../utils';
import { getCatalogStatus, getCatalogTables } from '../catalog';

export function viewHome(): string {
  const tables = getCatalogTables();
  const status = getCatalogStatus();

  return /* html */ `
<header class="hdr">
  <span class="hdr-icon">🔌</span>
  <div class="hdr-title">CablePlan</div>
  <button class="icon-btn" onclick="reloadCatalogAction()" title="Reload catalog">🔄</button>
  <button class="icon-btn" onclick="go('settings')" title="Settings">⚙️</button>
</header>
<main class="main">
  ${status.loading ? `<div class="empty-sm mb12">Loading server catalog...</div>` : ''}
  ${status.error ? `<div class="empty-sm mb12">${esc(status.error)}</div>` : ''}
  ${
    tables.length === 0
      ? `<div class="empty-sm">No tables in server catalog</div>`
      : tables
          .map(
            t => `
        <div class="config-card" onclick="openTableAction('${t.id}')">
          <div class="config-info">
            <div class="config-title">Table ${esc(t.name)}</div>
            ${t.notes ? `<div class="config-meta">${esc(t.notes)}</div>` : ''}
          </div>
        </div>`,
          )
          .join('')
  }
</main>`;
}

// go() referenced in inline onclick HTML
void go;
