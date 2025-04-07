import { Cell } from '@ton/core';

const bocData = 'te6cckEBAwEATQACUSTj238jRWeJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAQIAFGFyaW9yaC50b24AJGh0dHBzOi8vYXJpb3JoLmNvbVWgIL8=';

// Декодируем BOC
const cell = Cell.fromBoc(Buffer.from(bocData, 'base64'))[0];

// Парсим данные
const slice = cell.beginParse();

// Читаем категорию
const category = slice.loadUint(32); // Читаем 32-битное целое число
console.log('Category:', category);

// Проверяем оставшиеся биты
console.log('Remaining bits in slice:', slice.remainingBits);

// Читаем данные вручную
try {
    // Пример: Чтение первых 8 бит
    const firstBits = slice.loadBits(8);
    console.log('First 8 bits:', firstBits);

    // Пример: Чтение строки, если она есть
    if (slice.remainingBits > 0) {
        const value = slice.loadBits(slice.remainingBits); // Читаем оставшиеся биты как бинарные данные
        console.log('Remaining binary data:', value);
    }
} catch (error) {
    console.error('Ошибка при чтении данных:', error);
}