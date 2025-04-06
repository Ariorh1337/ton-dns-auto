import { TonClient, Address } from '@ton/ton';
import { AutoDNS } from './auto_dns';
import * as dotenv from 'dotenv';
import { delay } from './extra/delay';

dotenv.config();

async function main() {
    if (!process.env.DNS_AUTO_CONTRACT_ADDRESS) {
        throw new Error('DNS_AUTO_CONTRACT_ADDRESS не найден в .env');
    }

    const key = process.argv[2];
    const subdomain = process.argv[3];

    console.log('🔄 Инициализация клиента TON...');
    const client = new TonClient({
        endpoint: process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: process.env.TON_API_KEY
    });

    console.log('📦 Подготовка контракта...');
    const autoDNS = AutoDNS.createFromAddress(Address.parse(process.env.DNS_AUTO_CONTRACT_ADDRESS));

    console.log('🔍 Получение информации...');
    
    // Получаем владельца контракта
    const owner = await autoDNS.getOwner(client.provider(autoDNS.address));
    console.log('Владелец контракта:', owner.toString());

    // Если нет API ключа, добавляем задержку
    if (!process.env.TON_API_KEY) {
        await delay(10000);
    }

    // Если указан ключ, получаем запись
    if (key) {
        const record = await autoDNS.getRecord(client.provider(autoDNS.address), key);
        console.log('Запись:', record ? {
            category: record.category,
            value: record.value.toString()
        } : 'не найдена');

        // Если нет API ключа, добавляем задержку
        if (!process.env.TON_API_KEY) {
            await delay(10000);
        }
    }

    // Если указан поддомен, получаем его владельца
    if (subdomain) {
        const subdomainOwner = await autoDNS.getSubdomainOwner(client.provider(autoDNS.address), subdomain);
        console.log('Владелец поддомена:', subdomainOwner?.toString() || 'не найден');
    }
}

main().catch(e => console.error('❌ Ошибка:', e)); 