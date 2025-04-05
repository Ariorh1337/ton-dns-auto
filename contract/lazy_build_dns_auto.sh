#!/bin/bash

set -e

# Скачиваем func из релиза
echo "📥 Скачиваем func из релиза..."
wget -q https://github.com/ton-blockchain/ton/releases/download/v2025.03/func-linux-x86_64 -O func
chmod +x func

# Компилируем контракт
echo "🔨 Компилируем контракт..."
./func -SPA -o dns-auto-code.cell stdlib.fc dns-auto-code.fc

# Удаляем скачанный func
rm func

echo -e "\n✅ Контракт собран успешно: dns-auto-code.cell"