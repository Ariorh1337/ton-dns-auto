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

    const newOwner = process.argv[2];

    if (!newOwner) {
        throw new Error('Использование: ts-node transfer_ownership.ts <new_owner_address>');
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

    console.log('📤 Отправка транзакции передачи...');
    await wallet.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: autoDNS.address,
                value: toNano('0.1'),
                body: beginCell()
                    .storeUint(0x34567890, 32)  // op = transfer
                    .storeAddress(Address.parse(newOwner))
                    .endCell(),
                bounce: true,
            }),
        ],
    });

    console.log('✅ Запрос на передачу отправлен!');
    console.log('⏳ Ожидание подтверждения транзакции...');
    await delay(30000);

    // Если нет API ключа, добавляем задержку
    if (!process.env.TON_API_KEY) {
        await delay(10000);
    }

    console.log('🔍 Проверка владельца...');
    const owner = await autoDNS.getOwner(client.provider(autoDNS.address));
    console.log('Новый владелец:', owner.toString());
}

main().catch(e => console.error('❌ Ошибка:', e)); 