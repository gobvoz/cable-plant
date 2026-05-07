import { esc } from '../utils';
import { allSchema, allDevice, allCtype } from '../db';

declare const __APP_VERSION__: string;

export function viewSettings(): string {
  const schemaCount = allSchema().length;
  const skonCount = allDevice().length;
  const ctypeCount = allCtype().length;
  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="go('home')">‹</button>
  <div class="hdr-title">Settings &amp; data</div>
</header>
<main class="main">
  <div class="card mb12">
    <div class="card-title">ℹ️ Statistics</div>
    <div class="txt-sm txt-muted mt8">
      ${schemaCount} cable plan${schemaCount !== 1 ? 's' : ''}
      · ${skonCount} device${skonCount !== 1 ? 's' : ''}
      · ${ctypeCount} type${ctypeCount !== 1 ? 's' : ''}
    </div>
  </div>
  <div class="card mb12">
    <div class="card-title">🔌 Connector types</div>
    <div class="txt-sm txt-muted mt4 mb12">${ctypeCount} type${ctypeCount !== 1 ? 's' : ''} in catalog</div>
    <button class="btn btn-ghost w-full" onclick="go('ctypes')">Manage types →</button>
  </div>
  <div class="card mb12">
    <div class="card-title">📤 Export data</div>
    <div class="txt-sm txt-muted mt4 mb12">JSON backup — all configs and connectors</div>
    <button class="btn btn-primary w-full" onclick="doExport()">Download JSON backup</button>
  </div>
  <div class="card mb12">
    <div class="card-title">📥 Import backup</div>
    <div class="txt-sm txt-muted mt4 mb12">⚠️ Replaces <b>all</b> current data</div>
    <input type="file" id="import-file" accept=".json" style="display:none" onchange="doImport(this)">
    <button class="btn btn-ghost w-full" onclick="document.getElementById('import-file').click()">Choose JSON file…</button>
  </div>
  <div class="card card-danger">
    <div class="card-title txt-danger">🗑 Clear all data</div>
    <div class="txt-sm txt-muted mt4 mb12">Irreversible action — use with caution</div>
    <button class="btn btn-danger w-full" onclick="doClear()">Clear all</button>
  </div>
  <div class="txt-sm txt-muted" style="text-align:center;padding:16px 0 8px">v${__APP_VERSION__}</div>
</main>`;
}

// esc used in template
void esc;
