import { useCallback, useRef, useState } from "react";
import { streamChat } from "../lib/api";
import { useSession } from "../state/SessionContext";

export function useChat() {
  const {
    sessionId,
    settings,
    findSuggestion,
    appendChatUser,
    startChatAssistant,
    appendChatAssistantToken,
    finishChatAssistant,
    replaceChatMessageId,
    setError,
  } = useSession();

  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (args: { message?: string; suggestion_id?: string }) => {
      if (!sessionId) return;
      if (!settings.groq_api_key) {
        setError("Add your Groq API key in Settings to chat.");
        return;
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }

      let userContent = args.message ?? "";
      let origin: "typed" | "suggestion" = "typed";
      if (args.suggestion_id) {
        const s = findSuggestion(args.suggestion_id);
        if (s) {
          userContent = `[${s.type}] ${s.title} - ${s.preview}`;
          origin = "suggestion";
        }
      }

      const localUserId = appendChatUser(userContent, origin, args.suggestion_id);
      const assistantId = startChatAssistant();
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        await streamChat(
          settings,
          {
            session_id: sessionId,
            message: args.message,
            suggestion_id: args.suggestion_id,
          },
          {
            onMeta: (meta) => {
              if (meta?.user_message_id) {
                replaceChatMessageId(localUserId, meta.user_message_id);
              }
            },
            onToken: (delta) => {
              appendChatAssistantToken(assistantId, delta);
            },
            onDone: (info) => {
              if (info?.assistant_message_id) {
                replaceChatMessageId(assistantId, info.assistant_message_id);
                finishChatAssistant(info.assistant_message_id);
              } else {
                finishChatAssistant(assistantId);
              }
            },
            onError: (err) => {
              setError(`Chat failed: ${err}`);
              finishChatAssistant(assistantId);
            },
          },
          ctrl.signal,
        );
      } catch (e: any) {
        if (ctrl.signal.aborted) {
          finishChatAssistant(assistantId);
        } else {
          setError(`Chat failed: ${e?.message ?? String(e)}`);
          finishChatAssistant(assistantId);
        }
      } finally {
        setStreaming(false);
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [
      sessionId,
      settings,
      findSuggestion,
      appendChatUser,
      startChatAssistant,
      appendChatAssistantToken,
      finishChatAssistant,
      replaceChatMessageId,
      setError,
    ],
  );

  const sendMessage = useCallback(
    (message: string) => run({ message }),
    [run],
  );
  const sendSuggestion = useCallback(
    (suggestion_id: string) => run({ suggestion_id }),
    [run],
  );

  return { sendMessage, sendSuggestion, streaming };
}
