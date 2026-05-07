import type { Device } from './types';

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const q$ = (sel: string): Element | null => document.querySelector(sel);

export const val = (id: string): string =>
  (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';

let _toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(msg: string, ms = 2400): void {
  const existing = document.querySelector('.toast');
  existing?.remove();
  if (_toastTimer !== null) clearTimeout(_toastTimer);
  const el = Object.assign(document.createElement('div'), {
    className: 'toast',
    textContent: msg,
  });
  document.body.appendChild(el);
  _toastTimer = setTimeout(() => el.remove(), ms);
}

export const posLabel = (k: Pick<Device, 'subtable' | 'section' | 'side'>): string | null =>
  k.subtable ? `${k.subtable}-${k.section} ${k.side}` : null;

export const sideClass = (side: string | null | undefined): string =>
  side === 'Haut' ? 'haut' : side === 'Bas' ? 'bas' : '';

/** Maps all known colour aliases → canonical key matching .wire-clr-{key} CSS class */
const WIRE_ALIAS: Record<string, string> = {
  w: 'wh',
  wh: 'wh',
  b: 'bk',
  bk: 'bk',
  r: 'rd',
  rd: 'rd',
  rg: 'rd',
  bu: 'bl',
  bl: 'bl',
  g: 'gn',
  gn: 'gn',
  vt: 'vt',
  y: 'ye',
  ye: 'ye',
  yl: 'ye',
  yw: 'ye',
  or: 'or',
  gr: 'gy',
  gy: 'gy',
  pk: 'pk',
  bn: 'bn',
  tq: 'tq',
  dr: 'dr',
};

/** Wire colour badge using a CSS class. Falls back to plain muted text for unknowns. */
export function colorSwatch(col: string): string {
  if (!col) return '';
  const canonical = WIRE_ALIAS[col.trim().toLowerCase()];
  if (!canonical) return `<span class="wire-clr wire-clr-unknown">${esc(col)}</span>`;
  return `<span class="wire-clr wire-clr-${canonical}">${esc(col.trim().toUpperCase())}</span>`;
}
