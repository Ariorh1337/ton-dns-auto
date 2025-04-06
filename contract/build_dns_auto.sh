#!/bin/bash

set -e

# Устанавливаем ton-compiler
echo "📥 Устанавливаем ton-compiler..."
npm install ton-compiler

# Скачиваем контракт
echo "Удаляем старый контракт..."
rm -f dns-auto-code.cell
#rm -f dns-auto-code.fc
#echo "📥 Скачиваем контракт..."
#wget -q https://raw.githubusercontent.com/ton-blockchain/ton/refs/heads/master/crypto/smartcont/dns-auto-code.fc -O dns-auto-code.fc

# Компилируем контракт
echo "🔨 Компилируем контракт..."
npx ton-compiler --input ./dns-auto-code.fc --output ./dns-auto-code.cell --output-fift ./dns-auto-code.fif

# Проверяем результат
if [ ! -f "dns-auto-code.cell" ]; then
    echo "❌ Ошибка: файл dns-auto-code.cell не создан"
    exit 1
fi

# Проверяем, что файл содержит BOC
if ! file dns-auto-code.cell | grep -q "data"; then
    echo "❌ Ошибка: файл dns-auto-code.cell не является BOC файлом"
    echo "Содержимое файла:"
    hexdump -C dns-auto-code.cell | head
    exit 1
fi

echo -e "\n✅ Контракт собран успешно: dns-auto-code.cell"