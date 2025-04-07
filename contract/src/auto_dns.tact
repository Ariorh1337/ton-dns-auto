import "@stdlib/deploy";
import "@stdlib/ownable";

// ----------------- //

struct DNSRecord {
    category: Int;
    value: Cell;
}

message RegisterSubdomain {
    op: Int as uint32 = 0x12345678;
    subdomain: String;
    owner: Address;
}

message UpdateRecord {
    op: Int as uint32 = 0x23456789;
    key: String;
    category: Int;
    value: Cell;
}

message TransferOwnership {
    op: Int as uint32 = 0x34567890;
    newOwner: Address;
}

message Terminate {
    op: Int as uint32 = 0x54455220;
}

// ----------------- //

fun createSiteRecord(url: String): Cell {
    let urlBuilder: StringBuilder = beginString();
    urlBuilder.append(url);
    
    return beginCell()
        .storeUint(0xad01, 16)  // dns_adnl_address#ad01
        .storeUint(0, 256)      // пустой adnl_addr
        .storeUint(0, 8)        // flags
        .storeBit(true)         // есть список протоколов
        .storeRef(              // proto_list в ref cell
            beginCell()
                .storeBit(true)      // proto_list_next$1
                .storeUint(0x4854, 16) // proto_http#4854
                .storeBit(false)     // proto_list_nil$0
                .endCell()
        )
        .storeRef(urlBuilder.toCell())  // url в ref cell
        .endCell();
}

fun createWalletRecord(addr: Address): Cell {
    return beginCell()
        .storeUint(0x9fd3, 16)  // dns_smc_address#9fd3
        .storeAddress(addr)      // smc_addr:MsgAddressInt
        .storeUint(0, 8)        // flags
        .storeBit(false)            // нет cap_list
        .endCell();
}

fun createContractRecord(addr: Address): Cell {
    return beginCell()
        .storeUint(0x9fd3, 16)  // dns_smc_address#9fd3
        .storeAddress(addr)
        .storeUint(0, 8)
        .storeBit(false)
        .endCell();
}

fun createTextRecord(text: String): Cell {
    let textBuilder: StringBuilder = beginString();
    textBuilder.append(text);
    
    return beginCell()
        .storeUint(0xad01, 16)  // dns_adnl_address#ad01
        .storeUint(0, 256)      // пустой adnl_addr
        .storeUint(0, 8)        // flags
        .storeBit(false)        // нет proto_list
        .storeRef(textBuilder.toCell())  // текст в ref cell
        .endCell();
}

fun validateDNSRecord(category: Int, value: Cell): Bool {
    let slice = value.beginParse();
    
    if (category == 0) { // Смарт-контракт
        return slice.preloadUint(16) == 0x9fd3; // проверяем префикс dns_smc_address
    } else if (category == 1) { // Адрес кошелька
        return slice.preloadUint(16) == 0x9fd3;
    } else if (category == 2) { // Сайт
        return slice.preloadUint(16) == 0xad01;
    } else if (category == 4) { // DNS-сервер
        return slice.preloadUint(16) == 0x9fd3;
    } else if (category >= 3 && category <= 31) { // Остальные категории
        return slice.preloadUint(16) == 0xad01;
    }
    return false;
}

// ----------------- //

contract AutoDNS with Deployable, Ownable {
    owner: Address;
    subdomains: map<Int, Address>;
    records: map<Int, DNSRecord>;
    lastUpdate: Int as uint32;
    stateId: Int;

    init() {
        self.owner = sender();
        self.subdomains = emptyMap();
        self.records = emptyMap();
        self.lastUpdate = now();
        self.stateId = random(0, 0xffffffff);
    }

    get fun balance(): Int {
        return myBalance();
    }

    get fun lastUpdate(): Int {
        return self.lastUpdate;
    }

    get fun record(domain: String): Cell? {
		let result: Cell? = null;

        let domainHash = sha256(domain);
		let dnsRecord: DNSRecord? = self.records.get(domainHash);
		if (dnsRecord != null) {
			let dnsr: DNSRecord = dnsRecord!!;
			result = dnsr.value;
		}

        if (result == null) {
            let slice = domain.asSlice();
            let foundDot = false;
            let len = 0;
            let bits = slice.bits();
            
            // Ищем точку и считаем длину до нее
            while ((bits >= 8) && !foundDot) {
                let char = slice.loadUint(8);

				if (char == 46) { // ASCII код точки
                    foundDot = true;
                } else {
                    len += 1;
                }

                bits -= 8;
            }
            
            if (foundDot) {
                let parentDomain = domain.asSlice();

                repeat(len + 1) {
                    parentDomain.loadUint(8);
                }
                let parentDomainStr = parentDomain.asString();
                
                // Если запись дошла то ton, то вероятно записей нет
                if (parentDomainStr == "ton") {
					return null;
                }

                // Если не нашли запись для родительского домена, продолжаем рекурсивный поиск выше
                if (result == null) {
					result = self.record(parentDomainStr);
                }
            }
        }

        return result;
    }

    get fun subdomainOwner(subdomain: String): Address? {
        let subdomainHash: Int = sha256(subdomain);
        return self.subdomains.get(subdomainHash);
    }

    receive(msg: RegisterSubdomain) {
        self.requireOwner();
        
        let subdomainHash: Int = sha256(msg.subdomain);
        let existingOwner: Address? = self.subdomains.get(subdomainHash);
        require(existingOwner == null, "Subdomain already exists");

        self.subdomains.set(subdomainHash, msg.owner);
        self.lastUpdate = now();
    }

	receive(msg: UpdateRecord) {
		self.requireOwner();
		require(msg.category >= 0 && msg.category <= 31, "Invalid DNS category");
		
		// Преобразуем входящие данные в правильный формат
		let formattedValue: Cell? = null; 
		
		if (msg.category == 2) {
			formattedValue = createSiteRecord(msg.value.beginParse().asString())
		} else if (msg.category == 1) {
			formattedValue = createWalletRecord(msg.value.beginParse().loadAddress())
		} else if (msg.category == 0 || msg.category == 4) {
			formattedValue = createContractRecord(msg.value.beginParse().loadAddress())
		} else {
			formattedValue = createTextRecord(msg.value.beginParse().asString())
		}
		
		let finalValue: Cell = formattedValue!!;

		require(validateDNSRecord(msg.category, finalValue), "Invalid DNS record format");

		let keyHash: Int = sha256(msg.key);
		self.records.set(keyHash, DNSRecord{category: msg.category, value: finalValue});
		self.lastUpdate = now();
	}

    receive(msg: TransferOwnership) {
        self.requireOwner();

        self.owner = msg.newOwner;
        self.lastUpdate = now();
    }

    receive(msg: Terminate) {
        self.requireOwner();

        send(SendParameters{
            to: self.owner,
            value: 0,
            bounce: false,
            mode: SendRemainingBalance,
            body: "Terminate contract".asComment()
        });
    }
} 