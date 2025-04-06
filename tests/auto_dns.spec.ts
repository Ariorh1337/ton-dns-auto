import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { AutoDNS } from '../build/auto_dns_AutoDNS';
import '@ton-community/test-utils';
import { sha256_sync } from '@ton/crypto';
import fs from 'fs';

describe('AutoDNS', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let autoDNS: SandboxContract<AutoDNS>;
    
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        
        // Читаем скомпилированный код контракта
        const autoDNSCode = Cell.fromBoc(fs.readFileSync('./build/auto_dns_AutoDNS.code.boc'))[0];
        
        // Создаем контракт
        const contract = await AutoDNS.fromInit(deployer.address, "test.ton");
        autoDNS = blockchain.openContract(contract);
        
        // Деплоим контракт
        const deployResult = await autoDNS.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'Deploy',
                queryId: 0n
            }
        );
        
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: autoDNS.address,
            success: true
        });
    });
    
    it('должен возвращать null для несуществующей записи', async () => {
        const result = await autoDNS.getRecord("nonexistent.test.ton");
        expect(result).toBeNull();
    });
    
    it('должен возвращать запись для существующего домена', async () => {
        // Создаем тестовую запись
        const testDomain = "test.subdomain.test.ton";
        const testCategory = 1n;
        const testValue = beginCell().storeUint(123, 32).endCell();
        
        // Добавляем запись
        const updateResult = await autoDNS.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'UpdateRecord',
                op: 0x23456789n,
                key: testDomain,
                category: testCategory,
                value: testValue
            }
        );
        
        // Проверяем, что запись добавлена успешно
        expect(updateResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: autoDNS.address,
            success: true
        });
        
        // Получаем запись и проверяем её
        const record = await autoDNS.getRecord(testDomain);
        expect(record).not.toBeNull();
        expect(record?.category).toBe(testCategory);
        expect(record?.value.equals(testValue)).toBe(true);
    });
    
    it('должен искать запись в родительском домене', async () => {
        // Создаем запись для родительского домена
        const parentDomain = "test.ton";
        const testCategory = 1n;
        const testValue = beginCell().storeUint(123, 32).endCell();
        
        // Добавляем запись для родительского домена
        await autoDNS.send(
            deployer.getSender(),
            {
                value: toNano('0.05')
            },
            {
                $$type: 'UpdateRecord',
                op: 0x23456789n,
                key: parentDomain,
                category: testCategory,
                value: testValue
            }
        );
        
        // Пробуем получить запись для поддомена
        const record = await autoDNS.getRecord("subdomain.test.ton");
        expect(record).not.toBeNull();
        expect(record?.category).toBe(testCategory);
        expect(record?.value.equals(testValue)).toBe(true);
    });

    it('должен правильно искать точку в строке', () => {
        // Тестовые случаи
        const testCases = [
            { input: "test.ton", expectedDotIndex: 4 },
            { input: "subdomain.test.ton", expectedDotIndex: 13 },
            { input: "no-dots", expectedDotIndex: -1 },
            { input: "multiple.dots.in.domain", expectedDotIndex: 19 }
        ];

        for (const testCase of testCases) {
            const slice = beginCell().storeStringTail(testCase.input).endCell().beginParse();
            let dotIndex = -1;
            let i = 0;
            const bits = slice.remainingBits;

            while (i * 8 < bits) {
                if (slice.loadUint(8) === 46) { // ASCII код точки
                    dotIndex = i;
                }
                i++;
            }

            expect(dotIndex).toBe(testCase.expectedDotIndex);
        }
    });
}); 