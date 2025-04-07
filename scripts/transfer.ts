import { TonClient, WalletContractV4, internal, toNano, Address } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { AutoDNS } from '../contract/build/auto_dns_AutoDNS';
import { beginCell } from '@ton/core';
import { delay } from './extra/delay';
import dotenv from 'dotenv';

dotenv.config();

// --- Constants ---
const RATE_LIMIT_TIME = 1000;
let TON_ENDPOINT = process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
let TON_API_KEY = process.env.TON_API_KEY || '';
let MNEMONIC = process.env.MNEMONIC?.split(' ') || [];
const TRANSFER_VALUE = toNano('0.05');
let DNS_AUTO_CONTRACT_ADDRESS = process.env.DNS_AUTO_CONTRACT_ADDRESS || undefined;

((isTestNet) => {
    if (!isTestNet) return;

    TON_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    TON_API_KEY = '7fa20692ff1ead714e087ecaf29af370ada00b6c7a2ed42fc5b79c035813c4d3';
    MNEMONIC = [
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'about'
    ];

    DNS_AUTO_CONTRACT_ADDRESS = process.env.DNS_AUTO_CONTRACT_ADDRESS_TESTNET || undefined;
})(true);

// --- Main function ---

const newOwner = process.argv[2];

if (!newOwner) {
    throw new Error('Использование: ts-node scripts/transfer.ts <new_owner_address>');
}

main(newOwner).catch((error) => {
    console.error('Error during terminate:', error);
});

async function main(newOwner: any) {
    if (MNEMONIC.length < 24) {
        throw new Error('Пожалуйста, укажите допустимые 24-слова в MNEMONIC внутри .env файла');
    }

    if (!DNS_AUTO_CONTRACT_ADDRESS) {
        throw new Error('DNS_AUTO_CONTRACT_ADDRESS не найден в .env');
    }

    console.log('🔄 Инициализация клиента TON...');
    const client = new TonClient({
        endpoint: TON_ENDPOINT,
        apiKey: TON_API_KEY,
    });

    console.log('🔑 Загрузка ключей кошелька...');
    const key = await mnemonicToWalletKey(MNEMONIC);
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const walletContract = client.open(wallet);

    console.log('📦 Подготовка контракта...');
    const autoDNS = await AutoDNS.fromAddress(Address.parse(DNS_AUTO_CONTRACT_ADDRESS));

    await delay(RATE_LIMIT_TIME);

    console.log('📤 Отправка транзакции...');
    const seqno = await walletContract.getSeqno();

    await delay(RATE_LIMIT_TIME);

    await walletContract.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: [
            internal({
                to: autoDNS.address,
                value: TRANSFER_VALUE,
                body: beginCell()
                    .storeUint(0x34567890, 32)  // op = transfer
                    .storeAddress(Address.parse(newOwner))
                    .endCell(),
                bounce: true,
            }),
        ],
    });

    console.log('✅ Запрос на обновление отправлен!');
    console.log('⏳ Ожидание подтверждения транзакции...');

    await new Promise(async (resolve, reject) => {
        let currentSeqno = seqno;
        let attempts = 0;
        const maxAttempts = 30; // Максимальное количество попыток

        while (currentSeqno == seqno) {
            try {
                console.log('Ожидание...');

                await delay(RATE_LIMIT_TIME);
                currentSeqno = await walletContract.getSeqno();
            } catch (error) {
                console.error('Ошибка при получении seqno:', error);
                reject(error);
                return;
            }

            attempts++;
            if (attempts >= maxAttempts) {
                console.log('❌ Превышено максимальное количество попыток ожидания подтверждения транзакции');
                reject(new Error('Exceeded maximum attempts to confirm transaction'));
                return;
            }
        }

        resolve(true);
    }).catch((error) => {
        throw error;
    });

    console.log('✅ Транзакция подтверждена');

    console.log('🔍 Проверка владельца...');
    const owner = await autoDNS.getOwner(client.provider(autoDNS.address));
    console.log('Новый владелец:', owner.toString());
}
