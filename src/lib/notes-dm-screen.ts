import {
  cloneDmScreenDocument,
  type DmScreenItem,
  type DmScreenSection,
  type DmScreenState,
} from './dm-screen';
import {
  cloneNoteLibrary,
  createNote,
  isNoteLibrary,
  type NoteIdFactory,
  type NoteLibrary,
  type NoteRecord,
} from './notes';

export interface DmScreenNoteMigrationPlan {
  screen: DmScreenState;
  library: NoteLibrary;
  createdNoteIds: string[];
  linkedPanelIds: string[];
}

function hashId(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Stable across retries so a cross-document migration cannot duplicate notes. */
export function legacyDmScreenNoteId(screenId: string, panelId: string): string {
  const readable = panelId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'panel';
  return `note-screen-${readable}-${hashId(`${screenId}:${panelId}`)}`;
}

function linkedPanelNote(
  library: NoteLibrary,
  screenId: string,
  panelId: string,
): NoteRecord | undefined {
  return library.notes.find((note) => (
    note.scope?.type === 'screen'
    && note.scope.id === screenId
    && note.links.some((link) => link.type === 'dm-screen-panel' && link.id === panelId)
  ));
}

function allocateNoteId(
  screenId: string,
  panel: DmScreenItem,
  usedIds: Set<string>,
  createId?: NoteIdFactory,
): string {
  const requested = panel.resourceId?.trim()
    || legacyDmScreenNoteId(screenId, panel.id);
  if (requested.length <= 200 && !usedIds.has(requested)) {
    usedIds.add(requested);
    return requested;
  }
  if (createId) {
    let next = createId('note');
    let attempts = 0;
    while ((!next || next.length > 200 || usedIds.has(next)) && attempts < 10_000) {
      next = createId('note');
      attempts += 1;
    }
    if (next && next.length <= 200 && !usedIds.has(next)) {
      usedIds.add(next);
      return next;
    }
  }
  let suffix = 1;
  let next = `${legacyDmScreenNoteId(screenId, panel.id)}-${suffix}`;
  while (usedIds.has(next)) {
    suffix += 1;
    next = `${legacyDmScreenNoteId(screenId, panel.id)}-${suffix}`;
  }
  usedIds.add(next);
  return next;
}

function notePanelMigration(
  item: DmScreenItem,
  screen: DmScreenState,
  library: NoteLibrary,
  usedIds: Set<string>,
  nextOrder: () => number,
  now: number,
  createId?: NoteIdFactory,
): {
  item: DmScreenItem;
  note?: NoteRecord;
  linked: boolean;
} {
  if (item.kind !== 'note') return { item, linked: false };

  const referenced = item.resourceId
    ? library.notes.find((note) => note.id === item.resourceId)
    : undefined;
  const priorMigration = linkedPanelNote(library, screen.id, item.id);
  const existing = referenced ?? priorMigration;
  let note = existing;
  if (!note) {
    const id = allocateNoteId(screen.id, item, usedIds, createId);
    note = createNote({
      kind: 'scratchpad',
      title: item.title,
      body: item.body ?? '',
      order: nextOrder(),
      size: item.layout.width === 'compact'
        ? 'compact'
        : item.layout.width === 'standard'
          ? 'standard'
          : 'wide',
      scope: { type: 'screen', id: screen.id, label: screen.title },
      links: [{ type: 'dm-screen-panel', id: item.id, label: item.title }],
    }, { id, now, createId });
  }

  const migratedItem: DmScreenItem = {
    ...item,
    resourceId: note.id,
  };
  delete migratedItem.body;
  return {
    item: migratedItem,
    ...(existing ? {} : { note }),
    linked: item.resourceId !== note.id || item.body !== undefined,
  };
}

/**
 * Build the two documents needed to adopt legacy inline DM Screen notes.
 * Callers persist the Notes Library first, then the reference-only screen.
 */
export function planDmScreenNoteMigration(
  screen: DmScreenState,
  library: NoteLibrary,
  options: {
    now?: number;
    createId?: NoteIdFactory;
  } = {},
): DmScreenNoteMigrationPlan {
  const now = options.now ?? Date.now();
  const nextLibrary = cloneNoteLibrary(library);
  const nextScreen = cloneDmScreenDocument(screen);
  const usedIds = new Set(nextLibrary.notes.map((note) => note.id));
  let order = nextLibrary.notes.reduce((max, note) => Math.max(max, note.order), -1);
  const createdNoteIds: string[] = [];
  const linkedPanelIds: string[] = [];

  function migrateSections(sections: DmScreenSection[]): DmScreenSection[] {
    return sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const result = notePanelMigration(
          item,
          nextScreen,
          nextLibrary,
          usedIds,
          () => {
            order += 1;
            return order;
          },
          now,
          options.createId,
        );
        if (result.note) {
          nextLibrary.notes.push(result.note);
          createdNoteIds.push(result.note.id);
        }
        if (result.linked) linkedPanelIds.push(item.id);
        return result.item;
      }),
      children: migrateSections(section.children),
    }));
  }

  nextScreen.sections = migrateSections(nextScreen.sections);
  if (!isNoteLibrary(nextLibrary)) {
    throw new Error('DM Screen note migration produced an invalid Notes Library.');
  }
  return {
    screen: nextScreen,
    library: nextLibrary,
    createdNoteIds,
    linkedPanelIds,
  };
}
