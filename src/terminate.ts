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

    console.log('📝 Отправка транзакции...');
    await wallet.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno: seqno,
        messages: [
            internal({
                to: autoDNS.address,
                value: toNano('0.05'),
                body: beginCell()
                    .storeUint(0x54455220, 32) // op = "TER "
                    .endCell(),
                bounce: false
            })
        ]
    });

    console.log('✅ Транзакция отправлена');
    console.log('⏳ Ожидание подтверждения...');
    await delay(15000);
    const newSeqno = await wallet.getSeqno();
    if (newSeqno > seqno) {
        console.log('✅ Транзакция подтверждена');
    } else {
        console.log('❌ Транзакция не подтверждена');
    }
}

main()
    .then(() => {
        console.log('Готово');
        process.exit(0);
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    }); 