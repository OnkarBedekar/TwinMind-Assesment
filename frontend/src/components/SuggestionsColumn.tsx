import type { Suggestion, SuggestionBatch, SuggestionType } from "../lib/types";

interface Props {
  batches: SuggestionBatch[];
  loading: boolean;
  onRefresh: () => void;
  onPick: (s: Suggestion) => void;
  hasApiKey: boolean;
}

const TYPE_META: Record<
  SuggestionType,
  { label: string; dot: string; ring: string }
> = {
  question: {
    label: "Question to ask",
    dot: "bg-sky-400",
    ring: "ring-sky-400/30",
  },
  talking_point: {
    label: "Talking point",
    dot: "bg-violet-400",
    ring: "ring-violet-400/30",
  },
  answer: {
    label: "Answer",
    dot: "bg-emerald-400",
    ring: "ring-emerald-400/30",
  },
  fact_check: {
    label: "Fact check",
    dot: "bg-amber-400",
    ring: "ring-amber-400/30",
  },
  clarify: {
    label: "Clarify",
    dot: "bg-rose-400",
    ring: "ring-rose-400/30",
  },
};

function relativeTime(ts: number): string {
  const d = Math.max(0, Date.now() / 1000 - ts);
  if (d < 5) return "just now";
  if (d < 60) return `${Math.floor(d)}s ago`;
  const m = Math.floor(d / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function SuggestionsColumn({
  batches,
  loading,
  onRefresh,
  onPick,
  hasApiKey,
}: Props) {
  const ordered = [...batches].reverse();

  return (
    <section className="flex min-h-0 flex-col rounded-2xl bg-ink-900/70 ring-1 ring-white/5 shadow-xl backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">
            Live Suggestions
          </h2>
          <p className="text-[13px] text-slate-300">
            Refreshes every ~30s. Tap a card for a detailed answer.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || !hasApiKey}
          className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3.5 py-2 text-[13px] font-medium text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          title={hasApiKey ? "Refresh now" : "Add your Groq API key in Settings"}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 fill-current ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          >
            <path d="M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" />
          </svg>
          Refresh
        </button>
      </header>

      <div className="scroll-slim min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {ordered.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center text-center text-slate-500">
            <div>
              <p className="text-[15px] text-slate-300">Suggestions will appear here.</p>
              <p className="mt-1 text-[13px] text-slate-400">
                Start recording, or press Refresh once you have some transcript.
              </p>
            </div>
          </div>
        )}

        {loading && ordered.length === 0 && (
          <BatchSkeleton />
        )}

        {ordered.map((b, idx) => (
          <div key={b.batch_id}>
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500">
              <span>
                {idx === 0 ? "Latest batch" : `Batch ${ordered.length - idx}`}
              </span>
              <span>{relativeTime(b.created_at)}</span>
            </div>
            <div className="space-y-3">
              {b.suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  faded={idx !== 0}
                  onPick={onPick}
                />
              ))}
            </div>
          </div>
        ))}

        {loading && ordered.length > 0 && <BatchSkeleton inline />}
      </div>
    </section>
  );
}

function SuggestionCard({
  suggestion,
  faded,
  onPick,
}: {
  suggestion: Suggestion;
  faded: boolean;
  onPick: (s: Suggestion) => void;
}) {
  const meta = TYPE_META[suggestion.type] ?? TYPE_META.clarify;
  return (
    <button
      type="button"
      onClick={() => onPick(suggestion)}
      className={[
        "group w-full rounded-xl bg-ink-800/70 p-3.5 text-left ring-1 ring-white/5 transition",
        "hover:bg-ink-700/80 hover:ring-white/10 hover:-translate-y-0.5",
        faded ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        <span className="text-[10.5px] uppercase tracking-wider text-slate-400">
          {meta.label}
        </span>
      </div>
      <div className="text-[14px] font-semibold leading-snug text-slate-100">
        {suggestion.title}
      </div>
      <div className="mt-1 text-[13px] leading-relaxed text-slate-300">
        {suggestion.preview}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-accent-400 opacity-0 transition group-hover:opacity-100">
        <span>Open in chat</span>
        <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current">
          <path d="M5 12h12l-4-4 1.4-1.4L21 13l-6.6 6.4L13 18l4-4H5z" />
        </svg>
      </div>
    </button>
  );
}

function BatchSkeleton({ inline }: { inline?: boolean } = {}) {
  return (
    <div className={inline ? "" : ""}>
      {!inline && (
        <div className="mb-2 h-3 w-24 animate-pulse rounded bg-white/5" />
      )}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[92px] animate-pulse rounded-xl bg-ink-800/60 ring-1 ring-white/5"
          />
        ))}
      </div>
    </div>
  );
}
