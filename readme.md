
# Создание контракта

- Можете воспользоваться готовым `./contract/dns-auto-code.cell` но я рекомендую собрать свой

- Что бы собрать свой dns-auto-code.cell из dns-auto-code.fc действуйте по пунктам:

    Обратите внимание что файлы dns-auto-code.fc и stdlib.fc оставлены на случай если они будут удалены из репозитория https://github.com/ton-blockchain/ton.git

1. Перейдите в дирректорию `contract`

```bash
cd contract
```

2. Удалите старый `dns-auto-code.cell`

```bash
rm dns-auto-code.cell
```

3. Сделайте скрипт автоматизации `build_dns_auto.sh` исполняемым

```bash
chmod +x build_dns_auto.sh
```

4. Запустите скрипт (может быть понадобится sudo)

```bash
./build_dns_auto.sh
```

5. Новый `dns-auto-code.cell` вы найдете в папке `contract`


# Деплой контракта

- вам потребуется установить node.js v20.18.1 и npm (npm обычно ставится вместе с node.js)

1. Установите зависимости проекта

```bash
npm install
```

2. Создайте файл .env и добавьте туда mnemonic кошелька с балансом +-0.3 TON:

```
MNEMONIC="ваша 24-словная seed фраза"
```

3. Откройте `./src/deploy_contract.ts` и отредактируйте конфиг значения при необходимости

```bash
nano ./src/deploy_contract.ts
```

4. Запустите скрипт деплоя, по результату в консоли вы увидите `Будущий адрес контракта`

```bash
npm run deploy_contract
```

