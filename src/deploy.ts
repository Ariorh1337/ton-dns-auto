import { TonClient, WalletContractV4, fromNano, toNano } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { AutoDNS } from './auto_dns';
import { Cell, beginCell } from '@ton/core';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    // Инициализация клиента
    const client = new TonClient({
        endpoint: process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: process.env.TON_API_KEY
    });

    // Загрузка мнемоники
    const mnemonic = process.env.MNEMONIC?.split(' ') || [];
    if (mnemonic.length === 0) {
        throw new Error('Please provide MNEMONIC in .env file');
    }

    const key = await mnemonicToWalletKey(mnemonic);
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const walletContract = client.open(wallet);
    const balance = await walletContract.getBalance();
    
    console.log('Wallet address:', wallet.address.toString());
    console.log('Balance:', fromNano(balance), 'TON');

    // Загрузка байткода контракта
    const codeBoc = fs.readFileSync(path.resolve(__dirname, '../build/auto_dns.code.boc'));
    const code = Cell.fromBoc(codeBoc)[0];

    // Создание контракта
    const autoDNS = AutoDNS.createFromConfig({
        owner: wallet.address,
        domain: process.env.DOMAIN || 'test.ton'
    }, code);

    // Проверка баланса
    if (balance < toNano('0.5')) {
        throw new Error('Insufficient balance. Need at least 0.5 TON');
    }

    // Деплой контракта
    console.log('Deploying contract...');
    
    const seqno = await walletContract.getSeqno();
    await walletContract.sendTransfer({
        secretKey: key.secretKey,
        seqno: seqno,
        messages: [
            {
                init: autoDNS.init,
                body: beginCell().endCell(),
                info: {
                    type: 'internal',
                    dest: autoDNS.address,
                    value: { coins: toNano('0.1') },
                    bounce: true,
                    ihrDisabled: true,
                    bounced: false,
                    ihrFee: 0n,
                    forwardFee: 0n,
                    createdLt: 0n,
                    createdAt: 0
                }
            }
        ],
    });

    console.log('Waiting for deployment...');
    let currentSeqno = seqno;
    while (currentSeqno == seqno) {
        console.log('waiting...');
        await sleep(1500);
        currentSeqno = await walletContract.getSeqno();
    }

    const contractAddress = autoDNS.address.toString();
    console.log('Contract deployed at:', contractAddress);

    // Сохраняем адрес контракта в .env файл
    const envPath = path.resolve(__dirname, '../.env');
    
    // Проверяем существование .env файла
    if (!fs.existsSync(envPath)) {
        console.log('⚠️ .env file not found. Creating new one...');
        fs.writeFileSync(envPath, '');
    }
    
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Удаляем старый адрес контракта, если он существует
    envContent = envContent.replace(/DNS_AUTO_CONTRACT_ADDRESS=.*\n?/, '');
    
    // Добавляем новый адрес контракта
    envContent += `\nDNS_AUTO_CONTRACT_ADDRESS="${contractAddress}"`;
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Contract address saved to .env file');
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error); 