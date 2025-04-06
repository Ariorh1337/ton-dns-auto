import { TonClient, WalletContractV4, internal, toNano, Address, beginCell } from '@ton/ton';
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

    const subdomain = process.argv[2];
    const ownerAddress = process.argv[3];

    if (!subdomain || !ownerAddress) {
        throw new Error('Использование: ts-node register_subdomain.ts <subdomain> <owner_address>');
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

    console.log('📤 Отправка транзакции регистрации...');
    await wallet.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: autoDNS.address,
                value: toNano('0.1'),
                body: beginCell()
                    .storeUint(0x12345678, 32)  // op = register
                    .storeStringTail(subdomain)
                    .storeAddress(Address.parse(ownerAddress))
                    .endCell(),
                bounce: true,
            }),
        ],
    });

    console.log('✅ Запрос на регистрацию отправлен!');
    console.log('⏳ Ожидание подтверждения транзакции...');
    await delay(30000);

    // Если нет API ключа, добавляем задержку
    if (!process.env.TON_API_KEY) {
        await delay(10000);
    }

    console.log('🔍 Проверка владельца поддомена...');
    const owner = await autoDNS.getSubdomainOwner(client.provider(autoDNS.address), subdomain);
    console.log('Владелец поддомена:', owner?.toString());
}

main().catch(e => console.error('❌ Ошибка:', e)); 