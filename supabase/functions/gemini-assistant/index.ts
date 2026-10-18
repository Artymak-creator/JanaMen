// Supabase Edge Function: gemini-assistant
// Ключ хранится только в секретах Supabase (GEMINI_API_KEY), в браузер он не попадает.
// Публикация:
//   supabase secrets set GEMINI_API_KEY=<ваш новый ключ>
//   supabase functions deploy gemini-assistant

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";

const SYSTEM_PROMPT =
  "Ты Jana AI, помощник внутреннего портала JanaPost (JanaМен). Отвечай по-русски, кратко и дружелюбно. " +
  "Помогай с вопросами об отпусках, заявках, обучении и работе портала. " +
  "Порядок согласования заявки: сотрудник → руководитель → HR. Заявки подают все, кроме HR. " +
  "Типы ежегодного отпуска: оплачиваемый (списывает остаток дней) и без сохранения заработной платы. " +
  "Не выдумывай данные о конкретных заявках и остатках дней: если не знаешь, предложи уточнить у HR.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Метод не поддерживается." }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "На сервере не задан GEMINI_API_KEY (Supabase → Edge Functions → Secrets)." }, 500);

  let payload: { messages?: { role: string; parts: { text: string }[] }[] };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Некорректный запрос." }, 400);
  }

  const contents = (payload.messages ?? [])
    .slice(-12)
    .filter((m) => (m.role === "user" || m.role === "model") && typeof m.parts?.[0]?.text === "string")
    .map((m) => ({ role: m.role, parts: [{ text: m.parts[0].text.slice(0, 4000) }] }));

  if (!contents.length) return json({ error: "Пустое сообщение." }, 400);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message ?? "Ошибка Gemini API." }, 502);
    const reply = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    if (!reply.trim()) return json({ error: "ИИ вернул пустой ответ." }, 502);
    return json({ reply });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Не удалось связаться с Gemini." }, 502);
  }
});
