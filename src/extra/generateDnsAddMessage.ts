import { beginCell, Cell, toNano } from 'ton-core';

export function generateAddAdnlMessageBody(params: {
    domain: string;           // например "ariorh.ton"
    adnlAddress: string;      // HEX строка длиной 64 символа
    expireAt: number;         // UNIX time
}): Cell {
    const { domain, adnlAddress, expireAt } = params;

    const OP_ADD = 0x72656764; // 'regd'

    // Сериализуем домен: "ariorh.ton" → буфер из TL-B-структуры
    const domainParts = domain.split('.');
    const domainCell = beginCell();
    for (const part of domainParts.reverse()) {
        const bytes = Buffer.from(part, 'utf-8');
        domainCell.storeBuffer(bytes);
        domainCell.storeUint(bytes.length, 8);
    }

    // Сериализуем adnl-адрес
    const adnlCell = beginCell()
        .storeUint(0xad01, 16) // идентификатор adnl
        .storeBuffer(Buffer.from(adnlAddress, 'hex'))
        .storeUint(0, 64) // reserved
        .endCell();

    // Создаём словарь: category → значение
    // Category не должен быть 0, допустим 1
    const category = 1;
    const dict = beginCell()
        .storeUint(category, 256)
        .storeRef(adnlCell)
        .endCell();

    // Делаем основной message body
    const msgBody = beginCell()
        .storeUint(OP_ADD, 32)                          // op
        .storeUint(Date.now() + 1000, 64)               // query_id
        .storeSlice(domainCell.endCell().beginParse())  // домен
        .storeRef(dict)                                 // значения
        .storeUint(expireAt, 32)                        // до какого времени активен
        .endCell();

    return msgBody;
}
