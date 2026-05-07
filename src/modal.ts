import { S } from './state';
import { esc, colorSwatch } from './utils';
import { posLabel, sideClass } from './utils';
import { getDevice, getCtype, wireBySchema, deviceBySchema, getAssembly } from './db';

export function renderModal(): string {
  if (!S.modal) return '';
  const k = getDevice(S.modal);
  if (!k) return '';

  const pos = posLabel(k);
  const parentId = k.schemaId;
  const ctype = k.typeId ? getCtype(k.typeId) : null;
  const ctypeName = ctype?.name ?? null;

  return /* html */ `
<div class="overlay" onclick="set({modal:null})">
  <div class="sheet" onclick="event.stopPropagation()">
    <div class="sheet-drag"></div>
    <div class="flex items-ctr gap8 mb16">
      <div class="flex-1">
        <div class="device-title">${esc(k.code)}</div>
        ${ctypeName ? `<div class="txt-sm txt-muted mt4">🔌 ${esc(ctypeName)}</div>` : ''}
        ${
          (k.accessories || []).length > 0
            ? `<div class="acc-list mt8">${(k.accessories || []).map(a => `<span class="acc-badge">${a}</span>`).join('')}</div>`
            : ''
        }
      </div>
      <button class="close-btn" onclick="set({modal:null})">×</button>
    </div>

    ${
      ctype && (ctype.pins || ctype.description || ctype.svgConnector || ctype.svgPinout)
        ? `
    <div class="ctype-detail mb12">
      ${ctype.pins ? `<span class="pin-badge">${ctype.pins} pins</span>` : ''}
      ${ctype.description ? `<div class="txt-sm txt-muted mt8">${esc(ctype.description)}</div>` : ''}
      ${ctype.svgConnector ? `<div class="svg-preview mt8">${ctype.svgConnector}</div>` : ''}
      ${ctype.svgPinout ? `<div class="svg-preview mt8">${ctype.svgPinout}</div>` : ''}
    </div>`
        : ''
    }

    <div class="info-row mb12">
      <span class="info-label">Position</span>
      ${
        pos
          ? `<span class="pos-badge ${sideClass(k.side)}">${pos}</span>`
          : `<span class="pos-badge unknown">⚠️ Unlocated</span>`
      }
    </div>

    ${
      k.notes
        ? `
    <div class="info-row mb12">
      <span class="info-label">Notes</span>
      <span class="txt-sm notes-pre">${esc(k.notes)}</span>
    </div>`
        : ''
    }

    ${(() => {
      const deviceWires = wireBySchema(k.schemaId)
        .filter(w => (w.ends || []).some(e => e.code === k.code))
        .sort((a, b) => {
          const pa = parseInt((a.ends || []).find(e => e.code === k.code)?.pos || '0', 10) || 0;
          const pb = parseInt((b.ends || []).find(e => e.code === k.code)?.pos || '0', 10) || 0;
          return pa - pb || a.wireRef.localeCompare(b.wireRef, undefined, { numeric: true });
        });
      if (!deviceWires.length) return '';
      const devMap = Object.fromEntries(deviceBySchema(k.schemaId).map(d => [d.code, d]));
      const asm = getAssembly(k.schemaId);
      const doneSet = new Set(asm?.done ?? []);
      return `<div class="mb12">
        <div class="info-label mb6">Wires (${deviceWires.length})</div>
        <div class="wire-table-scroll">
          <div class="wire-table">
          ${deviceWires
            .map(w => {
              const my = (w.ends || []).find(e => e.code === k.code);
              const others = (w.ends || []).filter(e => e.code !== k.code);
              const myPin = my?.pos
                ? `<span class="pos-badge unknown xs">pin ${esc(my.pos)}</span>`
                : `<span class="wire-dash">—</span>`;
              const colorSuffix = w.color ? ':' + w.color.toUpperCase() : '';
              const displayRef =
                colorSuffix && w.wireRef.toUpperCase().endsWith(colorSuffix)
                  ? w.wireRef.slice(0, w.wireRef.length - colorSuffix.length)
                  : w.wireRef;
              const otherCodes = others
                .map(e => {
                  const od = devMap[e.code];
                  return od
                    ? `<button onclick="event.stopPropagation();set({modal:'${od.id}'})" class="wire-rcv-btn">${esc(e.code)}</button>`
                    : `<span class="wire-rcv-txt">${esc(e.code)}</span>`;
                })
                .join('<span class="wire-sep">·</span>');
              const otherPins = others.length
                ? others
                    .map(e =>
                      e.pos
                        ? `<span class="pos-badge unknown xs">pin ${esc(e.pos)}</span>`
                        : `<span class="wire-dash">—</span>`,
                    )
                    .join(' ')
                : `<span class="wire-dash">—</span>`;
              return `
          <span class="wire-ref-cell${doneSet.has(w.id) ? ' wire-done-cell' : ''}">${esc(displayRef)}${doneSet.has(w.id) ? '&nbsp;&#10003;' : ''}</span>
          <span class="wire-clr-cell">${w.color ? colorSwatch(w.color) : '<span class="wire-dash">—</span>'}</span>
          <span>${myPin}</span>
          <span class="wire-codes">${otherCodes || '<span class="wire-dash">—</span>'}</span>
          <span>${otherPins}</span>
          <span class="wire-page-cell">${w.page ? esc(w.page) : '<span class="wire-dash">—</span>'}</span>`;
            })
            .join('')}
          </div>
        </div>
      </div>`;
    })()}

    ${(() => {
      const sameType = k.typeId
        ? deviceBySchema(k.schemaId).filter(s => s.typeId === k.typeId && s.id !== k.id)
        : [];
      if (!sameType.length) return '';
      return `<div class="mb12">
        <div class="same-type-lbl">Same type (${sameType.length})</div>
        <div class="same-type-wrap">
          ${sameType
            .map(s => {
              const p = posLabel(s);
              return `<button class="pos-badge ${sideClass(s.side)} same-type-btn"
              onclick="set({modal:'${s.id}'})"><b>${esc(s.code)}</b>${p ? `&thinsp;·&thinsp;${p}` : ''}</button>`;
            })
            .join('')}
        </div>
      </div>`;
    })()}

    <div class="flex gap8 mt16">
      <button class="btn btn-primary flex-1"
        onclick="set({modal:null});go('skon-form',{schemaId:'${parentId}',skonId:'${k.id}'})">
        ✏️ Edit
      </button>
      <button class="btn btn-ghost" onclick="copyCode('${esc(k.code)}')">📋</button>
    </div>
  </div>
</div>`;
}
