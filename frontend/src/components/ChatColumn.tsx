import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../lib/types";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  chat: ChatMessage[];
  streaming: boolean;
  onSend: (text: string) => void;
  hasApiKey: boolean;
}

export function ChatColumn({ chat, streaming, onSend, hasApiKey }: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.length, chat[chat.length - 1]?.content.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !hasApiKey) return;
    onSend(text);
    setDraft("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <section className="flex min-h-0 flex-col rounded-2xl bg-ink-900/70 ring-1 ring-white/5 shadow-xl backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">
            Chat
          </h2>
          <p className="text-[13px] text-slate-300">
            Ask anything, or tap a suggestion on the left.
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="scroll-slim min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
      >
        {chat.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-slate-500">
            <div>
              <p className="text-[15px] text-slate-300">Chat is empty.</p>
              <p className="mt-1 text-[13px] text-slate-400">
                Type a question, or click a suggestion for a detailed answer.
              </p>
            </div>
          </div>
        )}

        {chat.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-t border-white/5 p-3"
      >
        <div className="flex items-end gap-2 rounded-xl bg-ink-800/80 p-2 ring-1 ring-white/5 focus-within:ring-accent-400/50">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={!hasApiKey}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              hasApiKey
                ? "Ask about the meeting…"
                : "Add your Groq API key in Settings to chat"
            }
            className="max-h-36 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-slate-100 placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={streaming || !hasApiKey || !draft.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500 text-white transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
            title="Send"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <p className="mt-1 pl-2 text-[11px] text-slate-400">
          Shift + Enter for new line
        </p>
      </form>
    </section>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const html = renderMarkdown(message.content);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ring-1 shadow",
          isUser
            ? "bg-accent-500/20 text-slate-100 ring-accent-400/20"
            : "bg-ink-800/80 text-slate-200 ring-white/5",
        ].join(" ")}
      >
        {message.origin === "suggestion" && isUser && (
          <div className="mb-1 text-[10px] uppercase tracking-wider text-accent-400">
            Suggestion
          </div>
        )}
        {message.content ? (
          <div
            className="prose-chat"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <span className="inline-flex items-center gap-2 text-slate-400">
            <span className="rec-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span className="text-xs">Thinking…</span>
          </span>
        )}
        {message.streaming && message.content && (
          <span className="caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-slate-300" />
        )}
      </div>
    </div>
  );
}
