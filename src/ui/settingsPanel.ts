import { lang, onLangChange, setLang, t, type Lang, type Localized } from '../content/i18n';
import { UI } from '../content/ui';
import {
  resetSettings,
  setSetting,
  settings,
  type Quality,
  type Settings,
} from './settings';

/**
 * The settings panel.
 *
 * Rows are declared, not written out — every control is localized, and the
 * whole body is rebuilt on a language change rather than each row being taught
 * to repaint itself. A settings panel is opened rarely and read once, so the
 * rebuild costs nothing anyone can perceive and it removes the entire class of
 * bug where one label forgets to update.
 */

type Row =
  | { kind: 'toggle'; label: Localized; note?: Localized; get(): boolean; set(v: boolean): void }
  | {
      kind: 'range';
      label: Localized;
      note?: Localized;
      min: number;
      max: number;
      step: number;
      format(v: number): string;
      get(): number;
      set(v: number): void;
    }
  | {
      kind: 'segmented';
      label: Localized;
      note?: Localized;
      options: Array<{ value: string; label: Localized }>;
      get(): string;
      set(v: string): void;
    };

interface Group {
  title: Localized;
  rows: Row[];
}

function toggleRow(
  label: Localized,
  key: keyof Settings,
  note?: Localized,
): Row {
  return {
    kind: 'toggle',
    label,
    note,
    get: () => settings()[key] as boolean,
    set: (v) => setSetting(key, v as never),
  };
}

function groups(): Group[] {
  return [
    {
      title: UI.groupGeneral,
      rows: [
        {
          kind: 'segmented',
          label: UI.language,
          options: [
            { value: 'en', label: { en: 'English', tr: 'English' } },
            { value: 'tr', label: { en: 'Türkçe', tr: 'Türkçe' } },
          ],
          get: () => lang(),
          set: (v) => setLang(v as Lang),
        },
        toggleRow(UI.showHelp, 'showHelp'),
      ],
    },
    {
      title: UI.groupView,
      rows: [
        {
          kind: 'range',
          label: UI.fov,
          note: UI.fovNote,
          min: 45,
          max: 95,
          step: 1,
          format: (v) => `${v}°`,
          get: () => settings().fov,
          set: (v) => setSetting('fov', v),
        },
      ],
    },
    {
      title: UI.groupControls,
      rows: [
        {
          kind: 'range',
          label: UI.sensitivity,
          min: 0.2,
          max: 3,
          step: 0.1,
          format: (v) => `${v.toFixed(1)}×`,
          get: () => settings().sensitivity,
          set: (v) => setSetting('sensitivity', v),
        },
        toggleRow(UI.invertLook, 'invertLook'),
        toggleRow(UI.headBob, 'headBob'),
      ],
    },
    {
      title: UI.groupPerformance,
      rows: [
        {
          kind: 'segmented',
          label: UI.quality,
          note: UI.qualityNote,
          options: [
            { value: 'low', label: UI.qualityLow },
            { value: 'medium', label: UI.qualityMedium },
            { value: 'high', label: UI.qualityHigh },
          ],
          get: () => settings().quality,
          set: (v) => setSetting('quality', v as Quality),
        },
      ],
    },
    {
      title: UI.groupDeveloper,
      rows: [
        toggleRow(UI.showDetails, 'showDetails'),
        toggleRow(UI.showTests, 'showTests'),
      ],
    },
  ];
}

function renderRow(row: Row): HTMLElement {
  const wrap = document.createElement('div');
  const line = document.createElement('div');
  line.className = 'set-row';

  const label = document.createElement('label');
  label.textContent = t(row.label);
  line.append(label);

  if (row.kind === 'toggle') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'set-switch';
    btn.setAttribute('role', 'switch');
    const paint = () => btn.setAttribute('aria-checked', String(row.get()));
    btn.addEventListener('click', () => {
      row.set(!row.get());
      paint();
    });
    label.addEventListener('click', () => btn.click());
    paint();
    line.append(btn);
  } else if (row.kind === 'range') {
    const value = document.createElement('span');
    value.className = 'set-value';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(row.min);
    input.max = String(row.max);
    input.step = String(row.step);
    input.value = String(row.get());
    value.textContent = row.format(row.get());
    input.addEventListener('input', () => {
      const v = Number(input.value);
      row.set(v);
      value.textContent = row.format(v);
    });
    line.append(value, input);
  } else {
    const seg = document.createElement('div');
    seg.className = 'set-seg';
    const buttons: HTMLButtonElement[] = [];
    const paint = () => {
      for (const b of buttons) b.classList.toggle('active', b.dataset.v === row.get());
    };
    for (const opt of row.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = opt.value;
      b.textContent = t(opt.label);
      b.addEventListener('click', () => {
        row.set(opt.value);
        paint();
      });
      buttons.push(b);
      seg.append(b);
    }
    paint();
    line.append(seg);
  }

  wrap.append(line);
  if (row.note) {
    const note = document.createElement('p');
    note.className = 'set-note';
    note.textContent = t(row.note);
    wrap.append(note);
  }
  return wrap;
}

export interface SettingsPanel {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

export function createSettingsPanel(onVisibilityChange: (open: boolean) => void): SettingsPanel {
  const root = document.getElementById('settings') as HTMLDivElement;
  const body = document.getElementById('settings-body') as HTMLDivElement;
  const title = document.getElementById('settings-title') as HTMLSpanElement;
  const closeBtn = document.getElementById('settings-close') as HTMLButtonElement;
  const resetBtn = document.getElementById('settings-reset') as HTMLButtonElement;
  const openBtn = document.getElementById('settings-btn') as HTMLButtonElement;

  const build = () => {
    title.textContent = t(UI.settings);
    resetBtn.textContent = t(UI.reset);
    openBtn.setAttribute('aria-label', t(UI.settings));
    body.replaceChildren();
    for (const group of groups()) {
      const section = document.createElement('div');
      section.className = 'set-group';
      const h = document.createElement('h3');
      h.textContent = t(group.title);
      section.append(h);
      for (const row of group.rows) section.append(renderRow(row));
      body.append(section);
    }
  };

  // Language is a row inside the panel, so switching it has to redraw the
  // panel that is currently open and under the visitor's finger.
  onLangChange(build);
  build();

  let open = false;
  const setOpen = (v: boolean) => {
    if (open === v) return;
    open = v;
    root.hidden = !v;
    if (v) document.exitPointerLock?.();
    onVisibilityChange(v);
  };

  openBtn.addEventListener('click', () => setOpen(true));
  closeBtn.addEventListener('click', () => setOpen(false));
  root.addEventListener('click', (e) => {
    if (e.target === root) setOpen(false);
  });
  resetBtn.addEventListener('click', () => {
    resetSettings();
    build();
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && open) setOpen(false);
  });

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    get isOpen() {
      return open;
    },
  };
}
