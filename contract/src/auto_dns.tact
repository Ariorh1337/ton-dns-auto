import "@stdlib/deploy";
import "@stdlib/ownable";

// Структура для DNS записи
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
    op: Int as uint32 = 0x54455220;  // "TER " в hex
}

// Основной контракт
contract AutoDNS with Deployable, Ownable {
    owner: Address;
    domain: String;
    subdomains: map<Int, Address>;
    records: map<Int, DNSRecord>;
    lastUpdate: Int as uint32;

    // Инициализация контракта
    init(owner: Address, domain: String) {
        self.owner = owner;
        self.domain = domain;
        self.subdomains = emptyMap();
        self.records = emptyMap();
        self.lastUpdate = now();
    }

    // Регистрация поддомена
    receive(msg: RegisterSubdomain) {
        require(context().sender == self.owner, "Only owner can register subdomains");
        
        let subdomainHash: Int = sha256(msg.subdomain);
        let existingOwner: Address? = self.subdomains.get(subdomainHash);
        require(existingOwner == null, "Subdomain already exists");
        
        self.subdomains.set(subdomainHash, msg.owner);
        self.lastUpdate = now();
    }

    // Обновление DNS записи
    receive(msg: UpdateRecord) {
        require(context().sender == self.owner, "Only owner can update records");
        
        let keyHash: Int = sha256(msg.key);
        self.records.set(keyHash, DNSRecord{category: msg.category, value: msg.value});
        self.lastUpdate = now();
    }

    // Получение DNS записи
    fun record(domain: String): DNSRecord? {
        let domainHash = sha256(domain);
        let dnsRecord: DNSRecord? = self.records.get(domainHash);
        
        if (dnsRecord == null) {
            // Ищем первую точку в домене
            let firstDotIndex = -1;
            let i = 0;
            let slice = domain.asSlice();
            let bits = slice.bits();
            
            // Ищем первую точку
            while (i * 8 < bits && firstDotIndex == -1) {
                if (slice.loadUint(8) == 46) { // ASCII код точки
                    firstDotIndex = i;
                }
                i = i + 1;
            }
            
            if (firstDotIndex >= 0) {
                // Пропускаем символы до точки
                slice = domain.asSlice();
                i = 0;
                while (i <= firstDotIndex) {
                    slice.loadUint(8);
                    i = i + 1;
                }
                
                // Оставшаяся часть строки - это родительский домен
                let parentDomain = slice.asString();
                
                // Если родительский домен совпадает с нашим верхнеуровневым доменом,
                // возвращаем запись для него
                if (parentDomain == self.domain) {
                    dnsRecord = self.records.get(sha256(self.domain));
                }
                
                // Иначе продолжаем рекурсивный поиск
                if (dnsRecord == null) {
                    dnsRecord = self.record(parentDomain);
                }
            }
        }
        
        return dnsRecord;
    }

    // Получение владельца поддомена
    get fun subdomainOwner(subdomain: String): Address? {
        let subdomainHash: Int = sha256(subdomain);
        return self.subdomains.get(subdomainHash);
    }

    // Передача владения
    receive(msg: TransferOwnership) {
        require(context().sender == self.owner, "Only owner can transfer ownership");
        self.owner = msg.newOwner;
        self.lastUpdate = now();
    }

    // Закрытие контракта и возврат средств владельцу
    receive(msg: Terminate) {
        require(context().sender == self.owner, "Only owner can terminate contract");
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue + SendIgnoreErrors
        });
    }
} 