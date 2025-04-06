import { beginCell } from '@ton/core';

describe('String Utils', () => {
    it('должен правильно искать точку перед последним компонентом домена', () => {
        // Тестовые случаи
        const testCases = [
            { input: "test.ton", expectedDotIndex: 4 },
            { input: "subdomain.test.ton", expectedDotIndex: 14 },
            { input: "no-dots", expectedDotIndex: -1 },
            { input: "multiple.dots.in.domain", expectedDotIndex: 16 }
        ];

        for (const testCase of testCases) {
            const slice = beginCell().storeStringTail(testCase.input).endCell().beginParse();
            let dotIndex = -1;
            let i = 0;
            let lastDotIndex = -1;
            const bits = slice.remainingBits;

            // Ищем все точки и запоминаем последнюю
            while (i * 8 < bits) {
                if (slice.loadUint(8) === 46) { // ASCII код точки
                    lastDotIndex = i;
                }
                i++;
            }

            expect(lastDotIndex).toBe(testCase.expectedDotIndex);
        }
    });

    it('должен правильно извлекать родительский домен', () => {
        // Тестовые случаи
        const testCases = [
            { input: "test.ton", expectedParent: "ton" },
            { input: "subdomain.test.ton", expectedParent: "test.ton" },
            { input: "no-dots", expectedParent: null },
            { input: "multiple.dots.in.domain", expectedParent: "dots.in.domain" }
        ];

        for (const testCase of testCases) {
            const slice = beginCell().storeStringTail(testCase.input).endCell().beginParse();
            let chars = [];
            let i = 0;
            const bits = slice.remainingBits;

            // Собираем все символы
            while (i * 8 < bits) {
                chars.push(slice.loadUint(8));
                i++;
            }

            // Ищем первую точку
            let firstDotIndex = -1;
            for (let i = 0; i < chars.length; i++) {
                if (chars[i] === 46) { // ASCII код точки
                    firstDotIndex = i;
                    break;
                }
            }

            if (firstDotIndex >= 0) {
                const parentDomain = chars.slice(firstDotIndex + 1).map(c => String.fromCharCode(c)).join('');
                expect(parentDomain).toBe(testCase.expectedParent);
            } else {
                expect(testCase.expectedParent).toBeNull();
            }
        }
    });
}); 