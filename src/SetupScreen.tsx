import { ScenicBanner } from "./components/Art";

/** Показывается вместо белой страницы, если .env не заполнен. */
export default function SetupScreen() {
  return (
    <div className="setup-wrap">
      <div className="setup-card">
        <ScenicBanner />
        <div className="setup-body">
          <h1>Осталось подключить Supabase</h1>
          <p>Портал не нашёл настройки базы данных. Это нужно сделать один раз:</p>
          <ol>
            <li>В папке проекта скопируйте файл <code>.env.example</code> в <code>.env</code>.</li>
            <li>В Supabase откройте <b>Project Settings → API</b> и скопируйте URL и публичный (anon / publishable) ключ.</li>
            <li>Вставьте их в <code>.env</code>:
              <pre>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=ваш_публичный_ключ`}</pre>
            </li>
            <li>В SQL Editor выполните три файла из <code>supabase/</code> по порядку.</li>
            <li>Остановите <code>npm run dev</code> и запустите заново — Vite читает .env только при старте.</li>
          </ol>
          <p>Секретный ключ <code>service_role</code> сюда вставлять нельзя.</p>
        </div>
      </div>
    </div>
  );
}
