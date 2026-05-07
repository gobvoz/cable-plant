import { S } from './state';
import { q$ } from './utils';
import { viewHome } from './views/home';
import { viewSettings } from './views/settings';
import { viewCtypes, viewCtypeForm } from './views/ctypes';
import { viewTableForm } from './views/table-form';
import { viewSchemaForm } from './views/schema-form';
import { viewSchema } from './views/schema';
import { viewSkonForm } from './views/skon-form';
import { viewImportDoc } from './views/import-doc';
import { renderModal } from './modal';

export function render(): void {
  const fns: Record<string, () => string> = {
    home: viewHome,
    'table-form': viewTableForm,
    'schema-form': viewSchemaForm,
    schema: viewSchema,
    'skon-form': viewSkonForm,
    'import-doc': viewImportDoc,
    settings: viewSettings,
    ctypes: viewCtypes,
    'ctype-form': viewCtypeForm,
  };

  const html = (fns[S.view] ?? viewHome)();

  // Save focus state before wiping DOM
  const active = document.activeElement as HTMLInputElement | null;
  const focusId = active?.id ?? null;
  const selStart = active?.selectionStart ?? null;
  const selEnd = active?.selectionEnd ?? null;

  q$('#app')!.innerHTML = html + renderModal();

  // Restore focus — critical for search input on mobile Safari
  if (focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el) {
      el.focus({ preventScroll: true });
      if (selStart !== null) {
        try {
          el.setSelectionRange(selStart, selEnd);
        } catch {
          /* read-only inputs */
        }
      }
    }
  }
}
