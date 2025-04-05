import { TonClient, WalletContractV4, internal } from 'ton';
import { toNano } from 'ton-core';
import { mnemonicToWalletKey } from 'ton-crypto';
import { generateAddAdnlMessageBody } from './extra/generateDnsAddMessage';
import * as dotenv from 'dotenv';

dotenv.config();

// === КОНФИГ ===
const MNEMONIC = process.env.MNEMONIC;
const TONCENTER_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';
const STANDARD_PERIOD = 365 * 24 * 60 * 60;                                                 // 1 год в секундах
const DOMAIN_NAME = "ariorh.ton";                                                           // ← вставь свой
const ADNL_ADRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";     // ← вставь свой 
// @ts-ignore
const DNS_CONTRACT_ADRESS = "" || String(process.env.DNS_AUTO_CONTRACT_ADDRESS);            // ← вставь свой или оставь тот что записал deploy_contract
const DNS_CONTRACT_PRICE = toNano('0.1');                                                   // или больше, чтобы хватило на комиссию

async function main() {
    if (!MNEMONIC) {
        throw new Error('MNEMONIC не найден в .env');
    }

    if (!DNS_CONTRACT_ADRESS || DNS_CONTRACT_ADRESS === 'undefined') {
        throw new Error('DNS_CONTRACT_ADRESS не указан и DNS_AUTO_CONTRACT_ADDRESS не найден в .env');
    }

    const client = new TonClient({ endpoint: TONCENTER_ENDPOINT });

    const mnemonics = MNEMONIC.trim().split(' ');
    const key = await mnemonicToWalletKey(mnemonics);

    const wallet = client.open(
        WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 })
    );

    const seqno = await wallet.getSeqno();

    const body = generateAddAdnlMessageBody({
        domain: DOMAIN_NAME,
        adnlAddress: ADNL_ADRESS,
        expireAt: Math.floor(Date.now() / 1000) + STANDARD_PERIOD,
    });

    await wallet.sendTransfer({
        seqno,
        secretKey: key.secretKey,
        messages: [
            internal({
                to: DNS_CONTRACT_ADRESS,
                value: DNS_CONTRACT_PRICE,
                body,
                bounce: true,
            }),
        ],
    });

    console.log('✅ Запрос отправлен!');
}

main();
