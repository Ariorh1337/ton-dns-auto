/*
* This script deploys the AutoDNS contract to the TON blockchain using a wallet mnemonic.
* It requires the following variables:
* - RATE_LIMIT_TIME: The time to wait between requests to avoid rate limits (default: 1000ms)
* - TON_ENDPOINT: The endpoint for the TON blockchain (default: https://toncenter.com/api/v2/jsonRPC)
* - TON_API_KEY: The API key for Toncenter (default: empty string)
* - MNEMONIC: The 24-word mnemonic for the wallet (default: empty array)
* - DEPLOY_VALUE: The amount to send for deployment (default: 0.05 TON)
*/

import { TonClient, WalletContractV4, fromNano, toNano } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { AutoDNS } from '../contract/build/auto_dns_AutoDNS';
import { beginCell } from '@ton/core';
import { delay } from './extra/delay';
import saveToEnv from './extra/save_to_env';
import dotenv from 'dotenv';

dotenv.config();

// --- Constants ---
const RATE_LIMIT_TIME = 1000;
let TON_ENDPOINT = process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
let TON_API_KEY = process.env.TON_API_KEY || '';
let MNEMONIC = process.env.MNEMONIC?.split(' ') || [];
const DEPLOY_VALUE = toNano('0.05');
let DNS_AUTO_CONTRACT_ADDRESS_KEY = "DNS_AUTO_CONTRACT_ADDRESS";

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

    DNS_AUTO_CONTRACT_ADDRESS_KEY = "DNS_AUTO_CONTRACT_ADDRESS_TESTNET";
})(true);

// --- Main function ---
main().catch((error) => {
    console.error('Error during deployment:', error);
});

async function main() {
    if (MNEMONIC.length < 24) {
        throw new Error('Пожалуйста, укажите допустимые 24-слова в MNEMONIC внутри .env файла');
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

    if (balance < DEPLOY_VALUE) {
        throw new Error('Insufficient wallet balance for deploy');
    }

    console.log('📦 Подготовка контракта...');
    const autoDNS = await AutoDNS.fromInit();

    await delay(RATE_LIMIT_TIME);

    console.log('📤 Отправка транзакции...');
    const seqno = await walletContract.getSeqno();

    await delay(RATE_LIMIT_TIME);

    const contract = client.open(autoDNS);

    await contract.send(
        walletContract.sender(Buffer.from(key.secretKey)),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    console.log('✅ Запрос на отправлен!');
    console.log('⏳ Ожидание подтверждения...');

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

    const contractAddress = autoDNS.address.toString();

    console.log('✅ Контракт успешно развернут!');
    console.log('Адрес контракта:', contractAddress);

    saveToEnv(DNS_AUTO_CONTRACT_ADDRESS_KEY, contractAddress);

    console.log('Адрес контракта сохранен в .env файл.');
}
