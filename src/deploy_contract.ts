import { TonClient, WalletContractV4, internal, contractAddress, beginCell, toNano, Cell, StateInit, Address } from 'ton';
import { mnemonicToWalletKey } from 'ton-crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// === КОНФИГ ===
const MNEMONIC = process.env.MNEMONIC;
const DNS_AUTO_CODE_PATH = path.join(__dirname, '../contract/dns-auto-code.cell');
const TONCENTER_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';
const VALUE_TO_SEND = toNano('0.2');                // С запасом
const REGISTRATION_PRICE = toNano('0.05');          // Цена регистрации поддомена
const STANDARD_PERIOD = 365 * 24 * 60 * 60;         // 1 год в секундах
const PRICE_PER_CELL = toNano('0.001');             // Стандартная цена за cell
const PRICE_PER_BIT = toNano('0.0001');             // Стандартная цена за бит
const NEXT_HOUSEKEEPING = 0;
const LAST_HOUSEKEEPING = 0;

async function main() {
    if (!MNEMONIC) {
        throw new Error('MNEMONIC не найден в .env');
    }

    const client = new TonClient({ endpoint: TONCENTER_ENDPOINT });

    const mnemonics = MNEMONIC.trim().split(' ');
    const key = await mnemonicToWalletKey(mnemonics);

    const wallet = client.open(
        WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 })
    );

    const codeCell = Cell.fromBoc(fs.readFileSync(DNS_AUTO_CODE_PATH))[0];

    const dataCell = beginCell()
        .storeRef(beginCell().endCell())            // control data (ctl)
        .storeRef(beginCell().endCell())            // domains dict (dd)
        .storeRef(beginCell().endCell())            // expiration dict (gc)
        .storeUint(STANDARD_PERIOD, 30)
        .storeCoins(REGISTRATION_PRICE)
        .storeCoins(PRICE_PER_CELL)
        .storeCoins(PRICE_PER_BIT)
        .storeUint(NEXT_HOUSEKEEPING, 32)
        .storeUint(LAST_HOUSEKEEPING, 32)
        .endCell();

    const init: StateInit = {
        code: codeCell,
        data: dataCell
    };

    const address = contractAddress(0, init);
    const futureAddress = Address.normalize(address).toString();

    console.log('Будущий адрес контракта:', futureAddress);

    const seqno = await wallet.getSeqno();

    await wallet.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: [
            internal({
                to: address,
                value: VALUE_TO_SEND,
                bounce: false,
                init,
            }),
        ],
    });

    console.log('Deploy отправлен. Жди появления контракта по адресу выше.');

    // Сохраняем адрес в .env
    const ENV_PATH = '.env';
    const ENV_KEY = 'DNS_AUTO_CONTRACT_ADDRESS';

    let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
    const newLine = `${ENV_KEY}=${futureAddress}`;

    if (envContent.includes(`${ENV_KEY}=`)) {
        envContent = envContent.replace(new RegExp(`${ENV_KEY}=.*`, 'g'), newLine);
    } else {
        envContent += (envContent.endsWith('\n') ? '' : '\n') + newLine + '\n';
    }

    fs.writeFileSync(ENV_PATH, envContent);
    console.log(`📦 Контрактный адрес сохранён в .env как ${ENV_KEY}`);
}

main().catch(e => console.error('Ошибка:', e));
