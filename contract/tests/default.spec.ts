import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { AutoDNS } from '../build/auto_dns_AutoDNS';
import '@ton-community/test-utils';
import { beginCell } from '@ton/core';

describe('AutoDNS', () => {
    let blockchain: Blockchain;
    let contract: SandboxContract<AutoDNS>;
    let deployer: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        contract = blockchain.openContract(await AutoDNS.fromInit());
        deployer = await blockchain.treasury('deployer', { balance: toNano('10') });

        const deployResult = await contract.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            deploy: true,
            success: true
        });
    });

    it('should set and get DNS record', async () => {
        // Создаем значение для записи с правильным форматом адреса
        const recordValue = beginCell()
            .storeUint(0, 2) // prefix для адреса
            .storeAddress(deployer.address)
            .endCell();

        // Отправляем UpdateRecord
        const updateResult = await contract.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
                bounce: false
            },
            {
                $$type: 'UpdateRecord',
                op: 0x23456789n,
                key: 'test.ton',
                category: 0n,
                value: recordValue
            }
        );

        // Проверяем транзакцию
        expect(updateResult.transactions).toHaveTransaction({
            success: true,
            exitCode: 0
        });

		// Проверяем запись
		const record = await contract.getRecord('test.ton');
		expect(record).not.toBeNull();
		
		// Проверяем формат записи кошелька
		const slice = record!.beginParse();
		expect(slice.preloadUint(16)).toBe(0x9fd3); // dns_smc_address prefix

		// Проверяем резолв несуществующего поддомена - должен вернуть запись родительского домена
		const subdomainRecord = await contract.getRecord('test.test.ton');
		expect(subdomainRecord).not.toBeNull();
		
		// Проверяем формат записи кошелька
		const slice2 = record!.beginParse();
		expect(slice2.preloadUint(16)).toBe(0x9fd3); // dns_smc_address prefix
    });

    it('should return owner', async () => {
        const owner = await contract.getOwner();
        expect(owner.equals(deployer.address)).toBe(true);
    });

    it('should register subdomain', async () => {
        // Создаем новый адрес для владельца поддомена
        const subdomainOwner = await blockchain.treasury('subdomain_owner');
        
        const registerResult = await contract.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
                bounce: false
            },
            {
                $$type: 'RegisterSubdomain',
                op: 0x12345678n,
                subdomain: 'test',
                owner: subdomainOwner.address
            }
        );

        expect(registerResult.transactions).toHaveTransaction({
            success: true,
            exitCode: 0
        });

        // Проверяем что владелец поддомена установлен
        const owner = await contract.getSubdomainOwner('test');
        expect(owner).not.toBeNull();
        expect(owner!.equals(subdomainOwner.address)).toBe(true);
    });

    it('should transfer ownership', async () => {
        // Создаем новый адрес для нового владельца
        const newOwner = await blockchain.treasury('new_owner');
        
        const transferResult = await contract.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
                bounce: false
            },
            {
                $$type: 'TransferOwnership',
                op: 0x34567890n,
                newOwner: newOwner.address
            }
        );

        expect(transferResult.transactions).toHaveTransaction({
            success: true,
            exitCode: 0
        });

        // Проверяем что владелец изменился
        const owner = await contract.getOwner();
        expect(owner.equals(newOwner.address)).toBe(true);

        // Проверяем что старый владелец больше не может управлять контрактом
        const failedTransfer = await contract.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
                bounce: false
            },
            {
                $$type: 'TransferOwnership',
                op: 0x34567890n,
                newOwner: deployer.address
            }
        );

        expect(failedTransfer.transactions).toHaveTransaction({
            success: false
        });
    });

    it('should terminate contract with balance', async () => {
        // Пополняем баланс контракта перед завершением
        await contract.send(
            deployer.getSender(),
            {
                value: toNano('1'),
                bounce: false
            },
            {
                $$type: 'Deploy',
                queryId: 0n
            }
        );

        // Тратим деньги
        await contract.send(
            deployer.getSender(),
            {
                value: toNano('0.5'), // Отправляем 0.5 TON
                bounce: false
            },
            {
                $$type: 'RegisterSubdomain',
                op: 0x12345678n,
                subdomain: 'example',
                owner: deployer.address
            }
        );

        const initialContractBalance = await contract.getBalance();
        const initialBalance = await deployer.getBalance();

        console.log('Баланс контракта перед завершением:', initialContractBalance.toString());
        console.log('Баланс владельца перед завершением:', initialBalance.toString());

        const terminateResult = await contract.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
                bounce: false
            },
            {
                $$type: 'Terminate',
                op: 0x54455220n
            }
        );

        expect(terminateResult.transactions).toHaveTransaction({
            success: true,
            exitCode: 0
        });

        // Проверяем что средства вернулись владельцу
        const finalBalance = await deployer.getBalance();
        // Учитываем комиссию за транзакцию
        expect(finalBalance).toBeLessThan(initialBalance + initialContractBalance);
        expect(finalBalance).toBeGreaterThan(initialBalance);
    });

    it('should fail operations from non-owner', async () => {
        // Создаем другой адрес
        const nonOwner = await blockchain.treasury('non_owner');

        // Пробуем зарегистрировать поддомен
        const registerResult = await contract.send(
            nonOwner.getSender(),
            {
                value: toNano('0.05'),
                bounce: false
            },
            {
                $$type: 'RegisterSubdomain',
                op: 0x12345678n,
                subdomain: 'test',
                owner: nonOwner.address
            }
        );

        expect(registerResult.transactions).toHaveTransaction({
            success: false
        });

        // Пробуем обновить запись
        const recordValue = beginCell()
            .storeUint(0, 2)
            .storeAddress(nonOwner.address)
            .endCell();

        const updateResult = await contract.send(
            nonOwner.getSender(),
            {
                value: toNano('0.05'),
                bounce: false
            },
            {
                $$type: 'UpdateRecord',
                op: 0x23456789n,
                key: 'test.ton',
                category: 2n,
                value: recordValue
            }
        );

        expect(updateResult.transactions).toHaveTransaction({
            success: false
        });
    });
});
