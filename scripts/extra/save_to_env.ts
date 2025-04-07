import fs from 'fs';
import path from 'path';

const ENV_FILE_PATH = path.resolve(__dirname, '../../.env');

export default function saveToEnv(key: string, value: string) {
    // Проверяем, существует ли файл .env
    if (!fs.existsSync(ENV_FILE_PATH)) {
        console.log('⚠️ .env file not found. Creating new one...');
        fs.writeFileSync(ENV_FILE_PATH, '');
    }

    // Читаем содержимое .env файла
    let envContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');

    // Проверяем, существует ли ключ
    const keyRegex = new RegExp(`^${key}=.*`, 'm');
    if (keyRegex.test(envContent)) {
        // Если ключ существует, заменяем его значение
        envContent = envContent.replace(keyRegex, `${key}="${value}"`);
    } else {
        // Если ключ не существует, добавляем его в конец файла
        envContent += `\n${key}="${value}"`;
    }

    // Записываем обновленное содержимое обратно в .env файл
    fs.writeFileSync(ENV_FILE_PATH, envContent);

    console.log(`✅ ${key} saved to .env file`);
}