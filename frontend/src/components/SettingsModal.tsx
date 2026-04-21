import { useEffect, useMemo, useState } from "react";
import { useSession } from "../state/SessionContext";
import type { AppSettings } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const { settings, defaults, updateSettings, resetSettingsToDefaults } =
    useSession();

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings),
    [draft, settings],
  );

  if (!open) return null;

  const save = () => {
    updateSettings(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/10 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Settings</h3>
            <p className="text-xs text-slate-400">
              Prompts, context windows, and your Groq API key. Stored in your
              browser only.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M18.3 5.71 12 12l6.3 6.29-1.42 1.42L10.59 13.4 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
            </svg>
          </button>
        </header>

        <div className="scroll-slim flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <Section title="Groq API key" subtitle="Paste your own key. Never sent anywhere except Groq via the backend proxy.">
            <div className="flex items-center gap-2">
              <input
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={draft.groq_api_key}
                onChange={(e) =>
                  setDraft({ ...draft, groq_api_key: e.target.value.trim() })
                }
                placeholder="gsk_..."
                className="flex-1 rounded-lg bg-ink-800 px-3 py-2 font-mono text-sm text-slate-100 ring-1 ring-white/10 focus:outline-none focus:ring-accent-400/50"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </Section>

          <Section title="Prompts" subtitle="These are the main quality controls. Edit only if you want different behavior.">
            <div className="space-y-4">
              <PromptField
                label="Live suggestions prompt"
                hint="Must produce strict JSON with exactly 3 suggestions."
                value={draft.suggestion_prompt}
                onChange={(v) => setDraft({ ...draft, suggestion_prompt: v })}
                rows={10}
              />
              <PromptField
                label="Expanded-answer prompt (on suggestion click)"
                value={draft.expanded_prompt}
                onChange={(v) => setDraft({ ...draft, expanded_prompt: v })}
                rows={7}
              />
              <PromptField
                label="Chat prompt (user-typed)"
                value={draft.chat_prompt}
                onChange={(v) => setDraft({ ...draft, chat_prompt: v })}
                rows={6}
              />
            </div>
          </Section>

          <Section title="Behavior tuning" subtitle="Simple knobs with clear impact on output quality and speed.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField
                label="Suggestion context (seconds)"
                hint="More seconds = more context, but less focus on the latest moment."
                value={draft.suggestions_context_window_seconds}
                onChange={(n) =>
                  setDraft({ ...draft, suggestions_context_window_seconds: n })
                }
              />
              <NumberField
                label="Expanded answer context (seconds, 0=full)"
                hint="Use 0 for full transcript grounding."
                value={draft.expanded_context_window_seconds}
                onChange={(n) =>
                  setDraft({ ...draft, expanded_context_window_seconds: n })
                }
              />
              <NumberField
                label="Chat context (seconds, 0=full)"
                hint="Use 0 for full transcript grounding."
                value={draft.chat_context_window_seconds}
                onChange={(n) =>
                  setDraft({ ...draft, chat_context_window_seconds: n })
                }
              />
              <NumberField
                label="Auto-refresh suggestions (seconds)"
                hint="How often new suggestions are generated while recording."
                value={draft.auto_refresh_seconds}
                onChange={(n) => setDraft({ ...draft, auto_refresh_seconds: n })}
              />
              <NumberField
                label="Mic chunk length (seconds)"
                hint="How long each recording segment is before it is sent for transcription."
                value={draft.chunk_seconds}
                onChange={(n) => setDraft({ ...draft, chunk_seconds: n })}
              />
              <NumberField
                label="Suggestion temperature"
                hint="Higher = more varied suggestions (0–2 typical)."
                value={draft.suggestion_temperature}
                onChange={(n) =>
                  setDraft({ ...draft, suggestion_temperature: n })
                }
                step={0.05}
              />
              <NumberField
                label="Chat temperature"
                hint="For typed chat messages (0–2 typical)."
                value={draft.chat_temperature}
                onChange={(n) => setDraft({ ...draft, chat_temperature: n })}
                step={0.05}
              />
              <NumberField
                label="Expanded answer temperature"
                hint="When you tap a suggestion card (0–2 typical)."
                value={draft.expanded_temperature}
                onChange={(n) =>
                  setDraft({ ...draft, expanded_temperature: n })
                }
                step={0.05}
              />
            </div>
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/5 bg-ink-900/95 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              resetSettingsToDefaults();
              setDraft({ ...draft, ...defaults });
            }}
            className="rounded-lg px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10 hover:bg-white/5"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!dirty}
              className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-semibold text-white shadow shadow-accent-500/20 transition hover:bg-accent-400 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[13px] font-semibold text-slate-200">{title}</h4>
      {subtitle && <p className="mt-0.5 text-[11.5px] text-slate-500">{subtitle}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function PromptField({
  label,
  hint,
  value,
  onChange,
  rows,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500">
        <span>{label}</span>
        {hint && <span className="normal-case text-[10px] text-slate-600">{hint}</span>}
      </div>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="scroll-slim w-full resize-y rounded-lg bg-ink-800 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-slate-100 ring-1 ring-white/10 focus:outline-none focus:ring-accent-400/50"
      />
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      {hint && <div className="mb-1 text-[11px] text-slate-500">{hint}</div>}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg bg-ink-800 px-3 py-2 font-mono text-sm text-slate-100 ring-1 ring-white/10 focus:outline-none focus:ring-accent-400/50"
      />
    </label>
  );
}
