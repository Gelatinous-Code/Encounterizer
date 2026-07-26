// ─── Durable Notes domain ───────────────────────────────────────
// Notes are first-class game data. DM Screen panels and future campaign
// sessions reference note IDs; they do not own copies of note content.

export const NOTE_LIBRARY_VERSION = 1 as const;
export const NOTE_MAX_RECORDS = 10_000;
export const NOTE_MAX_CHECKLIST_ITEMS = 500;

const MAX_ID_LENGTH = 200;
const MAX_TITLE_LENGTH = 240;
const MAX_BODY_LENGTH = 200_000;
const MAX_TAG_LENGTH = 80;
const MAX_REFERENCE_TYPE_LENGTH = 80;
const MAX_REFERENCE_LABEL_LENGTH = 240;

export type NoteKind = 'scratchpad' | 'sticky' | 'checklist';
export type NoteStatus = 'active' | 'completed' | 'archived';
export type NoteSize = 'compact' | 'standard' | 'wide';
export type NoteSemanticLabel = 'reminder' | 'clue' | 'npc' | 'danger' | 'later';
export type NoteIdKind = 'note' | 'checklist-item' | 'quarantine';
export type NoteIdFactory = (kind: NoteIdKind) => string;

export interface NoteSemanticLabelDefinition {
  text: string;
  /** Stable icon name; UI layers may map this to their icon set. */
  icon: string;
  description: string;
}

/** Text and icon carry label meaning independently of theme colors. */
export const NOTE_SEMANTIC_LABELS = {
  reminder: {
    text: 'Reminder',
    icon: 'bell',
    description: 'Something the DM should remember during play.',
  },
  clue: {
    text: 'Clue',
    icon: 'search',
    description: 'Evidence or information the party may discover.',
  },
  npc: {
    text: 'NPC',
    icon: 'user-round',
    description: 'A character beat, voice, motive, or relationship.',
  },
  danger: {
    text: 'Danger',
    icon: 'triangle-alert',
    description: 'A threat, consequence, or urgent warning.',
  },
  later: {
    text: 'Later',
    icon: 'clock-3',
    description: 'Something intentionally deferred for follow-up.',
  },
} as const satisfies Record<NoteSemanticLabel, NoteSemanticLabelDefinition>;

/**
 * Reference types deliberately remain bounded strings. Known callers use
 * screen, session, campaign, party-member, encounter, battle, map, and
 * challenge; future entity types can round-trip without a schema migration.
 */
export interface NoteEntityReference {
  type: string;
  id: string;
  label?: string;
}

export interface NoteChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  order: number;
}

export interface NoteRecord {
  /** Stable across editing, moving, archiving, and carry-forward operations. */
  id: string;
  kind: NoteKind;
  title?: string;
  body?: string;
  items: NoteChecklistItem[];
  label?: NoteSemanticLabel;
  tags: string[];
  pinned: boolean;
  status: NoteStatus;
  order: number;
  size: NoteSize;
  carryForward: boolean;
  scope?: NoteEntityReference;
  links: NoteEntityReference[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  archivedAt?: number;
}

export interface NoteValidationIssue {
  path: string;
  message: string;
}

/**
 * Invalid records are moved here with their original structured-clone value.
 * They remain available to future recovery tooling but never enter live views.
 */
export interface QuarantinedNoteRecord {
  id: string;
  sourceIndex: number;
  raw: unknown;
  issues: NoteValidationIssue[];
}

export interface NoteLibrary {
  version: typeof NOTE_LIBRARY_VERSION;
  /** Monotonically increases after each committed library write. */
  revision: number;
  notes: NoteRecord[];
  quarantine: QuarantinedNoteRecord[];
}

export type NoteDocumentReadResult =
  | {
      ok: true;
      library: NoteLibrary;
      migrated: boolean;
      warnings: string[];
    }
  | {
      ok: false;
      reason: 'invalid' | 'future-version';
      message: string;
      issues: NoteValidationIssue[];
    };

export type NewNoteInput = Pick<NoteRecord, 'kind'> & Partial<Omit<
  NoteRecord,
  'id' | 'kind' | 'createdAt' | 'updatedAt'
>>;

export interface NoteIdRemap {
  from: string;
  to: string;
}

export interface NoteLibraryMergeResult {
  library: NoteLibrary;
  idRemaps: NoteIdRemap[];
}

export type NoteRecordChanges = Partial<Omit<
  NoteRecord,
  'id' | 'createdAt' | 'updatedAt'
>>;

export type NoteLibraryAction =
  | { type: 'add-note'; note: NoteRecord }
  | {
      type: 'update-note';
      noteId: string;
      changes: NoteRecordChanges;
      updatedAt: number;
    }
  | {
      type: 'move-note';
      noteId: string;
      toIndex: number;
      updatedAt: number;
    };

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function boundedText(
  value: unknown,
  maxLength: number,
  allowEmpty = true,
): value is string {
  return typeof value === 'string'
    && value.length <= maxLength
    && (allowEmpty || value.trim().length > 0);
}

function safeInteger(value: unknown, min = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min;
}

function optionalTimestamp(value: unknown, createdAt: number, updatedAt: number): boolean {
  return value === undefined
    || (safeInteger(value) && value >= createdAt && value <= updatedAt);
}

function cloneUnknown<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to the JSON-safe clone used by import/export payloads.
    }
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    // Existing IndexedDB values are structured-cloneable. Returning the raw
    // value is safer than dropping an unrecoverable record.
    return value;
  }
}

function createSuffix(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createNoteId(kind: NoteIdKind): string {
  return `${kind}-${createSuffix()}`;
}

export function createEmptyNoteLibrary(): NoteLibrary {
  return {
    version: NOTE_LIBRARY_VERSION,
    revision: 0,
    notes: [],
    quarantine: [],
  };
}

export function createNote(
  input: NewNoteInput,
  options: {
    id?: string;
    now?: number;
    createId?: NoteIdFactory;
  } = {},
): NoteRecord {
  const now = options.now ?? Date.now();
  const createId = options.createId ?? createNoteId;
  const note: NoteRecord = {
    id: options.id ?? createId('note'),
    kind: input.kind,
    items: (input.items ?? []).map((item, index) => ({
      id: item.id || createId('checklist-item'),
      text: item.text,
      completed: item.completed,
      order: Number.isSafeInteger(item.order) && item.order >= 0 ? item.order : index,
    })),
    tags: [...(input.tags ?? [])],
    pinned: input.pinned ?? false,
    status: input.status ?? 'active',
    order: Number.isSafeInteger(input.order) && (input.order ?? -1) >= 0
      ? input.order!
      : 0,
    size: input.size ?? (input.kind === 'scratchpad' ? 'wide' : 'standard'),
    carryForward: input.carryForward ?? false,
    links: (input.links ?? []).map((link) => ({ ...link })),
    createdAt: now,
    updatedAt: now,
  };
  if (input.title !== undefined) note.title = input.title;
  if (input.body !== undefined) note.body = input.body;
  if (input.label !== undefined) note.label = input.label;
  if (input.scope !== undefined) note.scope = { ...input.scope };
  if (input.completedAt !== undefined) note.completedAt = input.completedAt;
  if (input.archivedAt !== undefined) note.archivedAt = input.archivedAt;
  return note;
}

export function cloneNoteRecord(note: NoteRecord): NoteRecord {
  return {
    id: note.id,
    kind: note.kind,
    ...(note.title !== undefined ? { title: note.title } : {}),
    ...(note.body !== undefined ? { body: note.body } : {}),
    items: note.items.map((item) => ({ ...item })),
    ...(note.label !== undefined ? { label: note.label } : {}),
    tags: [...note.tags],
    pinned: note.pinned,
    status: note.status,
    order: note.order,
    size: note.size,
    carryForward: note.carryForward,
    ...(note.scope ? { scope: { ...note.scope } } : {}),
    links: note.links.map((link) => ({ ...link })),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    ...(note.completedAt !== undefined ? { completedAt: note.completedAt } : {}),
    ...(note.archivedAt !== undefined ? { archivedAt: note.archivedAt } : {}),
  };
}

export function cloneNoteLibrary(library: NoteLibrary): NoteLibrary {
  return {
    version: NOTE_LIBRARY_VERSION,
    revision: library.revision,
    notes: library.notes.map(cloneNoteRecord),
    quarantine: library.quarantine.map((entry) => ({
      id: entry.id,
      sourceIndex: entry.sourceIndex,
      raw: cloneUnknown(entry.raw),
      issues: entry.issues.map((issue) => ({ ...issue })),
    })),
  };
}

function validateReference(
  value: unknown,
  path: string,
  issues: NoteValidationIssue[],
): value is NoteEntityReference {
  const reference = record(value);
  if (!reference) {
    issues.push({ path, message: 'must be an object' });
    return false;
  }
  let valid = true;
  if (!boundedText(reference.type, MAX_REFERENCE_TYPE_LENGTH, false)) {
    issues.push({
      path: `${path}.type`,
      message: `must be a non-empty string no longer than ${MAX_REFERENCE_TYPE_LENGTH} characters`,
    });
    valid = false;
  }
  if (!boundedText(reference.id, MAX_ID_LENGTH, false)) {
    issues.push({
      path: `${path}.id`,
      message: `must be a non-empty string no longer than ${MAX_ID_LENGTH} characters`,
    });
    valid = false;
  }
  if (
    reference.label !== undefined
    && !boundedText(reference.label, MAX_REFERENCE_LABEL_LENGTH)
  ) {
    issues.push({
      path: `${path}.label`,
      message: `must be a string no longer than ${MAX_REFERENCE_LABEL_LENGTH} characters`,
    });
    valid = false;
  }
  return valid;
}

export function validateNoteRecord(
  value: unknown,
  path = '$',
): NoteValidationIssue[] {
  const issues: NoteValidationIssue[] = [];
  const note = record(value);
  if (!note) return [{ path, message: 'must be an object' }];

  if (!boundedText(note.id, MAX_ID_LENGTH, false)) {
    issues.push({
      path: `${path}.id`,
      message: `must be a non-empty string no longer than ${MAX_ID_LENGTH} characters`,
    });
  }
  if (note.kind !== 'scratchpad' && note.kind !== 'sticky' && note.kind !== 'checklist') {
    issues.push({ path: `${path}.kind`, message: 'must be scratchpad, sticky, or checklist' });
  }
  if (note.title !== undefined && !boundedText(note.title, MAX_TITLE_LENGTH)) {
    issues.push({
      path: `${path}.title`,
      message: `must be a string no longer than ${MAX_TITLE_LENGTH} characters`,
    });
  }
  if (note.body !== undefined && !boundedText(note.body, MAX_BODY_LENGTH)) {
    issues.push({
      path: `${path}.body`,
      message: `must be a string no longer than ${MAX_BODY_LENGTH} characters`,
    });
  }
  if (!Array.isArray(note.items)) {
    issues.push({ path: `${path}.items`, message: 'must be an array' });
  } else {
    if (note.items.length > NOTE_MAX_CHECKLIST_ITEMS) {
      issues.push({
        path: `${path}.items`,
        message: `cannot contain more than ${NOTE_MAX_CHECKLIST_ITEMS} checklist items`,
      });
    }
    const itemIds = new Set<string>();
    note.items.forEach((item, index) => {
      const itemPath = `${path}.items[${index}]`;
      const candidate = record(item);
      if (!candidate) {
        issues.push({ path: itemPath, message: 'must be an object' });
        return;
      }
      if (!boundedText(candidate.id, MAX_ID_LENGTH, false)) {
        issues.push({
          path: `${itemPath}.id`,
          message: `must be a non-empty string no longer than ${MAX_ID_LENGTH} characters`,
        });
      } else if (itemIds.has(candidate.id)) {
        issues.push({ path: `${itemPath}.id`, message: 'duplicates another checklist item ID' });
      } else {
        itemIds.add(candidate.id);
      }
      if (!boundedText(candidate.text, MAX_BODY_LENGTH)) {
        issues.push({
          path: `${itemPath}.text`,
          message: `must be a string no longer than ${MAX_BODY_LENGTH} characters`,
        });
      }
      if (typeof candidate.completed !== 'boolean') {
        issues.push({ path: `${itemPath}.completed`, message: 'must be a boolean' });
      }
      if (!safeInteger(candidate.order)) {
        issues.push({ path: `${itemPath}.order`, message: 'must be a non-negative safe integer' });
      }
    });
  }
  if (
    note.label !== undefined
    && note.label !== 'reminder'
    && note.label !== 'clue'
    && note.label !== 'npc'
    && note.label !== 'danger'
    && note.label !== 'later'
  ) {
    issues.push({
      path: `${path}.label`,
      message: 'must be reminder, clue, npc, danger, or later when present',
    });
  }
  if (!Array.isArray(note.tags)) {
    issues.push({ path: `${path}.tags`, message: 'must be an array' });
  } else {
    const seenTags = new Set<string>();
    note.tags.forEach((tag, index) => {
      if (!boundedText(tag, MAX_TAG_LENGTH, false)) {
        issues.push({
          path: `${path}.tags[${index}]`,
          message: `must be a non-empty string no longer than ${MAX_TAG_LENGTH} characters`,
        });
      } else if (seenTags.has(tag)) {
        issues.push({ path: `${path}.tags[${index}]`, message: 'duplicates another tag' });
      } else {
        seenTags.add(tag);
      }
    });
  }
  if (typeof note.pinned !== 'boolean') {
    issues.push({ path: `${path}.pinned`, message: 'must be a boolean' });
  }
  if (note.status !== 'active' && note.status !== 'completed' && note.status !== 'archived') {
    issues.push({ path: `${path}.status`, message: 'must be active, completed, or archived' });
  }
  if (!safeInteger(note.order)) {
    issues.push({ path: `${path}.order`, message: 'must be a non-negative safe integer' });
  }
  if (note.size !== 'compact' && note.size !== 'standard' && note.size !== 'wide') {
    issues.push({ path: `${path}.size`, message: 'must be compact, standard, or wide' });
  }
  if (typeof note.carryForward !== 'boolean') {
    issues.push({ path: `${path}.carryForward`, message: 'must be a boolean' });
  }
  if (note.scope !== undefined) validateReference(note.scope, `${path}.scope`, issues);
  if (!Array.isArray(note.links)) {
    issues.push({ path: `${path}.links`, message: 'must be an array' });
  } else {
    note.links.forEach((link, index) => {
      validateReference(link, `${path}.links[${index}]`, issues);
    });
  }
  if (!safeInteger(note.createdAt)) {
    issues.push({ path: `${path}.createdAt`, message: 'must be a non-negative safe integer' });
  }
  if (!safeInteger(note.updatedAt)) {
    issues.push({ path: `${path}.updatedAt`, message: 'must be a non-negative safe integer' });
  } else if (safeInteger(note.createdAt) && note.updatedAt < note.createdAt) {
    issues.push({ path: `${path}.updatedAt`, message: 'cannot be earlier than createdAt' });
  }
  if (safeInteger(note.createdAt) && safeInteger(note.updatedAt)) {
    if (!optionalTimestamp(note.completedAt, note.createdAt, note.updatedAt)) {
      issues.push({
        path: `${path}.completedAt`,
        message: 'must fall between createdAt and updatedAt when present',
      });
    }
    if (!optionalTimestamp(note.archivedAt, note.createdAt, note.updatedAt)) {
      issues.push({
        path: `${path}.archivedAt`,
        message: 'must fall between createdAt and updatedAt when present',
      });
    }
  }
  return issues;
}

export function isNoteRecord(value: unknown): value is NoteRecord {
  return validateNoteRecord(value).length === 0;
}

function isValidationIssue(value: unknown): value is NoteValidationIssue {
  const issue = record(value);
  return issue !== null
    && boundedText(issue.path, 2_000, false)
    && boundedText(issue.message, 2_000, false);
}

function isQuarantinedNoteRecord(value: unknown): value is QuarantinedNoteRecord {
  const entry = record(value);
  return entry !== null
    && boundedText(entry.id, MAX_ID_LENGTH, false)
    && safeInteger(entry.sourceIndex)
    && Object.prototype.hasOwnProperty.call(entry, 'raw')
    && Array.isArray(entry.issues)
    && entry.issues.length > 0
    && entry.issues.every(isValidationIssue);
}

export function isNoteLibrary(value: unknown): value is NoteLibrary {
  const library = record(value);
  if (!library
    || library.version !== NOTE_LIBRARY_VERSION
    || !safeInteger(library.revision)
    || !Array.isArray(library.notes)
    || library.notes.length > NOTE_MAX_RECORDS
    || !library.notes.every(isNoteRecord)
    || !Array.isArray(library.quarantine)
    || !library.quarantine.every(isQuarantinedNoteRecord)
  ) return false;

  const noteIds = library.notes.map((note) => note.id);
  if (new Set(noteIds).size !== noteIds.length) return false;
  const quarantineIds = library.quarantine.map((entry) => entry.id);
  return new Set(quarantineIds).size === quarantineIds.length;
}

function quarantineEntry(
  raw: unknown,
  sourceIndex: number,
  issues: NoteValidationIssue[],
  createId: NoteIdFactory,
): QuarantinedNoteRecord {
  return {
    id: createId('quarantine'),
    sourceIndex,
    raw: cloneUnknown(raw),
    issues: issues.map((issue) => ({ ...issue })),
  };
}

function canonicalizeVersionOne(
  candidate: UnknownRecord,
  createId: NoteIdFactory,
): NoteDocumentReadResult {
  const topLevelIssues: NoteValidationIssue[] = [];
  if (!safeInteger(candidate.revision)) {
    topLevelIssues.push({
      path: '$.revision',
      message: 'must be a non-negative safe integer',
    });
  }
  if (!Array.isArray(candidate.notes)) {
    topLevelIssues.push({ path: '$.notes', message: 'must be an array' });
  } else if (candidate.notes.length > NOTE_MAX_RECORDS) {
    topLevelIssues.push({
      path: '$.notes',
      message: `cannot contain more than ${NOTE_MAX_RECORDS} records`,
    });
  }
  if (candidate.quarantine !== undefined && !Array.isArray(candidate.quarantine)) {
    topLevelIssues.push({ path: '$.quarantine', message: 'must be an array when present' });
  }
  if (topLevelIssues.length > 0) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'The saved Notes Library has invalid document fields and was left untouched.',
      issues: topLevelIssues,
    };
  }

  const notes: NoteRecord[] = [];
  const quarantine: QuarantinedNoteRecord[] = [];
  const usedNoteIds = new Set<string>();
  let migrated = candidate.quarantine === undefined;

  (candidate.notes as unknown[]).forEach((raw, index) => {
    const issues = validateNoteRecord(raw, `$.notes[${index}]`);
    const note = record(raw);
    if (
      issues.length === 0
      && note
      && typeof note.id === 'string'
      && usedNoteIds.has(note.id)
    ) {
      issues.push({
        path: `$.notes[${index}].id`,
        message: 'duplicates another note ID',
      });
    }
    if (issues.length > 0) {
      quarantine.push(quarantineEntry(raw, index, issues, createId));
      migrated = true;
      return;
    }
    const valid = cloneNoteRecord(raw as NoteRecord);
    usedNoteIds.add(valid.id);
    notes.push(valid);
  });

  if (Array.isArray(candidate.quarantine)) {
    candidate.quarantine.forEach((raw, index) => {
      if (isQuarantinedNoteRecord(raw)) {
        quarantine.push({
          id: raw.id,
          sourceIndex: raw.sourceIndex,
          raw: cloneUnknown(raw.raw),
          issues: raw.issues.map((issue) => ({ ...issue })),
        });
        return;
      }
      quarantine.push(quarantineEntry(raw, index, [{
        path: `$.quarantine[${index}]`,
        message: 'contains an invalid quarantine entry',
      }], createId));
      migrated = true;
    });
  }

  const library: NoteLibrary = {
    version: NOTE_LIBRARY_VERSION,
    revision: candidate.revision as number,
    notes,
    quarantine,
  };
  if (!isNoteLibrary(library)) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'The saved Notes Library could not be isolated safely and was left untouched.',
      issues: [{ path: '$', message: 'could not produce a valid isolated Notes Library' }],
    };
  }
  return {
    ok: true,
    library,
    migrated,
    warnings: quarantine.length > 0
      ? [`Isolated ${quarantine.length} invalid note record${quarantine.length === 1 ? '' : 's'} for recovery.`]
      : [],
  };
}

interface LegacyNoteRecordV0 {
  id: string;
  title?: string;
  body?: string;
  createdAt?: number;
  updatedAt?: number;
}

function migrateVersionZero(
  candidate: UnknownRecord,
  now: number,
  createId: NoteIdFactory,
): NoteDocumentReadResult {
  if (!Array.isArray(candidate.notes)) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'The saved Notes Library uses an invalid legacy format and was left untouched.',
      issues: [{ path: '$.notes', message: 'must be an array' }],
    };
  }
  const notes: NoteRecord[] = [];
  const quarantine: QuarantinedNoteRecord[] = [];
  const usedIds = new Set<string>();
  candidate.notes.forEach((raw, index) => {
    const legacy = record(raw);
    const issues: NoteValidationIssue[] = [];
    if (!legacy) {
      issues.push({ path: `$.notes[${index}]`, message: 'must be an object' });
    } else {
      if (!boundedText(legacy.id, MAX_ID_LENGTH, false)) {
        issues.push({ path: `$.notes[${index}].id`, message: 'must be a bounded non-empty string' });
      } else if (usedIds.has(legacy.id)) {
        issues.push({ path: `$.notes[${index}].id`, message: 'duplicates another note ID' });
      }
      if (legacy.title !== undefined && !boundedText(legacy.title, MAX_TITLE_LENGTH)) {
        issues.push({ path: `$.notes[${index}].title`, message: 'is too long' });
      }
      if (legacy.body !== undefined && !boundedText(legacy.body, MAX_BODY_LENGTH)) {
        issues.push({ path: `$.notes[${index}].body`, message: 'is too long' });
      }
    }
    if (issues.length > 0 || !legacy) {
      quarantine.push(quarantineEntry(raw, index, issues, createId));
      return;
    }
    const createdAt = safeInteger(legacy.createdAt) ? legacy.createdAt : now;
    const updatedAt = safeInteger(legacy.updatedAt) && legacy.updatedAt >= createdAt
      ? legacy.updatedAt
      : createdAt;
    const note = createNote({
      kind: 'scratchpad',
      title: legacy.title as string | undefined,
      body: legacy.body as string | undefined,
      order: index,
    }, {
      id: legacy.id as string,
      now: createdAt,
      createId,
    });
    note.updatedAt = updatedAt;
    usedIds.add(note.id);
    notes.push(note);
  });
  return {
    ok: true,
    library: {
      version: NOTE_LIBRARY_VERSION,
      revision: safeInteger(candidate.revision) ? candidate.revision : 0,
      notes,
      quarantine,
    },
    migrated: true,
    warnings: [
      'Migrated the saved Notes Library from version 0 to version 1.',
      ...(quarantine.length > 0
        ? [`Isolated ${quarantine.length} invalid legacy note record${quarantine.length === 1 ? '' : 's'} for recovery.`]
        : []),
    ],
  };
}

/**
 * Validate and migrate a stored Notes Library. Future versions fail closed so
 * callers can leave the original IndexedDB value untouched.
 */
export function parseNoteLibraryDocument(
  value: unknown,
  options: {
    now?: number;
    createId?: NoteIdFactory;
  } = {},
): NoteDocumentReadResult {
  const candidate = record(value);
  if (!candidate || !Number.isInteger(candidate.version)) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'The saved Notes Library is not a recognized document and was left untouched.',
      issues: [{ path: '$.version', message: 'must be a supported integer version' }],
    };
  }
  if ((candidate.version as number) > NOTE_LIBRARY_VERSION) {
    return {
      ok: false,
      reason: 'future-version',
      message: 'This Notes Library was created by a newer version of Encounterizer and was left untouched.',
      issues: [{
        path: '$.version',
        message: `version ${candidate.version} is newer than supported version ${NOTE_LIBRARY_VERSION}`,
      }],
    };
  }
  const createId = options.createId ?? createNoteId;
  if (candidate.version === 0) {
    return migrateVersionZero(candidate, options.now ?? Date.now(), createId);
  }
  return canonicalizeVersionOne(candidate, createId);
}

export function compareNotes(left: NoteRecord, right: NoteRecord): number {
  return left.order - right.order
    || left.createdAt - right.createdAt
    || left.id.localeCompare(right.id);
}

function assertValidReducerNote(note: NoteRecord): void {
  const issues = validateNoteRecord(note);
  if (issues.length > 0) {
    throw new TypeError(
      `The note change is invalid: ${issues[0].path} ${issues[0].message}.`,
    );
  }
}

/**
 * Pure note-domain transitions. Repository code owns revision increments;
 * reducers preserve note identity and return a new library value.
 */
export function reduceNoteLibrary(
  library: NoteLibrary,
  action: NoteLibraryAction,
): NoteLibrary {
  if (action.type === 'add-note') {
    if (library.notes.some((note) => note.id === action.note.id)) {
      throw new TypeError(`A note with ID "${action.note.id}" already exists.`);
    }
    const note = cloneNoteRecord(action.note);
    assertValidReducerNote(note);
    return {
      ...cloneNoteLibrary(library),
      notes: [...library.notes.map(cloneNoteRecord), note],
    };
  }

  const noteIndex = library.notes.findIndex((note) => note.id === action.noteId);
  if (noteIndex < 0) return library;
  if (!safeInteger(action.updatedAt)) {
    throw new TypeError('A note transition requires a valid updatedAt timestamp.');
  }

  if (action.type === 'update-note') {
    const current = library.notes[noteIndex];
    const candidate: NoteRecord = {
      ...cloneNoteRecord(current),
      ...action.changes,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: Math.max(current.updatedAt, action.updatedAt),
      ...(action.changes.items
        ? { items: action.changes.items.map((item) => ({ ...item })) }
        : {}),
      ...(action.changes.tags ? { tags: [...action.changes.tags] } : {}),
      ...(action.changes.scope
        ? { scope: { ...action.changes.scope } }
        : {}),
      ...(action.changes.links
        ? { links: action.changes.links.map((link) => ({ ...link })) }
        : {}),
    };
    assertValidReducerNote(candidate);
    return {
      ...cloneNoteLibrary(library),
      notes: library.notes.map((note, index) => (
        index === noteIndex ? candidate : cloneNoteRecord(note)
      )),
    };
  }

  if (!Number.isSafeInteger(action.toIndex)) {
    throw new TypeError('A note move requires a valid target index.');
  }
  const ordered = library.notes.map(cloneNoteRecord).sort(compareNotes);
  const fromIndex = ordered.findIndex((note) => note.id === action.noteId);
  const [moving] = ordered.splice(fromIndex, 1);
  const targetIndex = Math.max(
    0,
    Math.min(Math.trunc(action.toIndex), ordered.length),
  );
  ordered.splice(targetIndex, 0, moving);
  const notes = ordered.map((note, order) => ({
    ...note,
    order,
    updatedAt: note.id === action.noteId
      ? Math.max(note.updatedAt, action.updatedAt)
      : note.updatedAt,
  }));
  return {
    ...cloneNoteLibrary(library),
    notes,
  };
}

export function orderedNotes(
  library: NoteLibrary,
  options: {
    includeArchived?: boolean;
    scope?: NoteEntityReference;
  } = {},
): NoteRecord[] {
  return library.notes
    .filter((note) => options.includeArchived || note.status !== 'archived')
    .filter((note) => !options.scope || (
      note.scope?.type === options.scope.type
      && note.scope.id === options.scope.id
    ))
    .map(cloneNoteRecord)
    .sort(compareNotes);
}

export function serializeNoteLibrary(library: NoteLibrary): string {
  const canonical: NoteLibrary = {
    ...cloneNoteLibrary(library),
    notes: library.notes.map(cloneNoteRecord).sort(compareNotes),
  };
  return JSON.stringify(canonical, null, 2);
}

export function noteLibraryToMarkdown(
  library: NoteLibrary,
  options: {
    includeArchived?: boolean;
    scope?: NoteEntityReference;
  } = {},
): string {
  const lines = ['# Encounterizer Notes', ''];
  for (const note of orderedNotes(library, options)) {
    const title = note.title?.trim() || (
      note.kind === 'checklist' ? 'Checklist'
        : note.kind === 'sticky' ? 'Sticky note'
          : 'Scratchpad'
    );
    lines.push(`## ${title}`, '');
    if (note.status !== 'active') lines.push(`_${note.status}_`, '');
    if (note.body) lines.push(note.body, '');
    if (note.kind === 'checklist') {
      const items = [...note.items].sort((left, right) => (
        left.order - right.order || left.id.localeCompare(right.id)
      ));
      for (const item of items) {
        lines.push(`- [${item.completed ? 'x' : ' '}] ${item.text}`);
      }
      if (items.length > 0) lines.push('');
    }
    if (note.tags.length > 0) lines.push(`Tags: ${note.tags.join(', ')}`, '');
  }
  return lines.join('\n').trimEnd();
}

function allocateUniqueId(
  requested: string,
  used: Set<string>,
  createId: NoteIdFactory,
  kind: NoteIdKind,
): string {
  if (requested && !used.has(requested)) {
    used.add(requested);
    return requested;
  }
  let next = createId(kind);
  let attempts = 0;
  while ((!next || used.has(next)) && attempts < 10_000) {
    next = createId(kind);
    attempts += 1;
  }
  if (!next || used.has(next)) {
    throw new Error(`Could not allocate a unique ${kind} ID.`);
  }
  used.add(next);
  return next;
}

/**
 * Merge without overwriting an existing note. Colliding imported IDs are
 * remapped and reported so a caller importing linked artifacts can repair
 * those references in the same higher-level plan.
 */
export function mergeNoteLibraries(
  current: NoteLibrary,
  incoming: NoteLibrary,
  options: { createId?: NoteIdFactory } = {},
): NoteLibraryMergeResult {
  const createId = options.createId ?? createNoteId;
  const usedNoteIds = new Set(current.notes.map((note) => note.id));
  const usedQuarantineIds = new Set(current.quarantine.map((entry) => entry.id));
  const idRemaps: NoteIdRemap[] = [];
  const maxOrder = current.notes.reduce((max, note) => Math.max(max, note.order), -1);
  const imported = [...incoming.notes].sort(compareNotes).map((source, index) => {
    const id = allocateUniqueId(source.id, usedNoteIds, createId, 'note');
    if (id !== source.id) idRemaps.push({ from: source.id, to: id });
    return {
      ...cloneNoteRecord(source),
      id,
      order: maxOrder + index + 1,
    };
  });
  const quarantine = incoming.quarantine.map((source) => ({
    id: allocateUniqueId(source.id, usedQuarantineIds, createId, 'quarantine'),
    sourceIndex: source.sourceIndex,
    raw: cloneUnknown(source.raw),
    issues: source.issues.map((issue) => ({ ...issue })),
  }));
  return {
    library: {
      version: NOTE_LIBRARY_VERSION,
      revision: current.revision,
      notes: [...current.notes.map(cloneNoteRecord), ...imported],
      quarantine: [
        ...current.quarantine.map((entry) => ({
          ...entry,
          raw: cloneUnknown(entry.raw),
          issues: entry.issues.map((issue) => ({ ...issue })),
        })),
        ...quarantine,
      ],
    },
    idRemaps,
  };
}
