import { describe, expect, it } from 'vitest';
import {
  NOTE_LIBRARY_VERSION,
  NOTE_SEMANTIC_LABELS,
  cloneNoteLibrary,
  createEmptyNoteLibrary,
  createNote,
  isNoteLibrary,
  mergeNoteLibraries,
  noteLibraryToMarkdown,
  parseNoteLibraryDocument,
  reduceNoteLibrary,
  serializeNoteLibrary,
  type NoteIdFactory,
  type NoteLibrary,
} from '@/lib/notes';

function ids(namespace: string): NoteIdFactory {
  let next = 0;
  return (kind) => `${namespace}-${kind}-${++next}`;
}

function libraryWith(...notes: ReturnType<typeof createNote>[]): NoteLibrary {
  return {
    version: NOTE_LIBRARY_VERSION,
    revision: 3,
    notes,
    quarantine: [],
  };
}

describe('Notes domain', () => {
  it('creates stable note identity with campaign-ready references', () => {
    const note = createNote({
      kind: 'scratchpad',
      title: 'Session notes',
      body: 'The gate opened.',
      scope: { type: 'screen', id: 'screen-1' },
      links: [
        { type: 'campaign', id: 'campaign-1' },
        { type: 'future-world-entity', id: 'unknown-1', label: 'Preserved' },
      ],
      tags: ['session'],
    }, {
      id: 'note-stable',
      now: 100,
      createId: ids('create'),
    });

    const copy = cloneNoteLibrary(libraryWith(note));
    copy.notes[0].body = 'The gate closed.';
    copy.notes[0].order = 5;

    expect(copy.notes[0].id).toBe('note-stable');
    expect(copy.notes[0].links[1]).toEqual({
      type: 'future-world-entity',
      id: 'unknown-1',
      label: 'Preserved',
    });
    expect(isNoteLibrary(copy)).toBe(true);
  });

  it('isolates invalid records while retaining their original value', () => {
    const valid = createNote({
      kind: 'sticky',
      title: 'Clue',
      body: 'Blue wax.',
    }, { id: 'note-valid', now: 100 });
    const invalid = {
      ...valid,
      id: 'note-invalid',
      kind: 'rich-text',
      secretFutureField: { untouched: true },
    };

    const parsed = parseNoteLibraryDocument({
      version: 1,
      revision: 4,
      notes: [valid, invalid],
    }, { createId: ids('quarantine') });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.migrated).toBe(true);
    expect(parsed.library.notes.map((note) => note.id)).toEqual(['note-valid']);
    expect(parsed.library.quarantine).toHaveLength(1);
    expect(parsed.library.quarantine[0].raw).toEqual(invalid);
    expect(parsed.library.quarantine[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.notes[1].kind' }),
    ]));
    expect(parsed.warnings[0]).toMatch(/Isolated 1 invalid note record/);
  });

  it('rejects future documents without producing an overwrite candidate', () => {
    const future = {
      version: NOTE_LIBRARY_VERSION + 1,
      revision: 99,
      notes: [{ future: true }],
    };
    expect(parseNoteLibraryDocument(future)).toMatchObject({
      ok: false,
      reason: 'future-version',
    });
  });

  it('migrates legacy inline notes into scratchpads', () => {
    const parsed = parseNoteLibraryDocument({
      version: 0,
      revision: 2,
      notes: [{
        id: 'legacy-note',
        title: 'Old notes',
        body: 'Still important',
        createdAt: 10,
        updatedAt: 20,
      }],
    }, {
      now: 50,
      createId: ids('legacy'),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed).toMatchObject({ migrated: true });
    expect(parsed.library.notes[0]).toMatchObject({
      id: 'legacy-note',
      kind: 'scratchpad',
      body: 'Still important',
      createdAt: 10,
      updatedAt: 20,
    });
  });

  it('serializes notes in stable order without mutating the library', () => {
    const later = createNote({
      kind: 'scratchpad',
      title: 'Later',
      order: 2,
    }, { id: 'note-later', now: 200 });
    const first = createNote({
      kind: 'sticky',
      title: 'First',
      order: 1,
    }, { id: 'note-first', now: 100 });
    const library = libraryWith(later, first);

    const serialized = JSON.parse(serializeNoteLibrary(library)) as NoteLibrary;
    expect(serialized.notes.map((note) => note.id)).toEqual([
      'note-first',
      'note-later',
    ]);
    expect(library.notes.map((note) => note.id)).toEqual([
      'note-later',
      'note-first',
    ]);
  });

  it('updates and moves notes without changing stable identity', () => {
    const first = createNote({
      kind: 'sticky',
      title: 'First',
      order: 0,
    }, { id: 'note-first', now: 100 });
    const second = createNote({
      kind: 'scratchpad',
      title: 'Second',
      order: 1,
    }, { id: 'note-second', now: 100 });
    const original = libraryWith(first, second);

    const edited = reduceNoteLibrary(original, {
      type: 'update-note',
      noteId: first.id,
      changes: { title: 'Edited', pinned: true },
      updatedAt: 200,
    });
    const moved = reduceNoteLibrary(edited, {
      type: 'move-note',
      noteId: first.id,
      toIndex: 1,
      updatedAt: 300,
    });

    expect(edited.notes[0]).toMatchObject({
      id: 'note-first',
      title: 'Edited',
      pinned: true,
      createdAt: 100,
      updatedAt: 200,
    });
    expect(moved.notes.map((note) => note.id)).toEqual([
      'note-second',
      'note-first',
    ]);
    expect(moved.notes.map((note) => note.order)).toEqual([0, 1]);
    expect(original.notes.map((note) => note.id)).toEqual([
      'note-first',
      'note-second',
    ]);
  });

  it('defines semantic labels with color-independent text and icon meaning', () => {
    expect(Object.keys(NOTE_SEMANTIC_LABELS)).toEqual([
      'reminder',
      'clue',
      'npc',
      'danger',
      'later',
    ]);
    for (const definition of Object.values(NOTE_SEMANTIC_LABELS)) {
      expect(definition.text).not.toBe('');
      expect(definition.icon).not.toBe('');
      expect(definition.description).not.toBe('');
    }
  });

  it('remaps colliding imports instead of overwriting local notes', () => {
    const current = libraryWith(createNote({
      kind: 'scratchpad',
      title: 'Local',
      order: 0,
    }, { id: 'note-shared', now: 100 }));
    const incoming = libraryWith(createNote({
      kind: 'sticky',
      title: 'Imported',
      order: 0,
    }, { id: 'note-shared', now: 200 }));

    const merged = mergeNoteLibraries(current, incoming, {
      createId: ids('import'),
    });

    expect(merged.library.notes).toHaveLength(2);
    expect(merged.library.notes[0].title).toBe('Local');
    expect(merged.library.notes[1]).toMatchObject({
      id: 'import-note-1',
      title: 'Imported',
      order: 1,
    });
    expect(merged.idRemaps).toEqual([{
      from: 'note-shared',
      to: 'import-note-1',
    }]);
  });

  it('exports scratchpads and checklist state to readable Markdown', () => {
    const scratchpad = createNote({
      kind: 'scratchpad',
      title: 'Session log',
      body: '10:15 — The bell rang.',
      order: 0,
    }, { id: 'note-log', now: 100 });
    const checklist = createNote({
      kind: 'checklist',
      title: 'Before play',
      items: [
        { id: 'item-2', text: 'Set initiative', completed: false, order: 2 },
        { id: 'item-1', text: 'Recap', completed: true, order: 1 },
      ],
      order: 1,
    }, { id: 'note-list', now: 100 });

    const markdown = noteLibraryToMarkdown(libraryWith(scratchpad, checklist));
    expect(markdown).toContain('## Session log');
    expect(markdown).toContain('10:15 — The bell rang.');
    expect(markdown.indexOf('- [x] Recap')).toBeLessThan(
      markdown.indexOf('- [ ] Set initiative'),
    );
  });

  it('creates an empty valid library', () => {
    expect(createEmptyNoteLibrary()).toEqual({
      version: NOTE_LIBRARY_VERSION,
      revision: 0,
      notes: [],
      quarantine: [],
    });
    expect(isNoteLibrary(createEmptyNoteLibrary())).toBe(true);
  });
});
