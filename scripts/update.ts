import { TonClient, WalletContractV4, internal, toNano, Address, fromNano } from '@ton/ton';
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
const UPDATE_VALUE = toNano('0.01');
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

const domain = process.argv[2];
const category = parseInt(process.argv[3]);
const value = process.argv[4];

if (!domain || isNaN(category) || !value) {
    throw new Error('Использование: ts-node update_record.ts <key> <category> <value>');
}

if (!domain || isNaN(category) || !value.trim()) {
    throw new Error('Некорректные входные данные. Использование: ts-node update_record.ts <key> <category> <value>');
}

main(domain, category, value).catch((error) => {
    console.error('Error during update:', error);
});

async function main(domain:string, category: number, value: any) {
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

    const balance = await walletContract.getBalance();
    console.log('Wallet address:', wallet.address.toString());
    console.log('Wallet balance:', fromNano(balance), 'TON');

    if (balance < UPDATE_VALUE) {
        throw new Error('🔴 Недостаточно средств на кошельке для обновления записи');
    }

    console.log('📦 Подготовка контракта...');
    const autoDNS = await AutoDNS.fromAddress(Address.parse(DNS_AUTO_CONTRACT_ADDRESS));

    await delay(RATE_LIMIT_TIME);

    console.log('📤 Отправка транзакции...');
    const seqno = await walletContract.getSeqno();

    await delay(RATE_LIMIT_TIME);

    const recordValue = (() => {
        if ([0, 1, 4].includes(category)) {
            return beginCell()
                .storeUint(0, 2) // prefix для адреса
                .storeAddress(Address.parseFriendly(value).address)
                .endCell();
        }

        return beginCell()
            .storeStringTail(value)
            .endCell();
    })();

    console.log('Запись:', recordValue ? {
        key: domain,
        category: category,
        value: recordValue.toString()
    } : 'не найдена');

    const contract = client.open(autoDNS);

    await contract.send(
        walletContract.sender(Buffer.from(key.secretKey)),
        {
            value: toNano('0.05'),
            bounce: false
        },
        {
            $$type: 'UpdateRecord',
            op: 0x23456789n,
            key: domain,
            category: 2n,
            value: recordValue
        }
    );

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
    console.log('🔍 Проверка записи...');

	const record = await contract.getRecord(domain);

    console.log('Запись:', record || 'не найдена');
}
