#!/usr/bin/env bash
# JanaМен: чистая установка и запуск. Использование: bash install.sh
set -e
cd "$(dirname "$0")"

need_ok=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log((a>22||(a===22&&b>=12))?"yes":"no")' 2>/dev/null || echo "no")
if [ "$need_ok" != "yes" ]; then
  echo "Нужен Node 22.12 или новее. Сейчас: $(node -v 2>/dev/null || echo 'не установлен')"
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"; nvm install 22; nvm use 22
  else
    echo "Установите Node 22 (https://nodejs.org или nvm) и запустите скрипт снова."; exit 1
  fi
fi

[ -f .env ] || { echo "Нет файла .env рядом с package.json"; exit 1; }
echo "Node $(node -v), npm $(npm -v)"
rm -rf node_modules
npm ci || npm install
for d in react react-dom @supabase/supabase-js vite; do
  [ -d "node_modules/$d" ] || { echo "ОШИБКА: node_modules/$d не установлен"; exit 1; }
done
echo "Зависимости установлены. Запускаю npm run dev…"
npm run dev
