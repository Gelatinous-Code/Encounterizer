'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import type { NoteRecord } from '@/lib/notes';
import { createDebouncedNoteWriter, type DebouncedNoteWriter } from '@/lib/notes-autosave';
import type {
  NoteRepositoryStatus,
  NoteStorageError,
  NoteWriteResult,
} from '@/lib/notes-repository';

export interface DmScreenScratchpadProps {
  note?: NoteRecord;
  fallbackBody?: string;
  fallbackTitle: string;
  hydrated: boolean;
  repositoryStatus: NoteRepositoryStatus;
  repositoryError: NoteStorageError | null;
  onSave: (noteId: string, body: string) => Promise<NoteWriteResult>;
  onLegacyBodyChange: (body: string) => void;
}

type DraftStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

function resizeTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  textarea.style.height = '0px';
  textarea.style.height = `${Math.max(128, textarea.scrollHeight)}px`;
}

export default function DmScreenScratchpad({
  note,
  fallbackBody,
  fallbackTitle,
  hydrated,
  repositoryStatus,
  repositoryError,
  onSave,
  onLegacyBodyChange,
}: DmScreenScratchpadProps) {
  const noteId = note?.id;
  const [draft, setDraft] = useState(note?.body ?? fallbackBody ?? '');
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [draftError, setDraftError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const writerRef = useRef<DebouncedNoteWriter<string> | null>(null);
  const onSaveRef = useRef(onSave);
  const draftRef = useRef(draft);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [draft]);

  useEffect(() => {
    if (!noteId) {
      writerRef.current = null;
      return;
    }
    const writer = createDebouncedNoteWriter<string>({
      delayMs: 500,
      async save(body) {
        const result = await onSaveRef.current(noteId, body);
        if (!result.ok) {
          throw result.error ?? new Error('The scratchpad could not be saved.');
        }
      },
      onSaving() {
        setDraftStatus('saving');
        setDraftError('');
      },
      onSaved(body) {
        if (draftRef.current === body) setDraftStatus('saved');
      },
      onError(error) {
        setDraftStatus('error');
        setDraftError(error instanceof Error
          ? error.message
          : 'The scratchpad could not be saved.');
      },
    });
    writerRef.current = writer;
    return () => {
      if (writerRef.current === writer) writerRef.current = null;
      void writer.dispose();
    };
  }, [noteId]);

  useEffect(() => {
    if (!note || writerRef.current?.hasPending()) return;
    setDraft(note.body ?? '');
    setDraftStatus('idle');
    setDraftError('');
  }, [note, note?.body, note?.updatedAt]);

  const flush = useCallback(() => {
    void writerRef.current?.flush().catch(() => {
      // The writer retains the draft and exposes the error for retry.
    });
  }, []);

  useEffect(() => {
    const handlePageHide = () => flush();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flush]);

  function updateDraft(event: ChangeEvent<HTMLTextAreaElement>): void {
    const body = event.target.value;
    setDraft(body);
    resizeTextarea(event.target);
    if (!noteId) {
      onLegacyBodyChange(body);
      return;
    }
    setDraftStatus('dirty');
    setDraftError('');
    writerRef.current?.schedule(body);
  }

  const unavailable = !noteId && hydrated
    && (repositoryStatus === 'error' || repositoryStatus === 'unavailable');
  const status = draftStatus === 'saving'
    || (noteId && repositoryStatus === 'saving' && draftStatus !== 'dirty')
    ? 'saving'
    : draftStatus;

  return (
    <div>
      <textarea
        ref={textareaRef}
        className="w-full resize-none overflow-hidden border-0 bg-transparent print:hidden"
        aria-label={`Notes for ${note?.title?.trim() || fallbackTitle}`}
        rows={5}
        value={draft}
        maxLength={200_000}
        onChange={updateDraft}
        onBlur={flush}
      />
      <div className="hidden whitespace-pre-wrap text-sm leading-relaxed print:block">
        {draft}
      </div>

      <div className="mt-2 min-h-5 text-xs print:hidden" aria-live="polite">
        {!hydrated || repositoryStatus === 'loading' || repositoryStatus === 'idle' ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--text-3)]">
            <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
            Opening notes…
          </span>
        ) : status === 'dirty' ? (
          <span className="text-[var(--text-3)]">Waiting to save…</span>
        ) : status === 'saving' ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--text-2)]">
            <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
            Saving…
          </span>
        ) : status === 'saved' ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--text-3)]">
            <CheckCircle2 size={13} className="text-[var(--status-success)]" aria-hidden="true" />
            Saved
          </span>
        ) : status === 'error' ? (
          <span className="flex flex-wrap items-center gap-2 text-[var(--status-danger)]" role="alert">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle size={13} aria-hidden="true" />
              {draftError || repositoryError?.message || 'The latest note is still available here but was not saved.'}
            </span>
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                void writerRef.current?.retry().catch(() => undefined);
              }}
            >
              Retry
            </button>
          </span>
        ) : unavailable ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--status-warning)]" role="alert">
            <AlertTriangle size={13} aria-hidden="true" />
            {repositoryError?.message ?? 'Notes storage is unavailable. This legacy panel remains on the screen.'}
          </span>
        ) : noteId ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--text-3)]">
            <CheckCircle2 size={13} className="text-[var(--status-success)]" aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
