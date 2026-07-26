'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Expand,
  FileText,
  FolderPlus,
  GripVertical,
  Link as LinkIcon,
  LayoutTemplate,
  Columns3,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  Printer,
  RefreshCw,
  Settings2,
  Sparkles,
  Swords,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';
import { useMonsters } from '@/app/hooks/useMonsters';
import { useSpells } from '@/app/hooks/useSpells';
import { useBattleStore } from '@/app/hooks/useBattleStore';
import { useCustomMonsters } from '@/app/hooks/useCustomMonsters';
import { useCustomSpells } from '@/app/hooks/useCustomSpells';
import { useDmScreenStore } from '@/app/hooks/useDmScreenStore';
import { useDmScreenFocusMode } from '@/app/hooks/useDmScreenFocusMode';
import { useNotesLibrary } from '@/app/hooks/useNotesLibrary';
import { usePartyLibrary } from '@/app/hooks/usePartyLibrary';
import BattleOrganizer from '@/components/BattleOrganizer';
import DmScreenBackupPanel from '@/components/DmScreenBackupPanel';
import DmScreenModal from '@/components/DmScreenModal';
import DmScreenQuickAddDrawer, {
  type DmScreenQuickAddActionResult,
} from '@/components/DmScreenQuickAddDrawer';
import DmScreenTemplateChooser, {
  type DmScreenTemplateAction,
} from '@/components/DmScreenTemplateChooser';
import DmPartyPanel from '@/components/DmPartyPanel';
import DmScreenScratchpad from '@/components/DmScreenScratchpad';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import RulesReference from '@/components/RulesReference';
import ToolPageHeader from '@/components/ToolPageHeader';
import { levelLabel, type Spell } from '@/data/spells';
import { getMonsterPhysicalDescription } from '@/data/monster-description-index';
import {
  EMPTY_DM_SCREEN,
  appendItemToSectionTree,
  dmScreenToMarkdown,
  duplicateDmScreenItem,
  effectiveDmScreenPanelWidth,
  getDmScreenPanelLocation,
  hasDmPartyItem,
  mergeDmScreenDocuments,
  minimumDmScreenPanelWidth,
  moveDmScreenPanel,
  reduceDmScreenGrid,
  reduceDmScreenPanelDisplay,
  removeSectionTree,
  syncDmPartySnapshot,
  syncPinnedItems,
  updateSectionTree,
  type DmScreenItem,
  type DmScreenItemKind,
  type DmScreenIdFactory,
  type DmScreenPanelDisplayAction,
  type DmScreenPanelMoveAction,
  type DmScreenPanelWidth,
  type DmScreenSection,
  type DmScreenState,
} from '@/lib/dm-screen';
import {
  isDmScreenWorkspaceMode,
  type DmScreenWorkspaceMode,
} from '@/lib/dm-screen-workspace';
import {
  createDmScreenExportEnvelope,
  planDmScreenImport,
  type DmScreenImportCandidate,
  type DmScreenImportMode,
} from '@/lib/dm-screen-import';
import {
  createDmScreenFromTemplate,
  type DmScreenTemplateDefinition,
} from '@/lib/dm-screen-templates';
import { getActiveParty } from '@/lib/party';
import { partyToDmScreenSummary } from '@/lib/party-adapters';
import {
  createNote,
  type NoteLibrary,
  type NoteRecord,
} from '@/lib/notes';
import { planDmScreenNoteMigration } from '@/lib/notes-dm-screen';
import {
  NoteStorageError,
  type NoteRepositoryStatus,
  type NoteWriteResult,
} from '@/lib/notes-repository';
import { DM_SCREEN_DEFAULT_TOOL_PATH, DM_SCREEN_TOOL_ROUTES } from '@/lib/site';
import type { Monster } from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function flattenSections(sections: DmScreenSection[], depth = 0): { id: string; label: string }[] {
  return sections.flatMap((section) => [
    { id: section.id, label: `${'— '.repeat(depth)}${section.title}` },
    ...flattenSections(section.children, depth + 1),
  ]);
}

function countScreenTree(sections: readonly DmScreenSection[]): { sections: number; panels: number } {
  return sections.reduce((counts, section) => {
    const children = countScreenTree(section.children);
    return {
      sections: counts.sections + 1 + children.sections,
      panels: counts.panels + section.items.length + children.panels,
    };
  }, { sections: 0, panels: 0 });
}

interface DmScreenItemLocation {
  item: DmScreenItem;
  sectionId: string;
  sectionTitle: string;
}

interface DmScreenDropPreview {
  sourceItemId: string;
  targetItemId: string;
  position: 'before' | 'after';
}

function collectScreenItems(
  sections: readonly DmScreenSection[],
): DmScreenItemLocation[] {
  return sections.flatMap((section) => [
    ...section.items.map((item) => ({
      item,
      sectionId: section.id,
      sectionTitle: section.title,
    })),
    ...collectScreenItems(section.children),
  ]);
}

function panelKindLabel(kind: DmScreenItemKind): string {
  if (kind === 'initiative') return 'Initiative';
  if (kind === 'rules') return 'Rules';
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

function panelWidthLabel(width: DmScreenPanelWidth): string {
  return width === 'compact' ? 'Compact'
    : width === 'standard' ? 'Standard'
      : width === 'wide' ? 'Wide'
        : 'Full';
}

function defaultItemLayout(kind: DmScreenItemKind): DmScreenItem['layout'] {
  return {
    width: minimumDmScreenPanelWidth(kind),
    stashed: false,
    excludedFromPrint: false,
  };
}

function prepareImportedScreen(
  screen: DmScreenState,
  mode: DmScreenImportMode,
  namespace: string,
): DmScreenState {
  let sectionIndex = 0;
  let itemIndex = 0;
  const prepare = (section: DmScreenSection): DmScreenSection => ({
    ...section,
    id: mode === 'merge' ? `${namespace}-section-${++sectionIndex}` : section.id,
    items: section.items.map((item) => ({
      ...item,
      id: mode === 'merge' ? `${namespace}-item-${++itemIndex}` : item.id,
      ...(item.origin === 'auto-pin' ? { origin: 'manual' as const } : {}),
    })),
    children: section.children.map(prepare),
  });
  return { ...screen, sections: screen.sections.map(prepare) };
}

function deterministicDocumentIds(namespace: string): { createId: DmScreenIdFactory } {
  let next = 0;
  return { createId: (kind) => `${namespace}-${kind}-collision-${++next}` };
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalJson(entry)]));
}

function sameResourceDefinition(
  left: { source?: unknown },
  right: { source?: unknown },
): boolean {
  const { source: _leftSource, ...leftDefinition } = left;
  const { source: _rightSource, ...rightDefinition } = right;
  return JSON.stringify(canonicalJson(leftDefinition))
    === JSON.stringify(canonicalJson(rightDefinition));
}

function ScreenSaveStatus({
  hydrated,
  status,
  dirty,
  error,
  onRetry,
}: {
  hydrated: boolean;
  status: ReturnType<typeof useDmScreenStore>['status'];
  dirty: boolean;
  error: ReturnType<typeof useDmScreenStore>['error'];
  onRetry: () => void;
}) {
  if (!hydrated || status === 'idle' || status === 'loading') {
    return <p className="mt-2 text-xs text-[var(--text-3)]" role="status">Loading saved screen…</p>;
  }
  if (status === 'saving') {
    return <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--text-2)]" role="status"><RefreshCw size={14} className="animate-spin" aria-hidden="true" /> Saving screen…</p>;
  }
  if (status === 'error' || status === 'unavailable') {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] p-3 text-sm" role="alert">
        <p><strong>{dirty ? 'Screen changes are only available in this tab.' : 'The saved screen was left untouched.'}</strong> {error?.message ?? 'Browser storage is unavailable.'}</p>
        <button type="button" className="btn-secondary text-xs" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Retry</button>
      </div>
    );
  }
  return <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--text-3)]" role="status"><CheckCircle2 size={14} className="text-[var(--status-success)]" aria-hidden="true" /> Saved in this browser</p>;
}

export default function DmScreenPage() {
  const {
    screen,
    status: screenStatus,
    hydrated: screenHydrated,
    dirty: screenDirty,
    firstUse: screenFirstUse,
    replacementUndo,
    error: screenError,
    updateScreen,
    replaceScreen,
    undoScreenReplacement,
    acknowledgeFirstUse,
    retryScreenStorage,
  } = useDmScreenStore();
  const setScreen = useCallback((transform: (current: DmScreenState) => DmScreenState) => {
    void updateScreen(transform);
  }, [updateScreen]);
  const { battle, replaceBattle } = useBattleStore();
  const {
    library: partyLibrary,
    hydrated: partyLibraryHydrated,
    status: partyLibraryStatus,
  } = usePartyLibrary();
  const {
    library: notesLibrary,
    hydrated: notesHydrated,
    status: notesStatus,
    error: notesError,
    warnings: notesWarnings,
    updateNotes,
  } = useNotesLibrary();
  const noteMap = useMemo(
    () => new Map((notesLibrary?.notes ?? []).map((note) => [note.id, note])),
    [notesLibrary],
  );
  const saveScratchpad = useCallback((
    noteId: string,
    nextBody: string,
  ): Promise<NoteWriteResult> => {
    if (!notesLibrary?.notes.some((note) => note.id === noteId)) {
      return Promise.resolve({
        ok: false,
        error: new NoteStorageError(
          'invalid-document',
          'This scratchpad is no longer available in the Notes Library.',
        ),
      });
    }
    return updateNotes((current) => {
      const index = current.notes.findIndex((note) => note.id === noteId);
      if (index < 0 || current.notes[index].body === nextBody) return current;
      const savedAt = Math.max(Date.now(), current.notes[index].updatedAt);
      return {
        ...current,
        notes: current.notes.map((note, noteIndex) => noteIndex === index
          ? { ...note, body: nextBody, updatedAt: savedAt }
          : note),
      };
    });
  }, [notesLibrary, updateNotes]);
  const activeParty = partyLibrary ? getActiveParty(partyLibrary) : null;
  const currentPartySummary = useMemo(
    () => activeParty ? partyToDmScreenSummary(activeParty) : null,
    [activeParty],
  );
  const partyLibraryCanRefresh = partyLibraryHydrated && partyLibrary !== null;
  const partySummary = currentPartySummary
    ?? (!partyLibraryCanRefresh ? screen?.partySnapshot ?? null : null);
  const containsPartyItem = useMemo(
    () => screen ? hasDmPartyItem(screen.sections) : false,
    [screen],
  );
  const [pinnedMonsterIds, , pinnedMonsterIdsHydrated] = usePersistentState<string[]>('bestiaryPinnedMonsters', [], (value): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
  const [pinnedSpellIds, , pinnedSpellIdsHydrated] = usePersistentState<string[]>('pinnedSpells', [], (value): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
  const [workspaceMode, setWorkspaceMode] = usePersistentState<DmScreenWorkspaceMode>('dmScreenWorkspaceMode', 'run', isDmScreenWorkspaceMode);
  const arranging = workspaceMode === 'arrange';
  const { all: monsters } = useMonsters();
  const spells = useSpells();
  const { addMonsters, removeMonster } = useCustomMonsters();
  const { addSpells, removeSpell } = useCustomSpells();
  const monsterMap = useMemo(() => new Map(monsters.map((monster) => [monster.id, monster])), [monsters]);
  const spellMap = useMemo(() => new Map(spells.map((spell) => [spell.id, spell])), [spells]);
  const sectionOptions = useMemo(() => flattenSections(screen?.sections ?? []), [screen]);
  const [targetSectionId, setTargetSectionId] = useState('');
  const [addKind, setAddKind] = useState<DmScreenItemKind>('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  const [toolPath, setToolPath] = useState<string>(DM_SCREEN_DEFAULT_TOOL_PATH);
  const selectedTargetSectionId = sectionOptions.some((section) => section.id === targetSectionId)
    ? targetSectionId
    : sectionOptions[0]?.id ?? '';
  const screenAvailable = screen !== null;
  const templateSourcesReady = partyLibraryHydrated
    && pinnedMonsterIdsHydrated
    && pinnedSpellIdsHydrated;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [stashTrayOpen, setStashTrayOpen] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [dropPreview, setDropPreview] = useState<DmScreenDropPreview | null>(null);
  const [templateNotice, setTemplateNotice] = useState<{
    kind: 'replace' | 'notice' | 'error';
    message: string;
  } | null>(null);
  const templateButtonRef = useRef<HTMLButtonElement>(null);
  const quickAddButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const stashTrayButtonRef = useRef<HTMLButtonElement>(null);
  const panelFocusReturnRef = useRef<HTMLElement>(null);
  const suppressTrayReturnFocusRef = useRef(false);
  const moreHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingPanelFocusRef = useRef<string | null>(null);
  const pendingMoveFocusRef = useRef<string | null>(null);
  const pendingStashButtonFocusRef = useRef(false);
  const templateNoticeRef = useRef<HTMLDivElement>(null);
  const sawReplacementUndo = useRef(false);
  const noteMigrationRunningRef = useRef(false);
  const quickNoteDraftRef = useRef<{
    noteId: string;
    panelId: string;
  } | null>(null);
  const {
    focusButtonRef,
    focused: screenFocused,
    nativeFullscreen,
    nativeFullscreenAvailable,
    statusMessage: focusStatusMessage,
    toggleFocus,
    enterBrowserFullscreen,
    exitFocus,
  } = useDmScreenFocusMode(
    quickAddOpen || moreOpen || templatesOpen || stashTrayOpen || focusedItemId !== null,
  );
  const screenCounts = useMemo(
    () => countScreenTree(screen?.sections ?? []),
    [screen?.sections],
  );
  const screenItems = useMemo(
    () => collectScreenItems(screen?.sections ?? []),
    [screen?.sections],
  );
  const stashedPanels = useMemo(
    () => screenItems.filter(({ item }) => item.layout.stashed),
    [screenItems],
  );
  const focusedPanel = focusedItemId
    ? screenItems.find(({ item }) => item.id === focusedItemId) ?? null
    : null;

  useEffect(() => {
    if (replacementUndo) {
      sawReplacementUndo.current = true;
      return;
    }
    if (!sawReplacementUndo.current) return;
    sawReplacementUndo.current = false;
    setTemplateNotice((current) => current?.kind === 'replace' ? null : current);
  }, [replacementUndo]);

  useEffect(() => {
    if (!templateNotice) return;
    window.requestAnimationFrame(() => templateNoticeRef.current?.focus());
  }, [templateNotice]);

  useEffect(() => {
    if (!moreOpen) return;
    const frame = window.requestAnimationFrame(() => moreHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen && !templatesOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (templatesOpen) {
        acknowledgeFirstUse();
        setTemplatesOpen(false);
        window.requestAnimationFrame(() => templateButtonRef.current?.focus());
        return;
      }
      setMoreOpen(false);
      window.requestAnimationFrame(() => moreButtonRef.current?.focus());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [acknowledgeFirstUse, moreOpen, templatesOpen]);

  useEffect(() => {
    const preparePrint = () => flushSync(() => setPrinting(true));
    const finishPrint = () => setPrinting(false);
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', finishPrint);
    return () => {
      window.removeEventListener('beforeprint', preparePrint);
      window.removeEventListener('afterprint', finishPrint);
    };
  }, []);

  useEffect(() => {
    if (!focusedItemId || focusedPanel) return;
    const frame = window.requestAnimationFrame(() => setFocusedItemId(null));
    return () => window.cancelAnimationFrame(frame);
  }, [focusedItemId, focusedPanel]);

  useEffect(() => {
    if (!pendingStashButtonFocusRef.current || stashedPanels.length === 0) return;
    pendingStashButtonFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => stashTrayButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [stashedPanels.length]);

  useEffect(() => {
    if (quickAddOpen || stashTrayOpen || focusedItemId) return;
    const panelId = pendingPanelFocusRef.current;
    if (!panelId) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = document.getElementById(`dm-screen-panel-${panelId}`);
      if (!panel) return;
      pendingPanelFocusRef.current = null;
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedItemId, quickAddOpen, screen, stashTrayOpen]);

  useEffect(() => {
    const panelId = pendingMoveFocusRef.current;
    if (!panelId) return;
    const frame = window.requestAnimationFrame(() => {
      const control = document.getElementById(`dm-screen-move-section-${panelId}`);
      if (!(control instanceof HTMLElement)) return;
      pendingMoveFocusRef.current = null;
      control.focus({ preventScroll: true });
      document.getElementById(`dm-screen-panel-${panelId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(() => {
    if (!screenAvailable) return;
    setScreen((current) => {
      const next = syncPinnedItems(
        current,
        pinnedMonsterIds,
        pinnedSpellIds,
        (resourceId) => monsterMap.get(resourceId)?.name,
        (resourceId) => spellMap.get(resourceId)?.name,
      );
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [monsterMap, pinnedMonsterIds, pinnedSpellIds, screen?.autoAddPinnedMonsters, screen?.autoAddPinnedSpells, screenAvailable, setScreen, spellMap]);

  useEffect(() => {
    if (!screenAvailable) return;
    if (containsPartyItem && !partyLibraryCanRefresh) return;
    setScreen((current) => syncDmPartySnapshot(current, currentPartySummary));
  }, [containsPartyItem, currentPartySummary, partyLibraryCanRefresh, screenAvailable, setScreen]);

  useEffect(() => {
    if (
      !screen
      || !notesHydrated
      || !notesLibrary
      || notesStatus !== 'saved'
      || noteMigrationRunningRef.current
    ) return;
    const initialPlan = planDmScreenNoteMigration(screen, notesLibrary);
    if (
      initialPlan.createdNoteIds.length === 0
      && initialPlan.linkedPanelIds.length === 0
    ) return;

    noteMigrationRunningRef.current = true;
    void (async () => {
      let durableLibrary = initialPlan.library;
      if (initialPlan.createdNoteIds.length > 0) {
        const notesResult = await updateNotes((current) => {
          const latestPlan = planDmScreenNoteMigration(screen, current);
          durableLibrary = latestPlan.library;
          return latestPlan.library;
        });
        if (!notesResult.ok) {
          setWorkspaceError(
            notesResult.error?.message
            ?? 'Inline notes remain on the DM Screen because the Notes Library could not save them.',
          );
          return;
        }
      }

      const screenResult = await updateScreen((current) => (
        planDmScreenNoteMigration(current, durableLibrary).screen
      ));
      if (!screenResult.ok && !screenResult.queued) {
        setWorkspaceError(
          screenResult.error?.message
          ?? 'Notes were saved, but the DM Screen could not link them yet.',
        );
        return;
      }
      setWorkspaceError('');
      setWorkspaceNotice(
        `Moved ${initialPlan.linkedPanelIds.length} note panel${initialPlan.linkedPanelIds.length === 1 ? '' : 's'} into the durable Notes Library.`,
      );
    })().finally(() => {
      noteMigrationRunningRef.current = false;
    });
  }, [
    notesHydrated,
    notesLibrary,
    notesStatus,
    screen,
    updateNotes,
    updateScreen,
  ]);

  function screenForExport(): DmScreenState | null {
    if (!screen) return null;
    return containsPartyItem && !partyLibraryCanRefresh
      ? screen
      : syncDmPartySnapshot(screen, currentPartySummary);
  }

  const resourceResults = useMemo(() => {
    const query = resourceQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    if (addKind === 'monster') return monsters
      .filter((monster) => monster.name.toLowerCase().includes(query))
      .slice(0, 10)
      .map((monster) => ({ id: monster.id, name: monster.name, detail: `CR ${monster.challengeRating} · ${monster.type}` }));
    if (addKind === 'spell') return spells
      .filter((spell) => spell.name.toLowerCase().includes(query))
      .slice(0, 10)
      .map((spell) => ({ id: spell.id, name: spell.name, detail: `${levelLabel(spell.level)} · ${spell.school}` }));
    return [];
  }, [addKind, monsters, resourceQuery, spells]);

  async function addSection(
    parentId?: string,
    requestedTitle?: string,
  ): Promise<DmScreenQuickAddActionResult> {
    const section: DmScreenSection = {
      id: id('section'),
      title: requestedTitle?.trim() || 'New section',
      collapsed: false,
      items: [],
      children: [],
    };
    const result = await updateScreen((current) => ({
        ...current,
        sections: parentId
          ? updateSectionTree(current.sections, parentId, (parent) => ({ ...parent, collapsed: false, children: [...parent.children, section] }))
          : [...current.sections, section],
      }));
    if (!result.ok && !result.queued) {
      const message = result.error?.message ?? 'That section could not be created. Nothing was changed.';
      setWorkspaceNotice(message);
      setWorkspaceError(message);
      return { ok: false, error: message };
    }
    setWorkspaceError('');
    setTargetSectionId(section.id);
    setWorkspaceNotice(result.queued
      ? `${section.title} was created in this tab but still needs to be saved.`
      : `${section.title} was created.`);
    return { ok: true };
  }

  async function addItem(item: DmScreenItem): Promise<DmScreenQuickAddActionResult> {
    if (!selectedTargetSectionId) {
      return { ok: false, error: 'Create a section before adding a panel.' };
    }
    const result = await updateScreen((current) => ({
      ...current,
      sections: appendItemToSectionTree(current.sections, selectedTargetSectionId, item),
    }));
    if (!result.ok && !result.queued) {
      const message = result.error?.message ?? 'That panel could not be added. Your draft is still here.';
      setWorkspaceNotice(message);
      setWorkspaceError(message);
      return { ok: false, error: message };
    }
    setWorkspaceError('');
    pendingPanelFocusRef.current = item.id;
    setQuickAddOpen(false);
    setWorkspaceNotice(result.queued
      ? `${item.title} was added in this tab but still needs to be saved.`
      : `${item.title} was added to the screen.`);
    setTitle('');
    setBody('');
    setResourceQuery('');
    return { ok: true };
  }

  async function addConfiguredItem(): Promise<DmScreenQuickAddActionResult> {
    if (addKind === 'note' && (title.trim() || body.trim())) {
      if (!screen || !notesHydrated || !notesLibrary) {
        return {
          ok: false,
          error: 'The durable Notes Library is still loading. Your draft is still here.',
        };
      }
      const draftIds = quickNoteDraftRef.current ?? {
        noteId: id('note'),
        panelId: id('note-panel'),
      };
      quickNoteDraftRef.current = draftIds;
      const noteTitle = title.trim() || 'Scratchpad';
      const noteBody = body.trim();
      const createdAt = Date.now();
      const noteResult = await updateNotes((current) => {
        const existingIndex = current.notes.findIndex((note) => note.id === draftIds.noteId);
        if (existingIndex >= 0) {
          return {
            ...current,
            notes: current.notes.map((note, index) => index === existingIndex
              ? {
                  ...note,
                  title: noteTitle,
                  body: noteBody,
                  updatedAt: Math.max(createdAt, note.updatedAt),
                }
              : note),
          };
        }
        const nextOrder = current.notes.reduce(
          (max, note) => Math.max(max, note.order),
          -1,
        ) + 1;
        return {
          ...current,
          notes: [...current.notes, createNote({
            kind: 'scratchpad',
            title: noteTitle,
            body: noteBody,
            order: nextOrder,
            size: 'wide',
            scope: {
              type: 'screen',
              id: screen.id,
              label: screen.title,
            },
            links: [{
              type: 'dm-screen-panel',
              id: draftIds.panelId,
              label: noteTitle,
            }],
          }, {
            id: draftIds.noteId,
            now: createdAt,
          })],
        };
      });
      if (!noteResult.ok) {
        return {
          ok: false,
          error: noteResult.error?.message
            ?? 'The scratchpad could not be saved. Your draft is still here.',
        };
      }
      const panelResult = await addItem({
        id: draftIds.panelId,
        kind: 'note',
        title: noteTitle,
        resourceId: draftIds.noteId,
        collapsed: false,
        layout: { ...defaultItemLayout('note'), width: 'wide' },
        origin: 'manual',
      });
      if (panelResult.ok) quickNoteDraftRef.current = null;
      return panelResult;
    }
    if (addKind === 'tool') {
      const route = DM_SCREEN_TOOL_ROUTES.find((candidate) => candidate.path === toolPath)!;
      return addItem({ id: id('tool'), kind: 'tool', title: title.trim() || route.title, body: body.trim() || route.description, href: route.path, collapsed: false, layout: defaultItemLayout('tool'), origin: 'manual' });
    }
    if (addKind === 'initiative') {
      return addItem({ id: id('initiative'), kind: 'initiative', title: title.trim() || 'Initiative Tracker', collapsed: false, layout: defaultItemLayout('initiative'), origin: 'manual' });
    }
    if (addKind === 'rules') {
      return addItem({ id: id('rules'), kind: 'rules', title: title.trim() || 'Table Rules Reference', collapsed: false, layout: defaultItemLayout('rules'), origin: 'manual' });
    }
    if (addKind === 'party') {
      return addItem({ id: id('party'), kind: 'party', title: title.trim() || 'Active Party', collapsed: false, layout: defaultItemLayout('party'), origin: 'manual' });
    }
    return { ok: false, error: 'Choose a supported panel and finish its required fields.' };
  }

  function addResource(
    resourceId: string,
    resourceTitle: string,
  ): Promise<DmScreenQuickAddActionResult> {
    return addItem({ id: id(addKind), kind: addKind, title: resourceTitle, resourceId, collapsed: false, layout: defaultItemLayout(addKind), origin: 'manual' });
  }

  function openQuickAdd(): void {
    setMoreOpen(false);
    setTemplatesOpen(false);
    setStashTrayOpen(false);
    setFocusedItemId(null);
    setQuickAddOpen(true);
  }

  function openQuickAddForSection(sectionId: string): void {
    setTargetSectionId(sectionId);
    openQuickAdd();
  }

  function closeQuickAdd(): void {
    setQuickAddOpen(false);
    window.requestAnimationFrame(() => quickAddButtonRef.current?.focus());
  }

  function openTemplateChooser(): void {
    setQuickAddOpen(false);
    setMoreOpen(false);
    setStashTrayOpen(false);
    setFocusedItemId(null);
    setTemplatesOpen(true);
  }

  function updatePanel(
    sectionId: string,
    itemId: string,
    update: (item: DmScreenItem) => DmScreenItem,
  ): void {
    setScreen((current) => ({
      ...current,
      sections: updateSectionTree(current.sections, sectionId, (section) => ({
        ...section,
        items: section.items.map((item) => item.id === itemId ? update(item) : item),
      })),
    }));
  }

  function changePanelDisplay(
    itemId: string,
    action: DmScreenPanelDisplayAction,
  ): void {
    setScreen((current) => reduceDmScreenPanelDisplay(current, itemId, action));
  }

  function movePanel(itemId: string, action: DmScreenPanelMoveAction): void {
    if (!screen) return;
    const preview = moveDmScreenPanel(screen, itemId, action);
    if (preview === screen) return;
    const source = screenItems.find(({ item }) => item.id === itemId)?.item;
    const location = getDmScreenPanelLocation(preview, itemId);
    if (!source || !location) return;

    pendingMoveFocusRef.current = itemId;
    setDropPreview(null);
    setWorkspaceError('');
    setWorkspaceNotice(
      `${source.title} moved to ${location.sectionTitle}, position ${location.index + 1} of ${location.count}.`,
    );
    setScreen((current) => moveDmScreenPanel(current, itemId, action));
  }

  function stashPanel(itemId: string): void {
    pendingStashButtonFocusRef.current = true;
    changePanelDisplay(itemId, { type: 'set-stashed', stashed: true });
    setWorkspaceNotice('Panel moved to the stash.');
  }

  function restorePanel(itemId: string): void {
    pendingPanelFocusRef.current = itemId;
    suppressTrayReturnFocusRef.current = true;
    setStashTrayOpen(false);
    changePanelDisplay(itemId, { type: 'set-stashed', stashed: false });
    setWorkspaceNotice('Panel restored to the board.');
  }

  function openPanelFocus(itemId: string, returnTarget: HTMLElement | null): void {
    panelFocusReturnRef.current = returnTarget;
    setQuickAddOpen(false);
    setMoreOpen(false);
    setTemplatesOpen(false);
    setStashTrayOpen(false);
    setFocusedItemId(itemId);
  }

  function openStashTray(): void {
    setQuickAddOpen(false);
    setMoreOpen(false);
    setTemplatesOpen(false);
    setFocusedItemId(null);
    setStashTrayOpen(true);
  }

  function toggleWorkspaceMode(): void {
    const nextMode: DmScreenWorkspaceMode = arranging ? 'run' : 'arrange';
    setWorkspaceMode(nextMode);
    setWorkspaceNotice(nextMode === 'run'
      ? 'Run mode is on. Editing controls are hidden.'
      : 'Arrange mode is on. Screen editing controls are available.');
    setWorkspaceError('');
    if (nextMode === 'run') {
      setQuickAddOpen(false);
      setMoreOpen(false);
      setDropPreview(null);
    }
  }

  function closeMorePanel(): void {
    setMoreOpen(false);
    window.requestAnimationFrame(() => moreButtonRef.current?.focus());
  }

  function closeTemplateChooser(): void {
    acknowledgeFirstUse();
    setTemplatesOpen(false);
    window.requestAnimationFrame(() => templateButtonRef.current?.focus());
  }

  function dismissTemplateNotice(): void {
    setTemplateNotice(null);
    window.requestAnimationFrame(() => templateButtonRef.current?.focus());
  }

  function materializeTemplate(
    template: DmScreenTemplateDefinition,
    options: { includePinnedResources: boolean },
  ): DmScreenState {
    const created = createDmScreenFromTemplate(template);
    const withPinnedResources = options.includePinnedResources
      ? syncPinnedItems(
          created,
          pinnedMonsterIds,
          pinnedSpellIds,
          (resourceId) => monsterMap.get(resourceId)?.name,
          (resourceId) => spellMap.get(resourceId)?.name,
        )
      : created;
    return syncDmPartySnapshot(withPinnedResources, partySummary);
  }

  async function applyTemplate(
    template: DmScreenTemplateDefinition,
    action: DmScreenTemplateAction,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!screen) return { ok: false, error: 'The current DM Screen is not available.' };
    if (!templateSourcesReady) {
      return { ok: false, error: 'Your party and pinned references are still loading. Try the template again in a moment.' };
    }
    const incoming = materializeTemplate(template, {
      includePinnedResources: action === 'replace',
    });
    const namespace = id(`template-${template.id}`);
    const result = action === 'add'
      ? await updateScreen((current) => mergeDmScreenDocuments(
          current,
          incoming,
          deterministicDocumentIds(namespace),
        ).document)
      : await replaceScreen(incoming, { undoable: true });

    if (!result.ok && !result.queued) {
      return { ok: false, error: result.error?.message ?? 'That template could not be applied.' };
    }

    acknowledgeFirstUse();
    setTemplatesOpen(false);
    const saveWarning = result.queued
      ? ' It is available in this tab but still needs to be saved; use Retry in the save status.'
      : '';
    setTemplateNotice({
      kind: action === 'replace' ? 'replace' : 'notice',
      message: action === 'replace'
        ? `Started from ${template.name}. You can undo until the next saved screen edit.${saveWarning}`
        : `Added ${template.name} after the current sections.${saveWarning}`,
    });
    return { ok: true };
  }

  async function undoTemplateReplacement(): Promise<void> {
    const result = await undoScreenReplacement();
    if (result.ok) {
      setTemplateNotice({ kind: 'notice', message: 'Restored the screen you had before applying the template.' });
      return;
    }
    setTemplateNotice({
      kind: 'error',
      message: result.error?.message ?? 'The template replacement could not be undone.',
    });
  }

  function exportJson() {
    const exportScreen = screenForExport();
    if (!exportScreen) return;
    const usedMonsterIds = new Set<string>();
    const usedSpellIds = new Set<string>();
    const walk = (sections: DmScreenSection[]) => sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.kind === 'monster' && item.resourceId) usedMonsterIds.add(item.resourceId);
        if (item.kind === 'spell' && item.resourceId) usedSpellIds.add(item.resourceId);
      });
      walk(section.children);
    });
    walk(exportScreen.sections);
    const exported = createDmScreenExportEnvelope({
      dmScreen: exportScreen,
      battle,
      resources: {
        monsters: [...usedMonsterIds]
          .map((resourceId) => monsterMap.get(resourceId))
          .filter((monster): monster is Monster => monster !== undefined),
        spells: [...usedSpellIds]
          .map((resourceId) => spellMap.get(resourceId))
          .filter((spell): spell is Spell => spell !== undefined),
      },
    });
    download('encounterizer-dm-screen.json', JSON.stringify(exported, null, 2), 'application/json');
  }

  function restoreWarnings(candidate: DmScreenImportCandidate): string[] {
    let identicalResources = 0;
    let collidingResources = 0;
    let autoPinnedPanels = 0;
    let unresolvedResources = 0;
    const bundledMonsters = new Set(candidate.resources.monsters.map((monster) => monster.id));
    const bundledSpells = new Set(candidate.resources.spells.map((spell) => spell.id));
    for (const monster of candidate.resources.monsters) {
      const existing = monsterMap.get(monster.id);
      if (!existing) continue;
      if (sameResourceDefinition(existing, monster)) identicalResources += 1;
      else collidingResources += 1;
    }
    for (const spell of candidate.resources.spells) {
      const existing = spellMap.get(spell.id);
      if (!existing) continue;
      if (sameResourceDefinition(existing, spell)) identicalResources += 1;
      else collidingResources += 1;
    }
    const visit = (sections: readonly DmScreenSection[]) => {
      for (const section of sections) {
        for (const item of section.items) {
          if (item.origin === 'auto-pin') autoPinnedPanels += 1;
          if (!item.resourceId) continue;
          if (item.kind === 'monster'
            && !monsterMap.has(item.resourceId)
            && !bundledMonsters.has(item.resourceId)) unresolvedResources += 1;
          if (item.kind === 'spell'
            && !spellMap.has(item.resourceId)
            && !bundledSpells.has(item.resourceId)) unresolvedResources += 1;
        }
        visit(section.children);
      }
    };
    visit(candidate.dmScreen.sections);

    const warnings: string[] = [];
    if (identicalResources > 0) warnings.push(`${identicalResources} identical copied resource${identicalResources === 1 ? ' is' : 's are'} already available and will not be duplicated.`);
    if (collidingResources > 0) warnings.push(`${collidingResources} copied resource${collidingResources === 1 ? ' has' : 's have'} the same ID as different local content and will receive a new ID.`);
    if (unresolvedResources > 0) warnings.push(`${unresolvedResources} panel${unresolvedResources === 1 ? '' : 's'} reference resources that are neither bundled nor available in this browser.`);
    if (autoPinnedPanels > 0) warnings.push(`${autoPinnedPanels} auto-pinned panel${autoPinnedPanels === 1 ? '' : 's'} will become regular panels so the restored screen does not depend on this browser’s pin list.`);
    if (candidate.preview.sections > 0) warnings.push('Choosing “Add imported sections” assigns new local IDs to every imported section and panel, so current content cannot be overwritten.');
    return warnings;
  }

  async function applyImport(
    candidate: DmScreenImportCandidate,
    mode: DmScreenImportMode,
    includeBattle: boolean,
  ) {
    if (!screen && mode === 'merge') {
      return { ok: false, error: 'A valid current screen is required before imported sections can be added.' };
    }

    const restoreNamespace = id('restore');
    const candidateWithoutKnownCopies: DmScreenImportCandidate = {
      ...candidate,
      dmScreen: prepareImportedScreen(candidate.dmScreen, mode, restoreNamespace),
      resources: {
        monsters: candidate.resources.monsters.filter((monster) => {
          const existing = monsterMap.get(monster.id);
          return !existing || !sameResourceDefinition(existing, monster);
        }),
        spells: candidate.resources.spells.filter((spell) => {
          const existing = spellMap.get(spell.id);
          return !existing || !sameResourceDefinition(existing, spell);
        }),
      },
    };
    const base = screen ?? EMPTY_DM_SCREEN;
    const plan = planDmScreenImport(base, candidateWithoutKnownCopies, {
      mode,
      includeBattle,
      existingMonsterIds: monsterMap.keys(),
      existingSpellIds: spellMap.keys(),
      documentOptions: deterministicDocumentIds(restoreNamespace),
    });

    const monsterRestore = addMonsters(plan.monsters);
    if (monsterRestore.error) {
      return { ok: false, error: `The screen was not changed. Copied monsters could not be restored: ${monsterRestore.error}` };
    }
    const spellRestore = addSpells(plan.spells);
    if (spellRestore.error) {
      plan.monsters.forEach((monster) => removeMonster(monster.id));
      return { ok: false, error: `The screen was not changed. Copied spells could not be restored: ${spellRestore.error}` };
    }

    const screenResult = mode === 'merge'
      ? await updateScreen((current) => planDmScreenImport(current, candidateWithoutKnownCopies, {
          mode: 'merge',
          existingMonsterIds: monsterMap.keys(),
          existingSpellIds: spellMap.keys(),
          documentOptions: deterministicDocumentIds(restoreNamespace),
        }).dmScreen)
      : await replaceScreen(plan.dmScreen);
    let saveWarning = '';
    if (!screenResult.ok) {
      if (screenResult.queued) {
        saveWarning = ' The imported screen is available in this tab but still needs to be saved; use Retry in the save status.';
      } else {
        plan.monsters.forEach((monster) => removeMonster(monster.id));
        plan.spells.forEach((spell) => removeSpell(spell.id));
        return { ok: false, error: screenResult.error?.message ?? 'The restored screen could not be saved.' };
      }
    }

    let battleWarning = '';
    if (plan.battle) {
      const battleResult = replaceBattle(plan.battle);
      if (!battleResult.ok) battleWarning = ' The included battle is available in this tab but could not be saved.';
    }
    const remaps = plan.sectionIdRemaps.length
      + plan.itemIdRemaps.length
      + plan.monsterIdRemaps.length
      + plan.spellIdRemaps.length;
    return {
      ok: true,
      message: mode === 'merge'
        ? `Added ${candidate.preview.sections} imported section${candidate.preview.sections === 1 ? '' : 's'}${remaps ? ` and safely reassigned ${remaps} colliding ID${remaps === 1 ? '' : 's'}` : ''}.${saveWarning}${battleWarning}`
        : `Replaced the DM Screen with “${candidate.preview.title}”.${saveWarning}${battleWarning}`,
    };
  }

  const pageHeader = <ToolPageHeader
    path="/dm-screen"
    description="Build a durable command surface for your games. Keep references, notes, party details, and live tools together; stash panels until you need them."
  />;

  if (!screen) {
    const loadingScreen = !screenHydrated || screenStatus === 'idle' || screenStatus === 'loading';
    return <div className="animate-fade-in dm-screen-print">
      {pageHeader}
      <section className="card panel-accent" aria-labelledby="dm-screen-recovery-heading">
        <p className="micro-label">Saved screen</p>
        <h2 id="dm-screen-recovery-heading" className="mt-1 text-2xl">{loadingScreen ? 'Opening your DM Screen…' : 'Your saved DM Screen needs attention'}</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-2)]">
          {loadingScreen
            ? 'Loading the durable screen saved in this browser.'
            : 'Encounterizer could not safely open this document, so its saved data has been left untouched. Retry browser storage or restore a validated backup to continue.'}
        </p>
        <ScreenSaveStatus
          hydrated={screenHydrated}
          status={screenStatus}
          dirty={screenDirty}
          error={screenError}
          onRetry={() => void retryScreenStorage()}
        />
        {!loadingScreen && <DmScreenBackupPanel
            saving={screenStatus === 'saving'}
            canExport={false}
            canMerge={false}
            onExport={() => undefined}
            onApply={applyImport}
            getRestoreWarnings={restoreWarnings}
          />}
      </section>
    </div>;
  }

  if (screenFirstUse) {
    return <div className="animate-fade-in dm-screen-print">
      {pageHeader}
      <DmScreenTemplateChooser
        mode="first-use"
        busy={screenStatus === 'saving'}
        ready={templateSourcesReady}
        currentTitle={screen.title}
        currentSectionCount={screenCounts.sections}
        currentPanelCount={screenCounts.panels}
        onApply={applyTemplate}
        onCancel={closeTemplateChooser}
      />
    </div>;
  }

  return <div className="animate-fade-in dm-screen-print min-w-0">
    {quickAddOpen && <DmScreenQuickAddDrawer
      open={quickAddOpen}
      sectionOptions={sectionOptions}
      selectedTargetSectionId={selectedTargetSectionId}
      addKind={addKind}
      title={title}
      body={body}
      resourceQuery={resourceQuery}
      toolPath={toolPath}
      resourceResults={resourceResults}
      onClose={closeQuickAdd}
      onSelectedTargetSectionIdChange={setTargetSectionId}
      onAddKindChange={setAddKind}
      onTitleChange={setTitle}
      onBodyChange={setBody}
      onResourceQueryChange={setResourceQuery}
      onToolPathChange={setToolPath}
      onCreateSection={(name) => addSection(undefined, name)}
      onAddConfiguredItem={addConfiguredItem}
      onAddResource={addResource}
    />}

    {stashTrayOpen && <DmScreenModal
      open
      variant="tray"
      eyebrow="Stashed panels"
      title="Off the board, ready when needed"
      description="Restore a panel to its original place. Its size, order, collapsed header, and print setting are preserved."
      returnFocusRef={stashTrayButtonRef}
      suppressReturnFocusRef={suppressTrayReturnFocusRef}
      onClose={() => setStashTrayOpen(false)}
    >
      <div className="space-y-2">
        {stashedPanels.map(({ item, sectionTitle }) => <article
          key={item.id}
          className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--steel-800)] bg-[var(--steel-900)] p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-base">{item.title}</h3>
              {item.layout.excludedFromPrint && <span className="rounded-full bg-[var(--steel-800)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-3)]">NOT PRINTED</span>}
            </div>
            <p className="mt-1 text-xs text-[var(--text-3)]">{sectionTitle} · {panelKindLabel(item.kind)} · {panelWidthLabel(item.layout.width)}</p>
          </div>
          <button type="button" className="btn-primary shrink-0 justify-center text-sm" onClick={() => restorePanel(item.id)}>
            <ArchiveRestore size={16} aria-hidden="true" /> Restore to board
          </button>
        </article>)}
        {stashedPanels.length === 0 && <div className="empty-state">
          <Archive className="mx-auto mb-3 text-[var(--bronze)]" size={34} aria-hidden="true" />
          <p className="font-semibold">The stash is empty</p>
          <p className="mt-1 text-sm">Stashed panels will stay recoverable here.</p>
        </div>}
      </div>
    </DmScreenModal>}

    {focusedPanel && <DmScreenModal
      open
      variant="spotlight"
      eyebrow={`${focusedPanel.sectionTitle} · ${panelKindLabel(focusedPanel.item.kind)}`}
      title={focusedPanel.item.title}
      description="Panel focus is temporary. Close it to return to the board without changing the layout."
      returnFocusRef={panelFocusReturnRef}
      onClose={() => setFocusedItemId(null)}
    >
      <div className="mx-auto w-full max-w-7xl rounded-xl border border-[var(--steel-800)] bg-[var(--steel-900)] p-3 sm:p-5">
        <ScreenItemBody
          item={focusedPanel.item}
          arranging={false}
          note={focusedPanel.item.resourceId ? noteMap.get(focusedPanel.item.resourceId) : undefined}
          notesHydrated={notesHydrated}
          notesStatus={notesStatus}
          notesError={notesError}
          monster={focusedPanel.item.resourceId ? monsterMap.get(focusedPanel.item.resourceId) : undefined}
          spell={focusedPanel.item.resourceId ? spellMap.get(focusedPanel.item.resourceId) : undefined}
          partySummary={partySummary}
          partyLoading={!partyLibraryHydrated && !partySummary}
          partyUnavailable={partyLibraryStatus === 'unavailable' || partyLibraryStatus === 'error'}
          onSaveNote={saveScratchpad}
          onUpdate={(update) => updatePanel(focusedPanel.sectionId, focusedPanel.item.id, update)}
          onDisplayAction={(action) => changePanelDisplay(focusedPanel.item.id, action)}
        />
      </div>
    </DmScreenModal>}

    <section className="dm-screen-command-bar card panel-accent mb-4 !p-3 print:hidden" aria-label="DM Screen controls">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="micro-label">{arranging ? 'Arrange screen' : 'At the table'}</p>
          {arranging ? <>
            <h1 className="sr-only">{screen.title}</h1>
            <label className="sr-only" htmlFor="dm-screen-title">Screen title</label>
            <input
              id="dm-screen-title"
              className="mt-1 w-full min-w-0 !min-h-10 !border-dashed !px-2 !py-1 font-display text-xl font-semibold"
              value={screen.title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setScreen((current) => ({ ...current, title: nextTitle }));
              }}
            />
          </> : <h1 className="mt-0.5 truncate text-2xl">{screen.title}</h1>}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href="/party"
              className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-full border border-[var(--steel-800)] bg-[var(--steel-950)] px-3 text-xs font-semibold text-[var(--text-2)] hover:border-[var(--bronze)] hover:text-[var(--text-1)]"
            >
              <Users size={14} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />
              <span className="truncate">{partySummary ? `${partySummary.name} · ${partySummary.memberCount} heroes` : 'Choose active party'}</span>
            </Link>
            <div className="[&>*]:!mt-0">
              <ScreenSaveStatus
                hydrated={screenHydrated}
                status={screenStatus}
                dirty={screenDirty}
                error={screenError}
                onRetry={() => void retryScreenStorage()}
              />
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            ref={quickAddButtonRef}
            type="button"
            className="btn-primary w-full justify-center text-sm sm:w-auto"
            aria-haspopup="dialog"
            aria-expanded={quickAddOpen}
            onClick={openQuickAdd}
          ><Plus size={16} aria-hidden="true" /> Quick add</button>
          <button
            ref={templateButtonRef}
            type="button"
            className="btn-secondary w-full justify-center text-sm sm:w-auto"
            aria-controls="dm-screen-template-chooser"
            aria-expanded={templatesOpen}
            onClick={openTemplateChooser}
          ><LayoutTemplate size={16} aria-hidden="true" /> Templates</button>
          <button
            type="button"
            className={`${arranging ? 'btn-primary' : 'btn-secondary'} w-full justify-center text-sm sm:w-auto`}
            aria-pressed={arranging}
            onClick={toggleWorkspaceMode}
          >{arranging ? <CheckCircle2 size={16} aria-hidden="true" /> : <Settings2 size={16} aria-hidden="true" />} {arranging ? 'Done' : 'Arrange'}</button>
          {stashedPanels.length > 0 && <button
            ref={stashTrayButtonRef}
            type="button"
            className="btn-secondary w-full justify-center text-sm sm:w-auto"
            aria-haspopup="dialog"
            aria-expanded={stashTrayOpen}
            onClick={openStashTray}
          ><Archive size={16} aria-hidden="true" /> Stash <span className="rounded-full bg-[var(--steel-800)] px-1.5 py-0.5 text-[10px]">{stashedPanels.length}</span></button>}
          <button
            ref={focusButtonRef}
            type="button"
            className="btn-secondary w-full justify-center text-sm sm:w-auto"
            aria-pressed={screenFocused}
            onClick={toggleFocus}
          >{screenFocused ? <Minimize2 size={16} aria-hidden="true" /> : <Expand size={16} aria-hidden="true" />} {screenFocused ? 'Exit focus' : 'Focus screen'}</button>
          <button
            ref={moreButtonRef}
            type="button"
            className="btn-ghost col-span-2 w-full justify-center text-sm sm:w-auto"
            aria-controls="dm-screen-more-panel"
            aria-expanded={moreOpen}
            onClick={() => {
              setQuickAddOpen(false);
              setTemplatesOpen(false);
              setMoreOpen((current) => !current);
            }}
          ><MoreHorizontal size={17} aria-hidden="true" /> More</button>
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{workspaceError ? '' : workspaceNotice} {focusStatusMessage}</span>
    </section>

    {arranging && <section className="mb-4 flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--steel-800)] bg-[var(--surface-subtle)] p-3 print:hidden lg:flex-row lg:items-center" aria-labelledby="dm-screen-board-layout-heading">
      <div className="flex min-w-0 items-center gap-2 lg:mr-auto">
        <Columns3 size={18} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="dm-screen-board-layout-heading" className="text-sm font-semibold">Board layout</h2>
          <p className="text-xs text-[var(--text-3)]">Panels snap to the grid and simplify automatically on smaller screens.</p>
        </div>
      </div>
      <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5">
        <legend className="mr-1 text-xs font-semibold text-[var(--text-3)]">Columns</legend>
        {(['auto', 2, 3, 4] as const).map((columns) => <button
          key={columns}
          type="button"
          className={`${screen.layout.columns === columns ? 'border-[var(--bronze)] bg-[var(--bronze-wash)] text-[var(--text-1)]' : 'border-[var(--steel-700)] bg-[var(--steel-900)] text-[var(--text-2)]'} min-h-9 rounded-lg border px-3 text-xs font-semibold`}
          aria-pressed={screen.layout.columns === columns}
          onClick={() => setScreen((current) => reduceDmScreenGrid(current, { type: 'set-columns', columns }))}
        >{columns === 'auto' ? 'Auto fit' : columns}</button>)}
      </fieldset>
      <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5">
        <legend className="mr-1 text-xs font-semibold text-[var(--text-3)]">Spacing</legend>
        {(['comfortable', 'compact'] as const).map((density) => <button
          key={density}
          type="button"
          className={`${screen.layout.density === density ? 'border-[var(--bronze)] bg-[var(--bronze-wash)] text-[var(--text-1)]' : 'border-[var(--steel-700)] bg-[var(--steel-900)] text-[var(--text-2)]'} min-h-9 rounded-lg border px-3 text-xs font-semibold`}
          aria-pressed={screen.layout.density === density}
          onClick={() => setScreen((current) => reduceDmScreenGrid(current, { type: 'set-density', density }))}
        >{density === 'comfortable' ? 'Roomy' : 'Tight'}</button>)}
      </fieldset>
    </section>}

    {workspaceError && <p className="mb-4 rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-wash)] px-3 py-2 text-sm print:hidden" role="alert">{workspaceError}</p>}

    {notesWarnings.length > 0 && <p className="mb-4 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] px-3 py-2 text-sm print:hidden" role="status">
      {notesWarnings.join(' ')}
    </p>}

    {focusStatusMessage && /(could not|unavailable|already)/i.test(focusStatusMessage) && <p className="mb-4 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] px-3 py-2 text-sm print:hidden">{focusStatusMessage}</p>}

    {moreOpen && <section id="dm-screen-more-panel" className="card mb-4 print:hidden" aria-labelledby="dm-screen-more-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="micro-label">Screen options</p>
          <h2 id="dm-screen-more-heading" ref={moreHeadingRef} tabIndex={-1} className="mt-1 w-fit rounded text-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bronze)]">Share, print, and protect your screen</h2>
          <p className="mt-1 text-sm text-[var(--text-2)]">Less common controls stay here so the live screen remains calm.</p>
        </div>
        <button type="button" className="btn-ghost shrink-0 text-sm" onClick={closeMorePanel}>Close</button>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className="btn-secondary justify-center text-sm" onClick={() => {
          const exportScreen = screenForExport();
          if (!exportScreen) return;
          download('dm-screen.md', dmScreenToMarkdown(exportScreen, monsterMap, spellMap, battle, noteMap), 'text/markdown');
        }}><FileText size={16} aria-hidden="true" /> Export Markdown</button>
        <button type="button" className="btn-secondary justify-center text-sm" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Print</button>
        <button
          type="button"
          className="btn-secondary justify-center text-sm"
          disabled={!nativeFullscreenAvailable && !nativeFullscreen}
          onClick={() => {
            setMoreOpen(false);
            if (nativeFullscreen) exitFocus();
            else void enterBrowserFullscreen();
          }}
        >{nativeFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Expand size={16} aria-hidden="true" />} {nativeFullscreen ? 'Exit browser fullscreen' : 'Browser fullscreen'}</button>
      </div>
      {!nativeFullscreenAvailable && <p className="mt-2 text-xs text-[var(--text-3)]">Browser fullscreen is not available here. Focus screen still uses the full page width.</p>}
      {focusStatusMessage && <p className="mt-2 text-xs text-[var(--text-3)]">{focusStatusMessage}</p>}

      {arranging && <div className="surface-inset mt-4 p-4">
        <p className="micro-label">Pinned references</p>
        <div className="mt-2 flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-5">
          <label className="flex items-center gap-2"><input type="checkbox" checked={screen.autoAddPinnedMonsters} onChange={(event) => {
            const checked = event.target.checked;
            setScreen((current) => ({ ...current, autoAddPinnedMonsters: checked }));
          }} /> Auto-add pinned monsters</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={screen.autoAddPinnedSpells} onChange={(event) => {
            const checked = event.target.checked;
            setScreen((current) => ({ ...current, autoAddPinnedSpells: checked }));
          }} /> Auto-add pinned spells</label>
        </div>
      </div>}

      <DmScreenBackupPanel
        saving={screenStatus === 'saving'}
        canExport={screenHydrated}
        canMerge={screenHydrated}
        onExport={exportJson}
        onApply={applyImport}
        getRestoreWarnings={restoreWarnings}
      />
    </section>}

    {templatesOpen && <DmScreenTemplateChooser
      mode="existing"
      busy={screenStatus === 'saving'}
      ready={templateSourcesReady}
      currentTitle={screen.title}
      currentSectionCount={screenCounts.sections}
      currentPanelCount={screenCounts.panels}
      onApply={applyTemplate}
      onCancel={closeTemplateChooser}
    />}

    {(templateNotice || replacementUndo) && <div
      ref={templateNoticeRef}
      tabIndex={-1}
      role={templateNotice?.kind === 'error' ? 'alert' : 'status'}
      className={`mb-5 flex flex-col gap-3 rounded-xl border p-4 print:hidden sm:flex-row sm:items-center sm:justify-between ${templateNotice?.kind === 'error' ? 'border-[var(--status-danger)] bg-[var(--status-danger-wash)]' : 'border-[var(--status-success)] bg-[var(--status-success-wash)]'}`}
    >
      <p className="text-sm">
        <strong>{templateNotice?.kind === 'error' ? 'Template action needs attention.' : 'Screen updated.'}</strong>{' '}
        {templateNotice?.message ?? 'A template replaced this screen. You can undo until the next saved screen edit.'}
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        {replacementUndo && <button
          type="button"
          className="btn-secondary text-sm"
          disabled={screenStatus === 'saving' || screenDirty}
          onClick={() => void undoTemplateReplacement()}
        ><Undo2 size={16} aria-hidden="true" /> Undo replacement</button>}
        {!replacementUndo && <button
          type="button"
          className="btn-ghost text-sm"
          onClick={dismissTemplateNotice}
        >Dismiss</button>}
      </div>
    </div>}

    <div className="mb-5 hidden print:block"><h1 className="text-3xl">{screen.title}</h1><p className="text-sm text-[var(--text-3)]">Encounterizer DM Screen</p></div>

    {screen.sections.length > 0 ? <div className="min-w-0 space-y-4">
      {screen.sections.map((section) => <ScreenSection
        key={section.id}
        section={section}
        depth={0}
        arranging={arranging}
        printing={printing}
        screenLayout={screen.layout}
        sectionOptions={sectionOptions}
        dropPreview={dropPreview}
        monsters={monsterMap}
        spells={spellMap}
        notes={noteMap}
        notesHydrated={notesHydrated}
        notesStatus={notesStatus}
        notesError={notesError}
        partySummary={partySummary}
        partyLoading={!partyLibraryHydrated && !partySummary}
        partyUnavailable={partyLibraryStatus === 'unavailable' || partyLibraryStatus === 'error'}
        onSaveNote={saveScratchpad}
        onAddChild={addSection}
        onAddPanel={openQuickAddForSection}
        onDuplicateItem={(itemId) => setScreen((current) => duplicateDmScreenItem(current, itemId))}
        onFocusItem={openPanelFocus}
        onPanelDisplay={changePanelDisplay}
        onMovePanel={movePanel}
        onDropPreview={setDropPreview}
        onStashItem={stashPanel}
        onUpdate={(sectionId, update) => setScreen((current) => ({
          ...current,
          sections: updateSectionTree(current.sections, sectionId, update),
        }))}
        onRemove={(sectionId) => {
          if (window.confirm('Remove this section, its subsections, and all of its items?')) {
            setScreen((current) => ({
              ...current,
              sections: removeSectionTree(current.sections, sectionId),
            }));
          }
        }}
      />)}
    </div> : <div className="empty-state">
      <BookOpen className="mx-auto mb-3 text-[var(--bronze)]" size={38} aria-hidden="true" />
      <p className="font-semibold">Your screen is ready</p>
      <p className="mt-1 text-sm">Add a section, then keep the references and notes you use at the table close by.</p>
      <button type="button" className="btn-primary mt-4 print:hidden" onClick={openQuickAdd}><Plus size={17} aria-hidden="true" /> Add your first section</button>
    </div>}
  </div>;
}

function ScreenSection({ section, depth, arranging, printing, screenLayout, sectionOptions, dropPreview, monsters, spells, notes, notesHydrated, notesStatus, notesError, partySummary, partyLoading, partyUnavailable, onSaveNote, onAddChild, onAddPanel, onDuplicateItem, onFocusItem, onPanelDisplay, onMovePanel, onDropPreview, onStashItem, onUpdate, onRemove }: {
  section: DmScreenSection;
  depth: number;
  arranging: boolean;
  printing: boolean;
  screenLayout: DmScreenState['layout'];
  sectionOptions: readonly { id: string; label: string }[];
  dropPreview: DmScreenDropPreview | null;
  monsters: ReadonlyMap<string, Monster>;
  spells: ReadonlyMap<string, Spell>;
  notes: ReadonlyMap<string, NoteRecord>;
  notesHydrated: boolean;
  notesStatus: NoteRepositoryStatus;
  notesError: NoteStorageError | null;
  partySummary: ReturnType<typeof partyToDmScreenSummary> | null;
  partyLoading: boolean;
  partyUnavailable: boolean;
  onSaveNote: (noteId: string, body: string) => Promise<NoteWriteResult>;
  onAddChild: (parentId: string) => void;
  onAddPanel: (sectionId: string) => void;
  onDuplicateItem: (itemId: string) => void;
  onFocusItem: (itemId: string, returnTarget: HTMLElement | null) => void;
  onPanelDisplay: (itemId: string, action: DmScreenPanelDisplayAction) => void;
  onMovePanel: (itemId: string, action: DmScreenPanelMoveAction) => void;
  onDropPreview: (preview: DmScreenDropPreview | null) => void;
  onStashItem: (itemId: string) => void;
  onUpdate: (sectionId: string, update: (section: DmScreenSection) => DmScreenSection) => void;
  onRemove: (sectionId: string) => void;
}) {
  function updateItem(itemId: string, update: (item: DmScreenItem) => DmScreenItem) {
    onUpdate(section.id, (current) => ({ ...current, items: current.items.map((item) => item.id === itemId ? update(item) : item) }));
  }
  const titleClass = `min-w-0 font-display font-semibold ${depth === 0 ? 'text-xl' : 'text-base'}`;
  const stashedPanelCount = section.items.filter((item) => item.layout.stashed).length;
  const visiblePanelCount = section.items.length - stashedPanelCount;
  const showContents = !section.collapsed || printing;
  return <section className={`${depth === 0 ? 'card !p-0' : 'rounded-xl border border-[var(--steel-800)] bg-[var(--steel-950)]'} min-w-0 overflow-hidden`}>
    <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--steel-800)] px-3 py-3 print:block print:px-0 sm:px-4">
      <div className="min-w-0">
        {arranging ? <>
          <input className={`${titleClass} w-full !min-h-10 !border-dashed !px-2 !py-1 print:hidden`} value={section.title} onChange={(event) => {
            const nextTitle = event.target.value;
            onUpdate(section.id, (current) => ({ ...current, title: nextTitle }));
          }} aria-label="Section title" />
          <h2 className={`${titleClass} hidden print:block`}>{section.title}</h2>
        </> : <h2 className={`${titleClass} break-words`}>{section.title}</h2>}
        <p className="mt-0.5 text-xs text-[var(--text-3)] print:hidden">{visiblePanelCount} on board{stashedPanelCount > 0 ? ` · ${stashedPanelCount} stashed` : ''}{section.children.length > 0 ? ` · ${section.children.length} subsection${section.children.length === 1 ? '' : 's'}` : ''}</p>
      </div>
      <button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--steel-800)] print:hidden" onClick={() => onUpdate(section.id, (current) => ({ ...current, collapsed: !current.collapsed }))} aria-expanded={!section.collapsed} aria-label={`${section.collapsed ? 'Expand' : 'Collapse'} ${section.title}`}>{section.collapsed ? <ChevronDown size={19} /> : <ChevronUp size={19} />}</button>
      {arranging && <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-end gap-1 border-t border-[var(--steel-800)] pt-2 print:hidden">
        <button type="button" className="btn-ghost !min-h-10 !px-2 text-xs" onClick={() => onAddChild(section.id)}><FolderPlus size={15} aria-hidden="true" /> Subsection</button>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--accent-danger)] hover:bg-[var(--steel-800)]" onClick={() => onRemove(section.id)} aria-label={`Remove ${section.title}`} title={`Remove ${section.title}`}><Trash2 size={17} aria-hidden="true" /></button>
      </div>}
    </header>
    {showContents && <div className={`min-w-0 ${depth === 0 ? 'p-3 sm:p-4' : 'p-1.5 sm:p-3'} print:p-0 print:pt-3`}>
      <div className="dm-screen-panel-grid" data-columns={screenLayout.columns} data-density={screenLayout.density}>
        {section.items.map((item, itemIndex) => <ScreenItem
          key={item.id}
          item={item}
          arranging={arranging}
          printing={printing}
          sectionId={section.id}
          sectionOptions={sectionOptions}
          panelIndex={itemIndex}
          panelCount={section.items.length}
          dropPreview={dropPreview}
          monster={item.resourceId ? monsters.get(item.resourceId) : undefined}
          spell={item.resourceId ? spells.get(item.resourceId) : undefined}
          note={item.resourceId ? notes.get(item.resourceId) : undefined}
          notesHydrated={notesHydrated}
          notesStatus={notesStatus}
          notesError={notesError}
          partySummary={partySummary}
          partyLoading={partyLoading}
          partyUnavailable={partyUnavailable}
          onSaveNote={onSaveNote}
          onDuplicate={() => onDuplicateItem(item.id)}
          onFocus={(returnTarget) => onFocusItem(item.id, returnTarget)}
          onDisplayAction={(action) => onPanelDisplay(item.id, action)}
          onMove={(action) => onMovePanel(item.id, action)}
          onDropPreview={onDropPreview}
          onStash={() => onStashItem(item.id)}
          onUpdate={(update) => updateItem(item.id, update)}
          onRemove={() => onUpdate(section.id, (current) => ({
            ...current,
            items: current.items.filter((candidate) => candidate.id !== item.id),
          }))}
        />)}
        {arranging && <button type="button" className="dm-screen-add-target print:hidden" onClick={() => onAddPanel(section.id)}>
          <Plus size={18} aria-hidden="true" />
          <span><strong>Add panel</strong><small>Place it in {section.title}</small></span>
        </button>}
        {!arranging && visiblePanelCount === 0 && <p className="dm-screen-grid-full rounded-lg border border-dashed border-[var(--steel-800)] p-4 text-center text-sm text-[var(--text-3)] print:hidden">{stashedPanelCount > 0 ? 'Every panel in this section is stashed.' : 'This section has no active panels.'}</p>}
      </div>
      {section.children.length > 0 && <div className="mt-3 space-y-3 print:mt-4">
        {section.children.map((child) => <ScreenSection
          key={child.id}
          section={child}
          depth={depth + 1}
          arranging={arranging}
          printing={printing}
          screenLayout={screenLayout}
          sectionOptions={sectionOptions}
          dropPreview={dropPreview}
          monsters={monsters}
          spells={spells}
          notes={notes}
          notesHydrated={notesHydrated}
          notesStatus={notesStatus}
          notesError={notesError}
          partySummary={partySummary}
          partyLoading={partyLoading}
          partyUnavailable={partyUnavailable}
          onSaveNote={onSaveNote}
          onAddChild={onAddChild}
          onAddPanel={onAddPanel}
          onDuplicateItem={onDuplicateItem}
          onFocusItem={onFocusItem}
          onPanelDisplay={onPanelDisplay}
          onMovePanel={onMovePanel}
          onDropPreview={onDropPreview}
          onStashItem={onStashItem}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />)}
      </div>}
    </div>}
  </section>;
}

function panelSummary(
  item: DmScreenItem,
  monster: Monster | undefined,
  spell: Spell | undefined,
  note: NoteRecord | undefined,
  partySummary: ReturnType<typeof partyToDmScreenSummary> | null,
): string {
  if (item.kind === 'monster' && monster) return `CR ${monster.challengeRating} · AC ${monster.armor.ac} · ${monster.hitPoints} HP`;
  if (item.kind === 'spell' && spell) return `${levelLabel(spell.level)} ${spell.school} · ${spell.castingTime}`;
  if (item.kind === 'party' && partySummary) return `${partySummary.name} · ${partySummary.memberCount} heroes`;
  if (item.kind === 'rules') return 'Core rules, conditions, and table references';
  if (item.kind === 'initiative' || item.kind === 'battle') return 'Live rounds, turns, and combatant status';
  const firstLine = (note?.body ?? item.body)?.trim().split(/\r?\n/)[0];
  if (firstLine) return firstLine;
  return `${panelKindLabel(item.kind)} panel`;
}

function ScreenItem({ item, arranging, printing, sectionId, sectionOptions, panelIndex, panelCount, dropPreview, monster, spell, note, notesHydrated, notesStatus, notesError, partySummary, partyLoading, partyUnavailable, onSaveNote, onDuplicate, onFocus, onDisplayAction, onMove, onDropPreview, onStash, onUpdate, onRemove }: {
  item: DmScreenItem;
  arranging: boolean;
  printing: boolean;
  sectionId: string;
  sectionOptions: readonly { id: string; label: string }[];
  panelIndex: number;
  panelCount: number;
  dropPreview: DmScreenDropPreview | null;
  monster?: Monster;
  spell?: Spell;
  note?: NoteRecord;
  notesHydrated: boolean;
  notesStatus: NoteRepositoryStatus;
  notesError: NoteStorageError | null;
  partySummary: ReturnType<typeof partyToDmScreenSummary> | null;
  partyLoading: boolean;
  partyUnavailable: boolean;
  onSaveNote: (noteId: string, body: string) => Promise<NoteWriteResult>;
  onDuplicate: () => void;
  onFocus: (returnTarget: HTMLElement) => void;
  onDisplayAction: (action: DmScreenPanelDisplayAction) => void;
  onMove: (action: DmScreenPanelMoveAction) => void;
  onDropPreview: (preview: DmScreenDropPreview | null) => void;
  onStash: () => void;
  onUpdate: (update: (item: DmScreenItem) => DmScreenItem) => void;
  onRemove: () => void;
}) {
  const Icon = item.kind === 'party' ? Users : item.kind === 'monster' ? Swords : item.kind === 'spell' ? Sparkles : item.kind === 'tool' ? LinkIcon : item.kind === 'rules' ? BookOpen : item.kind === 'initiative' || item.kind === 'battle' ? Swords : FileText;
  const bodyVisible = printing || (!item.layout.stashed && !item.collapsed);
  const summary = panelSummary(item, monster, spell, note, partySummary);
  const minimumWidth = minimumDmScreenPanelWidth(item.kind);
  const effectiveWidth = effectiveDmScreenPanelWidth(item.kind, item.layout.width);
  const dragStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const pendingDropRef = useRef<DmScreenDropPreview | null>(null);

  function cancelPointerMove(currentTarget?: HTMLElement, pointerId?: number): void {
    if (currentTarget && pointerId !== undefined && currentTarget.hasPointerCapture(pointerId)) {
      currentTarget.releasePointerCapture(pointerId);
    }
    dragStartRef.current = null;
    pendingDropRef.current = null;
    onDropPreview(null);
  }

  function beginPointerMove(event: ReactPointerEvent<HTMLSpanElement>): void {
    if (event.button !== 0) return;
    dragStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function previewPointerMove(event: ReactPointerEvent<HTMLSpanElement>): void {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 7) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-dm-screen-panel-id]');
    const targetItemId = target?.dataset.dmScreenPanelId;
    if (!target || !targetItemId || targetItemId === item.id) {
      pendingDropRef.current = null;
      onDropPreview(null);
      return;
    }
    const bounds = target.getBoundingClientRect();
    const position = event.clientY < bounds.top + (bounds.height / 2)
      ? 'before'
      : 'after';
    const preview: DmScreenDropPreview = {
      sourceItemId: item.id,
      targetItemId,
      position,
    };
    if (pendingDropRef.current?.targetItemId === targetItemId
      && pendingDropRef.current.position === position) return;
    pendingDropRef.current = preview;
    onDropPreview(preview);
  }

  function finishPointerMove(event: ReactPointerEvent<HTMLSpanElement>): void {
    const start = dragStartRef.current;
    const drop = pendingDropRef.current;
    cancelPointerMove(event.currentTarget, start?.pointerId);
    if (start && drop) {
      onMove({
        type: 'relative',
        targetItemId: drop.targetItemId,
        position: drop.position,
      });
    }
  }

  return <article
    id={`dm-screen-panel-${item.id}`}
    tabIndex={-1}
    data-dm-screen-panel-id={item.id}
    data-panel-width={effectiveWidth}
    data-panel-preferred-width={item.layout.width}
    data-print-excluded={item.layout.excludedFromPrint ? 'true' : undefined}
    data-drop-position={dropPreview?.targetItemId === item.id ? dropPreview.position : undefined}
    data-drag-source={dropPreview?.sourceItemId === item.id ? 'true' : undefined}
    className={`dm-screen-panel min-w-0 rounded-xl border border-[var(--steel-800)] bg-[var(--steel-900)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bronze)] ${item.layout.stashed ? 'hidden print:block' : ''}`}
  >
    <header className="dm-screen-panel-header grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 print:block">
      <Icon size={17} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />
      <div className="min-w-0">
        {arranging && item.origin !== 'auto-pin' ? <>
          <input className="w-full min-w-0 !min-h-9 !border-dashed !px-2 !py-1 text-sm font-semibold print:hidden" value={item.title} onChange={(event) => {
            const nextTitle = event.target.value;
            onUpdate((current) => ({ ...current, title: nextTitle }));
          }} aria-label="Panel title" />
          <h3 className="hidden break-words font-semibold print:block">{item.title}</h3>
        </> : <h3 className="break-words font-semibold">{item.title}</h3>}
        {item.collapsed && <p className="mt-0.5 truncate text-xs text-[var(--text-3)] print:hidden">{summary}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 print:hidden">
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)]" onClick={(event) => onFocus(event.currentTarget)} aria-label={`Focus ${item.title}`} title={`Focus ${item.title}`}><Maximize2 size={16} aria-hidden="true" /></button>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)]" onClick={() => onDisplayAction({ type: 'set-collapsed', collapsed: !item.collapsed })} aria-expanded={!item.collapsed} aria-label={`${item.collapsed ? 'Expand' : 'Collapse'} ${item.title}`} title={`${item.collapsed ? 'Expand' : 'Collapse'} ${item.title}`}>{item.collapsed ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronUp size={17} aria-hidden="true" />}</button>
      </div>
      {arranging && <div className="col-span-3 flex min-w-0 flex-wrap items-center justify-end gap-1 border-t border-[var(--steel-800)] pt-2 print:hidden">
        <div className="dm-screen-position-controls mr-auto flex min-w-0 flex-wrap items-center gap-1">
          <span
            className="dm-screen-drag-handle inline-flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-3)]"
            title={`Drag ${item.title} to another position`}
            aria-hidden="true"
            onPointerDown={beginPointerMove}
            onPointerMove={previewPointerMove}
            onPointerUp={finishPointerMove}
            onPointerCancel={(event) => cancelPointerMove(event.currentTarget, event.pointerId)}
            onLostPointerCapture={() => {
              if (dragStartRef.current) cancelPointerMove();
            }}
          ><GripVertical size={18} /></span>
          <span className="px-1 text-xs tabular-nums text-[var(--text-3)]" aria-hidden="true">{panelIndex + 1}/{panelCount}</span>
          <button
            id={`dm-screen-move-before-${item.id}`}
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)] disabled:cursor-not-allowed disabled:opacity-35"
            disabled={panelIndex === 0}
            onClick={() => onMove({ type: 'before' })}
            aria-label={`Move ${item.title} before the previous panel`}
            title="Move earlier"
          ><ArrowUp size={16} aria-hidden="true" /></button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)] disabled:cursor-not-allowed disabled:opacity-35"
            disabled={panelIndex === panelCount - 1}
            onClick={() => onMove({ type: 'after' })}
            aria-label={`Move ${item.title} after the next panel`}
            title="Move later"
          ><ArrowDown size={16} aria-hidden="true" /></button>
          <label className="flex min-h-10 min-w-0 items-center gap-1.5 rounded-lg px-1.5 text-xs text-[var(--text-3)]">
            <span className="shrink-0">Move to</span>
            <select
              id={`dm-screen-move-section-${item.id}`}
              className="max-w-40 !min-h-9 min-w-0 !py-1 text-xs"
              value={sectionId}
              disabled={sectionOptions.length < 2}
              onChange={(event) => onMove({ type: 'to-section', sectionId: event.target.value })}
              aria-label={`Move ${item.title} to section`}
            >
              {sectionOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {item.origin === 'auto-pin' && <span className="rounded-full bg-[var(--bronze-wash)] px-2 py-0.5 text-[10px] font-semibold text-[var(--bronze)]">AUTO-PINNED</span>}
          {item.layout.excludedFromPrint && <span className="text-xs text-[var(--text-3)]">Not printed</span>}
        </div>
        <label className="flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-xs text-[var(--text-3)]">
          <span>Size</span>
          <select className="!min-h-9 !py-1 text-xs" value={effectiveWidth} onChange={(event) => onDisplayAction({ type: 'set-width', width: event.target.value as DmScreenPanelWidth })} aria-label={`Size for ${item.title}`} title={`Minimum size: ${panelWidthLabel(minimumWidth)}`}>
            {(['compact', 'standard', 'wide', 'full'] as const).map((width) => <option key={width} value={width} disabled={effectiveDmScreenPanelWidth(item.kind, width) !== width}>{panelWidthLabel(width)}</option>)}
          </select>
        </label>
        <button type="button" className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs hover:bg-[var(--steel-800)]" onClick={onStash} aria-label={`Stash ${item.title}`} title={`Stash ${item.title}`}><Archive size={16} aria-hidden="true" /><span className="hidden xl:inline">Stash</span></button>
        {item.origin !== 'auto-pin' && <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)]" onClick={onDuplicate} aria-label={`Duplicate ${item.title}`} title={`Duplicate ${item.title}`}><Copy size={16} aria-hidden="true" /></button>}
        {item.origin !== 'auto-pin' && <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--accent-danger)] hover:bg-[var(--steel-800)]" onClick={onRemove} aria-label={`Remove ${item.title}`} title={`Remove ${item.title}`}><Trash2 size={16} aria-hidden="true" /></button>}
      </div>}
    </header>
    {bodyVisible && <div className="dm-screen-panel-body border-t border-[var(--steel-800)] p-3 print:p-0 print:pt-2">
      <div className="dm-screen-embedded min-w-0" data-embedded-kind={item.kind}>
        <ScreenItemBody
         item={item}
         arranging={arranging}
         note={note}
         notesHydrated={notesHydrated}
         notesStatus={notesStatus}
         notesError={notesError}
         monster={monster}
         spell={spell}
         partySummary={partySummary}
         partyLoading={partyLoading}
         partyUnavailable={partyUnavailable}
         onSaveNote={onSaveNote}
         onUpdate={onUpdate}
        onDisplayAction={onDisplayAction}
        />
      </div>
    </div>}
  </article>;
}

function ScreenItemBody({ item, arranging, note, notesHydrated, notesStatus, notesError, monster, spell, partySummary, partyLoading, partyUnavailable, onSaveNote, onUpdate, onDisplayAction }: {
  item: DmScreenItem;
  arranging: boolean;
  note?: NoteRecord;
  notesHydrated: boolean;
  notesStatus: NoteRepositoryStatus;
  notesError: NoteStorageError | null;
  monster?: Monster;
  spell?: Spell;
  partySummary: ReturnType<typeof partyToDmScreenSummary> | null;
  partyLoading: boolean;
  partyUnavailable: boolean;
  onSaveNote: (noteId: string, body: string) => Promise<NoteWriteResult>;
  onUpdate: (update: (item: DmScreenItem) => DmScreenItem) => void;
  onDisplayAction: (action: DmScreenPanelDisplayAction) => void;
}) {
  return <>
      {arranging && <label className="mb-3 flex items-center gap-2 text-xs text-[var(--text-3)] print:hidden">
        <input type="checkbox" checked={item.layout.excludedFromPrint} onChange={(event) => {
          const checked = event.target.checked;
          onDisplayAction({ type: 'set-print-excluded', excludedFromPrint: checked });
        }} />
        Exclude this panel from print and Markdown
      </label>}
      {item.kind === 'note' && <DmScreenScratchpad
        note={note}
        fallbackBody={item.body}
        fallbackTitle={item.title}
        hydrated={notesHydrated}
        repositoryStatus={notesStatus}
        repositoryError={notesError}
        onSave={onSaveNote}
        onLegacyBodyChange={(nextBody) => onUpdate((current) => ({ ...current, body: nextBody }))}
      />}
      {item.kind === 'monster' && (monster ? <MonsterStatBlock monster={monster} physicalDescription={getMonsterPhysicalDescription(monster.id)} /> : <p className="text-sm text-[var(--accent-danger)]">This monster is no longer available.</p>)}
      {item.kind === 'spell' && (spell ? <SpellReference spell={spell} /> : <p className="text-sm text-[var(--accent-danger)]">This spell is no longer available.</p>)}
      {item.kind === 'tool' && <div><p className="text-sm text-[var(--text-2)]">{item.body}</p>{item.href && <Link className="btn-secondary mt-3 text-sm print:hidden" href={item.href}>Open tool <span aria-hidden="true">→</span></Link>}</div>}
      {item.kind === 'rules' && <RulesReference />}
      {item.kind === 'party' && <DmPartyPanel summary={partySummary} loading={partyLoading} unavailable={partyUnavailable} />}
      {(item.kind === 'initiative' || item.kind === 'battle') && <BattleOrganizer mode="initiative" />}
  </>;
}

function SpellReference({ spell }: { spell: Spell }) {
  return <div className="dm-screen-spell-reference rounded-lg bg-[var(--steel-950)] p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-xl">{spell.name}</h3><p className="text-xs text-[var(--text-2)]">{levelLabel(spell.level)} {spell.school} · {spell.components}</p></div><div className="flex gap-1">{spell.concentration && <span className="rounded bg-[var(--bronze-wash)] px-2 py-1 text-xs text-[var(--bronze)]">Concentration</span>}{spell.ritual && <span className="rounded bg-[var(--steel-800)] px-2 py-1 text-xs">Ritual</span>}</div></div>
    <dl className="dm-screen-spell-facts mt-3 grid gap-2 text-sm"><div><dt className="micro-label">Casting time</dt><dd>{spell.castingTime}</dd></div><div><dt className="micro-label">Range</dt><dd>{spell.range}</dd></div><div><dt className="micro-label">Duration</dt><dd>{spell.duration}</dd></div></dl>
    <p className="mt-3 font-semibold">{spell.effectSummary}</p>
    <div className="mt-3 space-y-2 text-sm leading-relaxed">{spell.description.split('\n\n').map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}</div>
  </div>;
}
