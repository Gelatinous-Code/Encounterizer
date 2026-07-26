'use client';

import {
  BookOpen,
  FileText,
  FolderPlus,
  ListOrdered,
  Search,
  Skull,
  Sparkles,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DmScreenItemKind } from '@/lib/dm-screen';
import { DM_SCREEN_TOOL_ROUTES } from '@/lib/site';

export interface DmScreenQuickAddResourceResult {
  id: string;
  name: string;
  detail: string;
}

export interface DmScreenQuickAddActionResult {
  ok: boolean;
  error?: string;
}

export interface DmScreenQuickAddDrawerProps {
  open: boolean;
  sectionOptions: readonly { id: string; label: string }[];
  selectedTargetSectionId: string;
  addKind: DmScreenItemKind;
  title: string;
  body: string;
  resourceQuery: string;
  toolPath: string;
  resourceResults: readonly DmScreenQuickAddResourceResult[];
  onClose: () => void;
  onSelectedTargetSectionIdChange: (sectionId: string) => void;
  onAddKindChange: (kind: DmScreenItemKind) => void;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
  onResourceQueryChange: (query: string) => void;
  onToolPathChange: (path: string) => void;
  onCreateSection: (name?: string) => Promise<DmScreenQuickAddActionResult>;
  onAddConfiguredItem: () => Promise<DmScreenQuickAddActionResult>;
  onAddResource: (resourceId: string, resourceTitle: string) => Promise<DmScreenQuickAddActionResult>;
}

interface AddKindOption {
  kind: Exclude<DmScreenItemKind, 'battle'>;
  label: string;
  description: string;
  icon: LucideIcon;
}

const ADD_KIND_OPTIONS: readonly AddKindOption[] = [
  { kind: 'note', label: 'Scratchpad', description: 'Fast notes during play', icon: FileText },
  { kind: 'party', label: 'Party', description: 'Active party at a glance', icon: Users },
  { kind: 'rules', label: 'Rules', description: 'Core table reference', icon: BookOpen },
  { kind: 'monster', label: 'Monster', description: 'Search your bestiary', icon: Skull },
  { kind: 'spell', label: 'Spell', description: 'Search your spellbook', icon: Sparkles },
  { kind: 'tool', label: 'Tool', description: 'Shortcut to another tool', icon: Wrench },
  { kind: 'initiative', label: 'Initiative', description: 'Round and turn tracker', icon: ListOrdered },
] as const;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function addButtonLabel(kind: DmScreenItemKind): string {
  if (kind === 'note') return 'Add scratchpad';
  if (kind === 'party') return 'Add party panel';
  if (kind === 'rules') return 'Add rules reference';
  if (kind === 'tool') return 'Add tool shortcut';
  if (kind === 'initiative') return 'Add initiative tracker';
  return 'Add note';
}

export default function DmScreenQuickAddDrawer({
  open,
  sectionOptions,
  selectedTargetSectionId,
  addKind,
  title,
  body,
  resourceQuery,
  toolPath,
  resourceResults,
  onClose,
  onSelectedTargetSectionIdChange,
  onAddKindChange,
  onTitleChange,
  onBodyChange,
  onResourceQueryChange,
  onToolPathChange,
  onCreateSection,
  onAddConfiguredItem,
  onAddResource,
}: DmScreenQuickAddDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const newSectionInputRef = useRef<HTMLInputElement>(null);
  const noteBodyRef = useRef<HTMLTextAreaElement>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const shellElements = Array.from(document.querySelectorAll<HTMLElement>('[data-app-shell]'));
    const previousInert = shellElements.map((element) => ({ element, inert: element.inert }));
    document.body.style.overflow = 'hidden';
    shellElements.forEach((element) => {
      element.inert = true;
    });
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousBodyOverflow;
      previousInert.forEach(({ element, inert }) => {
        element.inert = inert;
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open || addKind !== 'note') return;
    const frame = window.requestAnimationFrame(() => noteBodyRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [addKind, open]);

  if (!open) return null;

  const resourceKind = addKind === 'monster' || addKind === 'spell';
  const canAddConfiguredItem = sectionOptions.length > 0
    && addKind !== 'monster'
    && addKind !== 'spell'
    && addKind !== 'battle'
    && (addKind !== 'note' || Boolean(title.trim() || body.trim()));

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.defaultPrevented) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (
      addKind === 'note'
      && event.key === 'Enter'
      && (event.ctrlKey || event.metaKey)
      && canAddConfiguredItem
      && !actionBusy
    ) {
      event.preventDefault();
      void addConfiguredItem();
      return;
    }

    if (event.key !== 'Tab') return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
    if (focusable.length === 0) {
      event.preventDefault();
      headingRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    const activeIsFocusable = activeElement instanceof HTMLElement
      && focusable.includes(activeElement);
    if (event.shiftKey && (!activeIsFocusable || activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!activeIsFocusable || activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  async function createSection(): Promise<void> {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError('');
    try {
      const result = await onCreateSection(newSectionName.trim() || undefined);
      if (!result.ok) {
        setActionError(result.error ?? 'That section could not be created. Nothing was changed.');
        return;
      }
      setNewSectionName('');
      window.requestAnimationFrame(() => newSectionInputRef.current?.focus());
    } catch {
      setActionError('That section could not be created. Nothing was changed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function addConfiguredItem(): Promise<void> {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError('');
    try {
      const result = await onAddConfiguredItem();
      if (!result.ok) setActionError(result.error ?? 'That panel could not be added. Your draft is still here.');
    } catch {
      setActionError('That panel could not be added. Your draft is still here.');
    } finally {
      setActionBusy(false);
    }
  }

  async function addResource(resourceId: string, resourceTitle: string): Promise<void> {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError('');
    try {
      const result = await onAddResource(resourceId, resourceTitle);
      if (!result.ok) setActionError(result.error ?? 'That reference could not be added. Your search is still here.');
    } catch {
      setActionError('That reference could not be added. Your search is still here.');
    } finally {
      setActionBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex min-w-0 justify-end overflow-hidden bg-black/70 print:hidden"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dm-screen-quick-add-heading"
        aria-describedby="dm-screen-quick-add-description"
        className="flex h-[100dvh] w-full min-w-0 max-w-xl flex-col overflow-hidden border-l border-[var(--steel-700)] bg-[var(--surface-raised)] shadow-2xl"
        onKeyDown={trapFocus}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--steel-800)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="micro-label">Quick add</p>
            <h2
              id="dm-screen-quick-add-heading"
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 w-fit rounded text-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bronze)]"
            >
              Add to your screen
            </h2>
            <p id="dm-screen-quick-add-description" className="mt-1 text-sm text-[var(--text-2)]">
              Choose a panel, then place it where you need it.
            </p>
          </div>
          <button type="button" className="btn-ghost shrink-0 px-3" aria-label="Close Quick add" onClick={onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <section aria-labelledby="dm-screen-quick-add-step-one">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bronze)] text-xs font-bold text-[var(--ink)]">1</span>
              <div>
                <p className="micro-label">Panel type</p>
                <h3 id="dm-screen-quick-add-step-one" className="text-lg">What do you need?</h3>
              </div>
            </div>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-2" role="group" aria-label="Panel type">
              {ADD_KIND_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = addKind === option.kind;
                return (
                  <button
                    key={option.kind}
                    type="button"
                    className={`min-w-0 rounded-xl border p-3 text-left transition-colors ${selected
                      ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]'
                      : 'border-[var(--steel-800)] bg-[var(--surface-panel)] hover:border-[var(--steel-700)]'}`}
                    aria-pressed={selected}
                    onClick={() => onAddKindChange(option.kind)}
                  >
                    <span className="flex min-w-0 items-center gap-2 font-semibold text-[var(--text-1)]">
                      <Icon size={17} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />
                      <span className="min-w-0 break-words">{option.label}</span>
                    </span>
                    <span className="mt-1 hidden text-xs leading-snug text-[var(--text-3)] sm:block">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-7 border-t border-[var(--steel-800)] pt-5" aria-labelledby="dm-screen-quick-add-step-two">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--steel-800)] text-xs font-bold text-[var(--bronze)]">2</span>
              <div>
                <p className="micro-label">Configure and place</p>
                <h3 id="dm-screen-quick-add-step-two" className="text-lg">Set up the panel</h3>
              </div>
            </div>

            <div className="mt-4 min-w-0 space-y-4">
              {sectionOptions.length > 0 ? (
                <label className="block text-sm font-semibold">
                  Add to section
                  <select
                    className="mt-1 w-full min-w-0"
                    value={selectedTargetSectionId}
                    onChange={(event) => onSelectedTargetSectionIdChange(event.target.value)}
                  >
                    {sectionOptions.map((section) => (
                      <option key={section.id} value={section.id}>{section.label}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="rounded-lg border border-dashed border-[var(--steel-700)] p-3 text-sm text-[var(--text-2)]">
                  Create a section before adding your first panel.
                </p>
              )}

              <div className="surface-inset min-w-0 p-3">
                <label className="block text-sm font-semibold">
                  New section name <span className="font-normal text-[var(--text-3)]">(optional)</span>
                  <input
                    ref={newSectionInputRef}
                    className="mt-1 w-full min-w-0"
                    value={newSectionName}
                    onChange={(event) => setNewSectionName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void createSection();
                      }
                    }}
                    placeholder="New section"
                    maxLength={240}
                  />
                </label>
                <button type="button" className="btn-secondary mt-2 w-full justify-center" disabled={actionBusy} onClick={() => void createSection()}>
                  <FolderPlus size={17} aria-hidden="true" /> {actionBusy ? 'Saving…' : 'Create section'}
                </button>
              </div>

              {actionError && <p role="alert" className="rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-wash)] p-3 text-sm">{actionError}</p>}

              {resourceKind ? (
                <>
                  <label className="block text-sm font-semibold">
                    Find a {addKind}
                    <span className="relative mt-1 block">
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" aria-hidden="true" />
                      <input
                        className="w-full min-w-0 pl-9"
                        type="search"
                        value={resourceQuery}
                        onChange={(event) => onResourceQueryChange(event.target.value)}
                        placeholder={`Search ${addKind}s…`}
                      />
                    </span>
                  </label>
                  {resourceQuery.trim().length < 2 ? (
                    <p className="text-sm text-[var(--text-3)]">Enter at least two letters to search.</p>
                  ) : resourceResults.length > 0 ? (
                    <div className="grid min-w-0 gap-2 sm:grid-cols-2" aria-live="polite">
                      {resourceResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          className="min-w-0 rounded-lg border border-[var(--steel-800)] bg-[var(--surface-panel)] p-3 text-left hover:border-[var(--bronze)]"
                          disabled={sectionOptions.length === 0 || actionBusy}
                          onClick={() => void addResource(result.id, result.name)}
                        >
                          <span className="block break-words font-semibold">{result.name}</span>
                          <span className="mt-0.5 block break-words text-xs text-[var(--text-3)]">{result.detail}</span>
                          <span className="mt-2 block text-xs font-semibold text-[var(--bronze)]">Add {addKind}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-3)]" role="status">No matching {addKind}s found.</p>
                  )}
                </>
              ) : (
                <>
                  <label className="block text-sm font-semibold">
                    Panel title <span className="font-normal text-[var(--text-3)]">(optional)</span>
                    <input
                      className="mt-1 w-full min-w-0"
                      value={title}
                      onChange={(event) => onTitleChange(event.target.value)}
                      placeholder={addKind === 'note' ? 'Session reminder' : undefined}
                      maxLength={240}
                    />
                  </label>

                  {addKind === 'note' && (
                    <div className="block text-sm font-semibold">
                      <label htmlFor="dm-screen-quick-add-note-body">Scratchpad</label>
                      <textarea
                        id="dm-screen-quick-add-note-body"
                        ref={noteBodyRef}
                        aria-describedby="dm-screen-quick-add-note-keyboard-help"
                        className="mt-1 w-full min-w-0 resize-y"
                        rows={5}
                        value={body}
                        onChange={(event) => onBodyChange(event.target.value)}
                        placeholder="Rules reminder, boxed text, NPC notes, session beats…"
                        maxLength={200_000}
                      />
                      <p id="dm-screen-quick-add-note-keyboard-help" className="mt-1 text-xs font-normal text-[var(--text-3)]">
                        Enter adds a new line. Press Ctrl+Enter or Command+Enter to add the scratchpad.
                      </p>
                      <button
                        type="button"
                        className="btn-ghost mt-2 !min-h-9 !px-2 text-xs"
                        onClick={() => {
                          const timestamp = new Intl.DateTimeFormat(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date());
                          const separator = body.length === 0 || body.endsWith('\n') ? '' : '\n';
                          onBodyChange(`${body}${separator}${timestamp} — `);
                          window.requestAnimationFrame(() => noteBodyRef.current?.focus());
                        }}
                      >
                        Add current time
                      </button>
                    </div>
                  )}

                  {addKind === 'tool' && (
                    <>
                      <label className="block text-sm font-semibold">
                        Tool
                        <select className="mt-1 w-full min-w-0" value={toolPath} onChange={(event) => onToolPathChange(event.target.value)}>
                          {DM_SCREEN_TOOL_ROUTES.map((route) => (
                            <option key={route.path} value={route.path}>{route.title}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-semibold">
                        Table reminder <span className="font-normal text-[var(--text-3)]">(optional)</span>
                        <input
                          className="mt-1 w-full min-w-0"
                          value={body}
                          onChange={(event) => onBodyChange(event.target.value)}
                          placeholder="How will you use this tool tonight?"
                          maxLength={200_000}
                        />
                      </label>
                    </>
                  )}

                  <button
                    type="button"
                    className="btn-primary w-full justify-center"
                    disabled={!canAddConfiguredItem || actionBusy}
                    onClick={() => void addConfiguredItem()}
                  >
                    <Sparkles size={17} aria-hidden="true" /> {actionBusy ? 'Adding…' : addButtonLabel(addKind)}
                  </button>
                  {addKind === 'note' && !title.trim() && !body.trim() && (
                    <p className="text-xs text-[var(--text-3)]">Add a title or note before placing this panel.</p>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
