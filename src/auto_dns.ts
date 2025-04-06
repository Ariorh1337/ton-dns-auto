import { Address, beginCell, Cell, Contract, ContractProvider, Sender, toNano, contractAddress } from '@ton/core';

export class AutoDNS implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new AutoDNS(address);
    }

    static createFromConfig(config: { owner: Address; domain: string }, code: Cell, workchain = 0) {
        const data = beginCell()
            .storeAddress(config.owner)
            .storeStringTail(config.domain)
            .storeDict() // subdomains
            .storeDict() // records
            .storeUint(0, 32) // lastUpdate
            .endCell();
        const init = { code, data };
        return new AutoDNS(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: 1,
            body: beginCell().endCell(),
        });
    }

    async sendRegisterSubdomain(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            subdomain: string;
            owner: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x12345678, 32) // op = register
                .storeStringTail(opts.subdomain)
                .storeAddress(opts.owner)
                .endCell(),
        });
    }

    async sendUpdateRecord(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            key: string;
            category: number;
            data: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x23456789, 32) // op = update
                .storeStringTail(opts.key)
                .storeUint(opts.category, 256)
                .storeRef(opts.data)
                .endCell(),
        });
    }

    async sendTransferOwnership(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            newOwner: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: 1,
            body: beginCell()
                .storeUint(0x34567890, 32) // op = transfer
                .storeAddress(opts.newOwner)
                .endCell(),
        });
    }

    async getOwner(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('owner', []);
        return result.stack.readAddress();
    }

    async getRecord(provider: ContractProvider, key: string): Promise<{ category: number; value: Cell } | null> {
        const result = await provider.get('record', [{
            type: 'slice',
            cell: beginCell().storeStringTail(key).endCell()
        }]);
        if (result.stack.readBoolean()) {
            return {
                category: result.stack.readNumber(),
                value: result.stack.readCell()
            };
        }
        return null;
    }

    async getSubdomainOwner(provider: ContractProvider, subdomain: string): Promise<Address | null> {
        const result = await provider.get('subdomainOwner', [{
            type: 'slice',
            cell: beginCell().storeStringTail(subdomain).endCell()
        }]);
        if (result.stack.readBoolean()) {
            return result.stack.readAddress();
        }
        return null;
    }
} 