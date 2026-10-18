import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Bot, Sparkles, Send, RotateCcw, UserRound, LoaderCircle } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./AssistantPanel.css";

type ChatRole = "user" | "assistant";
type ChatMessage = { id: string; role: ChatRole; text: string };
type ApiMessage = { role: "user" | "model"; parts: { text: string }[] };

const suggestions = [
  "Как оформить ежегодный отпуск?",
  "Помоги составить заявление на справку",
  "Как подготовиться к разговору с HR?",
];

const initialMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Привет! Я Jana AI — ИИ-помощник портала JanaМен. Могу объяснить общие HR-процессы, помочь составить заявление или структурировать рабочий вопрос. Я не вижу внутренние документы компании, поэтому конкретные правила лучше сверять с HR.",
};

export default function AssistantPanel({ requestLines = [] }: { requestLines?: string[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, errorText]);

  async function sendMessage(text: string) {
    const cleaned = text.trim();
    if (!cleaned || loading) return;
    if (cleaned.length > 4000) {
      setErrorText("Сообщение слишком длинное. Сократи его до 4000 символов.");
      return;
    }

    const userMessage: ChatMessage = {
      id: `${++messageCounter.current}-user`,
      role: "user",
      text: cleaned,
    };
    const nextMessages = [...messages, userMessage];
    if (/статус|на каком этапе|моя заявк|мои заявк|где моя заявк/i.test(cleaned)) {
      const reply = requestLines.length
        ? `Вот актуальное состояние ваших заявок:\n${requestLines.map((l) => `• ${l}`).join("\n")}`
        : "У вас пока нет заявок. Создайте первую на главной странице.";
      setMessages([...nextMessages, { id: `${++messageCounter.current}-assistant`, role: "assistant", text: reply }]);
      setInput("");
      return;
    }
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setErrorText("");

    try {
      const apiMessages: ApiMessage[] = nextMessages
        .filter((message) => message.id !== "welcome")
        .slice(-12)
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.text }],
        }));

      const { data, error } = await supabase.functions.invoke("gemini-assistant", {
        body: { messages: apiMessages },
      });

      if (error) {
        const detail = typeof data?.error === "string" ? data.error : error.message;
        throw new Error(detail || "Не удалось связаться с ИИ.");
      }
      if (!data || typeof data.reply !== "string" || !data.reply.trim()) {
        throw new Error(typeof data?.error === "string" ? data.error : "ИИ вернул пустой ответ.");
      }

      setMessages((current) => [
        ...current,
        { id: `${++messageCounter.current}-assistant`, role: "assistant", text: data.reply.trim() },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка.";
      setErrorText(
        message.includes("Failed to send a request")
          ? "Не удалось подключиться к ИИ. Проверь, что функция gemini-assistant опубликована в Supabase."
          : message,
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  function resetChat() {
    if (loading) return;
    setMessages([initialMessage]);
    setInput("");
    setErrorText("");
    inputRef.current?.focus();
  }

  return (
    <article className="content-card assistant-card ai-assistant" id="assistant">
      <div className="ai-assistant-header">
        <div className="ai-assistant-brand-icon"><Bot size={24} /></div>
        <div className="ai-assistant-heading">
          <div className="ai-assistant-kicker"><Sparkles size={13} /> ИИ-ПОМОЩНИК</div>
          <h2>Jana AI</h2>
          <p>На базе Google Gemini</p>
        </div>
        <button className="ai-reset-button" type="button" onClick={resetChat} disabled={loading} title="Начать новый диалог" aria-label="Начать новый диалог">
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="ai-assistant-messages" aria-live="polite" aria-label="Переписка с ИИ">
        {messages.map((message) => (
          <div className={`ai-message ai-message-${message.role}`} key={message.id}>
            <div className="ai-message-avatar">
              {message.role === "assistant" ? <Sparkles size={15} /> : <UserRound size={15} />}
            </div>
            <div className="ai-message-bubble">
              <span className="ai-message-author">{message.role === "assistant" ? "Jana AI" : "Вы"}</span>
              <p>{message.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="ai-message ai-message-assistant">
            <div className="ai-message-avatar"><Sparkles size={15} /></div>
            <div className="ai-message-bubble ai-thinking"><LoaderCircle size={16} className="ai-spin" /> Jana AI формирует ответ…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div className="ai-suggestions">
          <span>Попробуй спросить</span>
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void sendMessage(suggestion)} disabled={loading}>
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {errorText && <div className="ai-error" role="alert">{errorText}</div>}

      <form className="ai-composer" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Напиши свой вопрос…"
          rows={2}
          maxLength={4000}
          disabled={loading}
          aria-label="Сообщение для Jana AI"
        />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Отправить сообщение" title="Отправить">
          {loading ? <LoaderCircle size={18} className="ai-spin" /> : <Send size={18} />}
        </button>
      </form>
      <div className="ai-assistant-footnote">Ответы генерируются ИИ и могут содержать ошибки. Не отправляй пароли или конфиденциальные данные.</div>
    </article>
  );
}
