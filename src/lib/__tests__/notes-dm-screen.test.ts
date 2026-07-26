import { describe, expect, it } from 'vitest';
import {
  createEmptyDmScreen,
  dmScreenToMarkdown,
  type DmScreenItem,
} from '@/lib/dm-screen';
import {
  legacyDmScreenNoteId,
  planDmScreenNoteMigration,
} from '@/lib/notes-dm-screen';
import { createEmptyNoteLibrary, createNote, type NoteLibrary } from '@/lib/notes';
import { EMPTY_BATTLE } from '@/lib/battle-organizer';

function inlineNote(id: string, body: string): DmScreenItem {
  return {
    id,
    kind: 'note',
    title: 'Session notes',
    body,
    collapsed: false,
    layout: {
      width: 'wide',
      stashed: false,
      excludedFromPrint: false,
    },
    origin: 'manual',
  };
}

describe('DM Screen note references', () => {
  it('moves inline bodies into first-class notes and leaves only a reference', () => {
    const screen = createEmptyDmScreen({
      createId: (kind) => `screen-${kind}`,
    });
    screen.sections[0].items = [inlineNote('panel-notes', 'The gate opened.')];

    const plan = planDmScreenNoteMigration(
      screen,
      createEmptyNoteLibrary(),
      { now: 100 },
    );

    expect(plan.createdNoteIds).toEqual([
      legacyDmScreenNoteId(screen.id, 'panel-notes'),
    ]);
    expect(plan.library.notes[0]).toMatchObject({
      kind: 'scratchpad',
      title: 'Session notes',
      body: 'The gate opened.',
      scope: { type: 'screen', id: screen.id },
      links: [{ type: 'dm-screen-panel', id: 'panel-notes' }],
    });
    expect(plan.screen.sections[0].items[0]).toMatchObject({
      id: 'panel-notes',
      kind: 'note',
      resourceId: plan.library.notes[0].id,
    });
    expect(plan.screen.sections[0].items[0]).not.toHaveProperty('body');
    expect(screen.sections[0].items[0]).toHaveProperty('body', 'The gate opened.');
  });

  it('is idempotent when the note commit succeeds before the screen commit', () => {
    const screen = createEmptyDmScreen({
      createId: (kind) => `screen-${kind}`,
    });
    screen.sections[0].items = [inlineNote('panel-notes', 'Keep me once.')];
    const first = planDmScreenNoteMigration(
      screen,
      createEmptyNoteLibrary(),
      { now: 100 },
    );
    const retry = planDmScreenNoteMigration(screen, first.library, { now: 200 });

    expect(retry.createdNoteIds).toEqual([]);
    expect(retry.library.notes).toHaveLength(1);
    expect(retry.screen.sections[0].items[0].resourceId).toBe(
      first.library.notes[0].id,
    );
  });

  it('lets multiple panels render the same note without copying its body', () => {
    const screen = createEmptyDmScreen({
      createId: (kind) => `shared-${kind}`,
    });
    const note = createNote({
      kind: 'scratchpad',
      title: 'Shared log',
      body: 'One source of truth.',
    }, { id: 'note-shared', now: 100 });
    const library: NoteLibrary = {
      version: 1,
      revision: 1,
      notes: [note],
      quarantine: [],
    };
    screen.sections[0].items = [
      { ...inlineNote('panel-a', ''), resourceId: note.id, body: undefined },
      { ...inlineNote('panel-b', ''), resourceId: note.id, body: undefined },
    ];
    const noteMap = new Map([[note.id, note]]);

    const markdown = dmScreenToMarkdown(
      screen,
      new Map(),
      new Map(),
      EMPTY_BATTLE,
      noteMap,
    );

    expect(markdown.match(/One source of truth\./g)).toHaveLength(2);
    expect(planDmScreenNoteMigration(screen, library).createdNoteIds).toEqual([]);
  });
});
