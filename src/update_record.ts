import { TonClient, WalletContractV4, internal, toNano, Address, beginCell, Cell } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { delay } from './extra/delay';
import { AutoDNS } from './auto_dns';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    if (!process.env.MNEMONIC) {
        throw new Error('MNEMONIC не найден в .env');
    }

    if (!process.env.DNS_AUTO_CONTRACT_ADDRESS) {
        throw new Error('DNS_AUTO_CONTRACT_ADDRESS не найден в .env');
    }

    const key = process.argv[2];
    const category = parseInt(process.argv[3]);
    const value = process.argv[4];

    if (!key || !category || !value) {
        throw new Error('Использование: ts-node update_record.ts <key> <category> <value>');
    }

    console.log('🔄 Инициализация клиента TON...');
    const client = new TonClient({
        endpoint: process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: process.env.TON_API_KEY
    });

    console.log('🔑 Загрузка ключей кошелька...');
    const mnemonics = process.env.MNEMONIC.trim().split(' ');
    const keyPair = await mnemonicToWalletKey(mnemonics);

    const wallet = client.open(
        WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 })
    );

    console.log('📦 Подготовка контракта...');
    const autoDNS = AutoDNS.createFromAddress(Address.parse(process.env.DNS_AUTO_CONTRACT_ADDRESS));

    console.log('⏳ Ожидание готовности кошелька...');
    await delay(10000);
    const seqno = await wallet.getSeqno();

    const valueCell = beginCell()
        .storeBuffer(Buffer.from(value, 'utf-8'))
        .endCell();

    console.log('📤 Отправка транзакции обновления...');
    await wallet.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: autoDNS.address,
                value: toNano('0.1'),
                body: beginCell()
                    .storeUint(0x23456789, 32)  // op = update
                    .storeStringTail(key)
                    .storeUint(category, 256)
                    .storeRef(valueCell)
                    .endCell(),
                bounce: true,
            }),
        ],
    });

    console.log('✅ Запрос на обновление отправлен!');
    console.log('⏳ Ожидание подтверждения транзакции...');
    await delay(30000);

    // Если нет API ключа, добавляем задержку
    if (!process.env.TON_API_KEY) {
        await delay(10000);
    }

    console.log('🔍 Проверка записи...');
    const record = await autoDNS.getRecord(client.provider(autoDNS.address), key);
    console.log('Запись:', record ? {
        category: record.category,
        value: record.value.toString()
    } : 'не найдена');
}

main().catch(e => console.error('❌ Ошибка:', e)); 