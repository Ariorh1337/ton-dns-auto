#!/bin/bash

set -e

# === 1. Скачиваем исходники TON ===
git clone https://github.com/ton-blockchain/ton.git
cd ton

# Указываем безопасный каталог
git config --global --add safe.directory "$(pwd)"

# Обновляем сабмодули
git submodule update --init --recursive

# === 2. Устанавливаем зависимости ===
sudo apt update
sudo apt install -y build-essential cmake libssl-dev zlib1g-dev pkg-config libreadline-dev libmicrohttpd-dev

# === 3. Собираем func и fift ===
mkdir -p build && cd build
cmake ..
make func fift -j$(nproc)
cd ..

# === 4. Компилируем dns-auto-code.fc в .fif ===
FUNC=./ton/build/crypto/func

STDLIB=./ton/crypto/smartcont/stdlib.fc
SOURCE=./ton/crypto/smartcont/dns-auto-code.fc
OUT=dns-auto-code.cell

$FUNC -SPA -o $OUT $STDLIB $SOURCE

echo -e "\n✅ Контракт собран успешно: $OUT"