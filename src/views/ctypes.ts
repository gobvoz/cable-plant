import { S, go } from '../state';
import { esc, val, toast } from '../utils';
import { allCtype, getCtype, addCtype, updCtype, delCtype } from '../db';

/* ── List ─────────────────────────────────────────────────────── */
export function viewCtypes(): string {
  const types = allCtype();
  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="go('settings')">‹</button>
  <div class="hdr-title">Connector types</div>
</header>
<main class="main">
  <button class="btn btn-primary w-full mb12" onclick="go('ctype-form',{editCtypeId:null})">+ New type</button>
  ${
    types.length === 0
      ? `<div class="empty-sm">No types yet — add one to get started</div>`
      : types
          .map(
            t => /* html */ `
    <div class="config-card" onclick="go('ctype-form',{editCtypeId:'${t.id}'})">
      <div class="config-info">
        <div class="config-title">${esc(t.name)}${t.pins ? `<span class="pin-badge ml">${t.pins}p</span>` : ''}</div>
        ${t.description ? `<div class="config-meta">${esc(t.description.slice(0, 60))}${t.description.length > 60 ? '…' : ''}</div>` : ''}
      </div>
      <div class="config-actions" onclick="event.stopPropagation()">
        <button class="icon-btn danger" onclick="delCtypeAction('${t.id}')">🗑</button>
      </div>
    </div>`,
          )
          .join('')
  }
</main>`;
}

/* ── Form ─────────────────────────────────────────────────────── */
export function viewCtypeForm(): string {
  const isEdit = !!S.editCtypeId;
  const ctype = isEdit ? getCtype(S.editCtypeId) : null;
  if (isEdit && !ctype) {
    go('ctypes');
    return '';
  }
  const t = ctype ?? {
    name: '',
    pins: null as number | null,
    description: '',
    svgConnector: '',
    svgPinout: '',
  };
  const tid = ctype?.id ?? '';

  return /* html */ `
<header class="hdr">
  <button class="back-btn" onclick="go('ctypes')">‹</button>
  <div class="hdr-title">${isEdit ? 'Edit' : 'New'} connector type</div>
</header>
<main class="main">
  <div class="form-group">
    <label>Name *</label>
    <input id="f-ct-name" type="text" value="${esc(t.name)}" placeholder="e.g. DEUTSCH DT04-2P"
      autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">
  </div>
  <div class="form-group">
    <label>Number of pins <span class="txt-muted">(optional)</span></label>
    <input id="f-ct-pins" type="number" inputmode="numeric" value="${esc(String(t.pins ?? ''))}" placeholder="e.g. 4">
  </div>
  <div class="form-group">
    <label>Description <span class="txt-muted">(optional)</span></label>
    <textarea id="f-ct-desc" rows="2">${esc(t.description)}</textarea>
  </div>
  <div class="divider"></div>
  <div class="form-group">
    <label>Connector image <span class="txt-muted">(.svg file)</span></label>
    <input type="file" accept=".svg,image/svg+xml" onchange="loadSvgFile(this,'f-ct-svg-con','ct-con-preview')">
    <input type="hidden" id="f-ct-svg-con" value="${esc(t.svgConnector)}">
    <div class="svg-preview${t.svgConnector ? '' : ' svg-preview-empty'}" id="ct-con-preview">${t.svgConnector || ''}</div>
    ${t.svgConnector ? `<button type="button" class="btn btn-ghost btn-sm mt6" onclick="clearSvg('f-ct-svg-con','ct-con-preview')">✕ Clear image</button>` : ''}
  </div>
  <div class="form-group">
    <label>Pinout diagram <span class="txt-muted">(.svg file)</span></label>
    <input type="file" accept=".svg,image/svg+xml" onchange="loadSvgFile(this,'f-ct-svg-pin','ct-pin-preview')">
    <input type="hidden" id="f-ct-svg-pin" value="${esc(t.svgPinout)}">
    <div class="svg-preview${t.svgPinout ? '' : ' svg-preview-empty'}" id="ct-pin-preview">${t.svgPinout || ''}</div>
    ${t.svgPinout ? `<button type="button" class="btn btn-ghost btn-sm mt6" onclick="clearSvg('f-ct-svg-pin','ct-pin-preview')">✕ Clear image</button>` : ''}
  </div>
  <button class="btn btn-primary w-full" onclick="saveCtypeForm('${tid}')">
    💾 ${isEdit ? 'Save' : 'Create'}
  </button>
  ${isEdit ? `<button class="btn btn-danger w-full mt8" onclick="delCtypeAction('${tid}',true)">🗑 Delete</button>` : ''}
  <button class="btn btn-ghost w-full mt8" onclick="go('ctypes')">Cancel</button>
</main>`;
}

/* ── Actions ─────────────────────────────────────────────────── */
export function saveCtypeForm(id: string): void {
  const name = val('f-ct-name').trim();
  if (!name) {
    toast('⚠️ Name is required');
    return;
  }
  const pinsRaw = val('f-ct-pins').trim();
  const data = {
    name,
    pins: pinsRaw ? +pinsRaw : null,
    description: val('f-ct-desc').trim(),
    svgConnector: (document.getElementById('f-ct-svg-con') as HTMLInputElement)?.value ?? '',
    svgPinout: (document.getElementById('f-ct-svg-pin') as HTMLInputElement)?.value ?? '',
  };
  if (id) {
    updCtype(id, data);
    toast('✅ Type updated');
  } else {
    addCtype(data);
    toast('✅ Type created');
  }
  go('ctypes');
}

export function delCtypeAction(id: string, _fromForm = false): void {
  if (!confirm('Delete this connector type?')) return;
  delCtype(id);
  toast('🗑 Type deleted');
  go('ctypes');
}

export function loadSvgFile(input: HTMLInputElement, hiddenId: string, previewId: string): void {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const svg = (e.target as FileReader).result as string;
    const hiddenEl = document.getElementById(hiddenId) as HTMLInputElement | null;
    const previewEl = document.getElementById(previewId) as HTMLElement | null;
    if (hiddenEl) hiddenEl.value = svg;
    if (previewEl) {
      previewEl.innerHTML = svg;
      previewEl.classList.remove('svg-preview-empty');
    }
  };
  reader.readAsText(file);
}

export function clearSvg(hiddenId: string, previewId: string): void {
  const hiddenEl = document.getElementById(hiddenId) as HTMLInputElement | null;
  const previewEl = document.getElementById(previewId) as HTMLElement | null;
  if (hiddenEl) hiddenEl.value = '';
  if (previewEl) {
    previewEl.innerHTML = '';
    previewEl.classList.add('svg-preview-empty');
  }
}
