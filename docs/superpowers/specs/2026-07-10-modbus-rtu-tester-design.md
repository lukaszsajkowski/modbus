# Modbus RTU Tester — projekt (design spec)

**Data:** 2026-07-10
**Status:** zatwierdzony do implementacji

## 1. Cel i kontekst

Aplikacja desktopowa na macOS do testowania komunikacji z urządzeniami Modbus RTU
przez adapter USB↔RS-485. Uniwersalne narzędzie serwisowe w stylu
[modscan-pro](https://github.com/ThanabordeeN/modscan-pro), rozszerzone o funkcje,
których modscan-pro nie ma: automatyczne wykrywanie parametrów łącza oraz
deklaratywne **profile urządzeń** (gotowe mapy rejestrów).

Kontekst wyjściowy: istniejące skrypty Python/`pymodbus` komunikujące się z
klimakonwektorami Daikin EKWHCTRL1 (slave 21, 22) — potwierdzają działający sprzęt
i realny ból: nieznane z góry parametry transmisji (baudrate/parity/stopbits).

### Zakres funkcjonalny
- **Device Scanning** — skan zakresu adresów slave; dwa tryby (szybki i głęboki).
- **Read/Write** — FC01, FC02, FC03, FC04, FC05, FC06, FC15, FC16.
- **Dashboard Polling** — monitorowanie wielu rejestrów z wielu urządzeń w czasie rzeczywistym.
- **Device Profiles** — deklaratywne mapy rejestrów urządzeń + auto-generowany panel „Test urządzenia".
- **Lista urządzeń** — tabela wykrytych urządzeń ze statusem (topologia graficzna odłożona na później).

### Poza zakresem (na teraz)
- Graficzna wizualizacja topologii RS-485 (uzasadnienie: fizycznej kolejności na
  magistrali nie da się wykryć przez Modbus; zastępujemy ją tabelą urządzeń).
- Modbus TCP (skupiamy się na RTU/serial).

## 2. Stack technologiczny

- **Electron** — proces **main** (Node.js) obsługuje całą komunikację szeregową;
  proces **renderer** (UI) nie dotyka portu bezpośrednio.
- **Backend Modbus:** `modbus-serial` + `serialport` (Node.js).
- **UI:** React + Vite + TypeScript (szablon electron-vite).
- **Persystencja:** `electron-store` (pliki JSON w katalogu userData).
- **Bezpieczeństwo:** brak `nodeIntegration` w rendererze; wąskie, typowane API
  wystawione przez `preload` (`contextBridge`).

## 3. Architektura

### 3.1 Model współbieżności (kluczowe)

Modbus RTU / RS-485 dopuszcza **tylko jedno zapytanie naraz na danym porcie**.
Sercem backendu jest **`ModbusBus` per port z jedną kolejką** — każda operacja
(skan, odczyt, zapis, polling) trafia do wspólnej kolejki i jest wykonywana
sekwencyjnie z odstępem między ramkami (inter-frame delay). Eliminuje to kolizje
ramek — najczęstsze źródło „losowych" błędów w takich narzędziach.

Priorytety w kolejce: akcje użytkownika (ręczny odczyt/zapis) wyprzedzają polling.

### 3.2 Moduły procesu main

| Moduł | Odpowiedzialność | Zależności |
|---|---|---|
| `SerialPortService` | Wykrywanie dostępnych portów USB-serial | serialport |
| `ModbusBus` | Cykl życia połączenia + kolejka serializująca operacje na jednym porcie | modbus-serial |
| `Scanner` | Skan szybki (adresy) i głęboki (sweep parametrów × adresy) | ModbusBus |
| `PollingEngine` | Cykliczny odczyt punktów dashboardu z wielu urządzeń, push do UI | ModbusBus |
| `DataCodec` | Kodowanie/dekodowanie wartości wg typu (int/uint 16/32, float32, word order, skala/offset) | — (czyste funkcje) |
| `DeviceProfiles` | Ładowanie deklaratywnych profili urządzeń (JSON) | — |
| `Store` | Persystencja: profile połączeń, mapy rejestrów, dashboardy, wyniki skanu | electron-store |
| `ipc` | Typowane kanały żądanie/odpowiedź + zdarzenia strumieniowe | — |

`ModbusBus` chowamy za interfejsem, aby `Scanner`, `PollingEngine` i testy mogły
używać atrapy magistrali (bez sprzętu). `DataCodec` to czyste funkcje — pod TDD.

### 3.3 Widoki UI (renderer)

- **Połączenie** — wybór portu, parametry (baud/parity/stopbits/timeout), nazwane profile.
- **Skaner** — tryb szybki/głęboki, postęp, wyniki → tabela urządzeń.
- **Read/Write** — wszystkie FC, tabela rejestrów z interpretacją typów.
- **Test urządzenia** — panel auto-generowany z wybranego profilu (patrz §5).
- **Dashboard** — dodawanie punktów, live grid, interwały.
- **Ustawienia**.

## 4. Skanowanie (dwa tryby)

- **Szybki** — użytkownik ustawia parametry łącza; skaner przechodzi tylko zakres
  adresów slave (klasyczny modscan). Próba lekkiego odczytu (np. FC03 addr 0 count 1)
  na każdym adresie.
- **Głęboki** — gdy parametry nieznane: skaner przechodzi kombinacje
  baudrate × parity × stopbits **oraz** zakres adresów, sam wykrywa działającą
  konfigurację (odpowiednik istniejącego `deep_scan.py`). Wynik: znaleziona
  konfiguracja łącza + lista adresów, które odpowiedziały.

Wyniki skanu zapisywane w `Store` (ostatnio wykryte urządzenia + działające parametry).

## 5. Profile urządzeń i widok „Test urządzenia"

### 5.1 Cel
Deklaratywny opis urządzenia (JSON) pozwalający wygenerować gotowy panel testowy:
żywe, przeskalowane wartości, edytowalne pola R/W z walidacją limitów, dekodowane
rejestry flagowe i szybkie akcje. Rozszerzalne — kolejne urządzenie = kolejny plik JSON.

### 5.2 Schemat profilu (szkic)
```jsonc
{
  "id": "daikin-ekwhctrl1",
  "name": "Daikin EKWHCTRL1 / EKRTCTRL1",
  "serial": { "baud": 9600, "dataBits": 8, "parity": "none", "stopBits": 1 },
  "functions": ["FC03", "FC06"],
  "registers": [
    { "addr": 0, "mnem": "T1", "name": "Temp. powietrza", "access": "R",
      "type": "uint16", "scale": 0.1, "unit": "°C" },
    { "addr": 202, "mnem": "SPL", "name": "Setpoint min", "access": "RW",
      "type": "uint16", "scale": 0.1, "unit": "°C", "min": 5.0, "max": 35.0, "default": 16.0 },
    { "addr": 201, "mnem": "PRG", "name": "Tryb pracy", "access": "RW", "kind": "flags",
      "bits": { "0-2": { "enum": {"0":"Auto","1":"Silent","2":"Night","3":"Max"} },
                "4": "Lock", "7": "Standby" } }
  ]
}
```

### 5.3 Widok „Test urządzenia"
Po wyborze profilu aplikacja:
- proponuje właściwe parametry łącza jednym kliknięciem,
- auto-generuje panel ze wszystkich nazwanych rejestrów (wartości już przeskalowane,
  np. `T1 = 22.4 °C` zamiast `reg000 = 224`),
- pola R/W edytowalne z walidacją limitów (np. `SPL 5.0…SPH`),
- rejestry flagowe rozbite na czytelne przełączniki/etykiety (Standby, Lock, alarmy, tryb PRG),
- szybkie akcje (np. „Standby ON/OFF", „Ustaw setpoint" → reg 231).

### 5.4 Profil EKWHCTRL1 (do zbudowania z manuala N420384A)
Ustalenia z manuala:
- **Parametry łącza wg producenta: `9600 8N1`** (parity = NONE, 1 stop bit).
  Uwaga: wcześniejsze skrypty zakładały `parity=E` — stąd mogły nie łapać.
- Urządzenie implementuje **tylko FC03 (read holding) i FC06 (write single register)**.
- Mnożnik `mlt`: 0.1 dla temperatur, 1 dla reszty; część rejestrów to bitowe flagi.

Rejestry (adres dziesiętny) — mnem / opis / typ / skala / R|RW / limity / std:
- 000 T1 — temp. powietrza — uint16 0.1 °C — R
- 001 T2 — temp. wody H2 — uint16 0.1 °C — R
- 008 SP — setpoint rzeczywisty — uint16 0.1 °C — R
- 009 OUT — status przekaźników — flags — R
- 015 MOT_SET — prędkość silnika (set) — uint16 1 — R (0…1700)
- 104 STAT — flagi statusu — flags — R
- 105 ALR_STAT — flagi alarmów — flags — R
- 200 ADR — adres urządzenia — uint16 1 — RW (1…255, std 1)
- 201 PRG — flaga konfiguracji/tryb — flags — RW (std 0)
- 202 SPL — setpoint min — uint16 0.1 °C — RW (5.0…SPH, std 16.0)
- 203 SPH — setpoint max — uint16 0.1 °C — RW (SPL…35.0, std 28.0)
- 209 E_SAVING — offset obecności/stand-by — uint16 0.1 °K — RW (0…8.5, std 0)
- 210 MVV5 — min prędkość MIN/Night — uint16 1 — RW (400…MVV3-4, std 400)
- 211 MVV4 — uint16 1 — RW (MVV5…MVV2, std 550)
- 212 MVV3 — uint16 1 — RW (MVV5…MVV1, std 680)
- 213 MVV2 — max w AUTO — uint16 1 — RW (MVV4…1500, std 1100)
- 214 MVV1 — max w MAX — uint16 1 — RW (MVV3…1500, std 1500)
- 215 MVVP1 — uint16 1 — RW (MVV1…1700, std 1700)
- 218 LLO — min woda grzanie — uint16 0.1 °C — RW (0.0…100.0, std 30.0)
- 219 LHI — max woda chłodzenie — uint16 0.1 °C — RW (0.0…100.0, std 20.0)
- 221 ACL — częstotliwość serwisu (h) — uint16 1 — RW (0…32000, std 0)
- 222 ACL_TIM — licznik godzin pracy — uint16 1 — RW (0…ACL)
- 230 MVVP3 — uint16 1 — RW (MVV5…MVVP1, std 920)
- 231 SP — setpoint absolutny — uint16 0.1 °C — RW (SPL…SPH / SPL_W…SPH_W, std 20.0)
- 233 Man — sezon auto/ręczny — uint16 1 — RW (0=auto / 3=zima(inv) / 5=lato(est), std 3)
- 234 MVVP2 — uint16 1 — RW (MVV4…1500, std 1220)
- 242 OS1 — offset sondy powietrza T1 — int16 0.1 °K — RW (-12.0…12.0, std 0)
- 243 OS2 — offset sondy wody H2 — int16 0.1 °K — RW (-12.0…12.0, std 0)
- 244 OS3 — offset sondy wody H4 — int16 0.1 °K — RW (-12.0…12.0, std 0)
- 245 SPL_W — WEB setpoint min — uint16 0.1 °C — RW (5.0…SPH_W, std 20.0)
- 246 SPH_W — WEB setpoint max — uint16 0.1 °C — RW (SPL_W…40, std 24.0)
- 247 WEB — flagi WEB — flags — RW (std 0)

Rejestry flagowe (bit → znaczenie):
- **201 PRG:** bity 0-2 = tryb {0 Auto, 1 Silent, 2 Night, 3 Max}; bit 4 = LOCK
  (klawiatura); bit 7 = Stby (standby). Bity 8-15 zarezerwowane — nie zmieniać.
- **009 OUT:** bit0 EV1, bit1 EV2, bit2 CHILLER, bit3 BOILER.
- **104 STAT:** m.in. bit0 Mod.Raff (chłodzenie), bit1 Mod.Risc (grzanie),
  bit3 F.V. H2, bit4 F.V. H4, bit6 B.A., bit8 Antig, bit9 Alrm, bit10 Test,
  bit11 Stby, bit12 Com err, bit13 H2 asnt, bit14 H4 asnt.
- **105 ALR_STAT:** m.in. bit0 Com, bit1 AIR, bit2 H4, bit3 Acq.Dan H4, bit4 H2,
  bit6 H4 n.id, bit7 Hi Res, bit9 Mot, bit10 SW GRL, bit11 Filter, bit12 2 AIR M5.
- **247 WEB:** bit0 Led WEB OFF, bit1 Forced off, bit2 disable rotacji programów,
  bit3 disable stby, bit4 inhibit ekstremów, bit5 restrykcja setpointu,
  bit6 disable wszystkich klawiszy, bit7 bypass 1h, bit8 disable klawisza sezonu.

## 6. Przepływ danych

**Odczyt/zapis (ręczny lub z widoku Test):**
```
Renderer → IPC.invoke('modbus:read', {port, slave, fc, addr, count})
  → ModbusBus.enqueue(op)          // kolejka danego portu
  → modbus-serial: ramka → odpowiedź / timeout
  → DataCodec.decode(raw, type, scale, wordOrder)
  → IPC reply → UI
```

**Polling dashboardu (strumień):**
```
PollingEngine: lista punktów {port, slave, fc, addr, type}
  → co interwał wrzuca odczyty do kolejki ModbusBus (bez kolizji)
  → wynik → IPC.send('poll:update', {pointId, value, ts, quality})
  → Renderer odświeża grid na żywo
```

Jedna kolejka na port obsługuje polling, ręczne odczyty i skan — nigdy dwie ramki
naraz. Polling ma niższy priorytet niż akcja użytkownika.

## 7. Obsługa błędów

- **Timeout / brak odpowiedzi** → urządzenie/punkt `offline`, licznik błędów, retry (domyślnie 1).
- **Wyjątki Modbus** (illegal function/address/value) → czytelny komunikat z kodem,
  kolejka działa dalej.
- **Błąd CRC** → licznik „jakości łącza" per urządzenie (widoczny w tabeli).
- **Odłączenie portu USB** → zdarzenie `close`/`error` z serialport → magistrala
  `disconnected`, baner + reconnect (opcjonalny auto-reconnect).
- **Walidacja zapisu** (profil) → wartość poza limitem blokowana w UI przed wysłaniem.
- Wszystkie operacje zwracają typowany wynik `{ok:false, code, message}` — nigdy nie
  ubijają procesu.

## 8. Testowanie

- **`DataCodec`** — pełne testy jednostkowe (TDD): int/uint 16/32, float32, word swap,
  skala/offset, wartości brzegowe. Przypadki z manuala (`224 → 22.4 °C`).
- **`Scanner`** — testy z atrapą `ModbusBus`: logika sweep parametrów × adresów,
  wykrycie trafionej konfiguracji, przerwanie.
- **`ModbusBus` (kolejka)** — serializacja (brak dwóch ramek naraz), priorytet akcji
  nad pollingiem, obsługa timeoutu.
- **`DeviceProfiles`** — walidacja schematu profilu EKWHCTRL1 (adresy, limity, flagi).
- **Integracja bez sprzętu** — symulator slave Modbus (serwer `modbus-serial` na
  wirtualnej parze portów przez `socat`, lub atrapa na poziomie interfejsu).
- **Manualne/E2E** — realny Daikin przez adapter USB-serial.

## 9. Persystencja (Store)

Zapisywane między sesjami (JSON w userData):
- **Profile połączeń** — port, baud, parity, stopbits, timeout, nazwa.
- **Mapy rejestrów / etykiety** — nazwane rejestry per urządzenie (nadpisania/uzupełnienia profili).
- **Układy dashboardów** — zestawy monitorowanych punktów.
- **Wyniki skanu / lista urządzeń** — ostatnio wykryte urządzenia + działające parametry.

## 10. Zakres MVP i fazowanie

Jeden spec, implementacja w fazach:

1. **Fundament** — Electron + React skeleton, `SerialPortService`, `ModbusBus` z kolejką,
   IPC, `DataCodec` (z testami).
2. **Połączenie + skan** — profile połączeń (zapis), skan szybki i głęboki,
   tabela wykrytych urządzeń (zapis wyników).
3. **Read/Write** — wszystkie FC01–06/15/16, ręczny odczyt/zapis, interpretacja typów
   (16/32-bit signed/unsigned, float32, wybór endianness/word order).
4. **Profile urządzeń + Test urządzenia** — `DeviceProfiles`, profil EKWHCTRL1,
   auto-generowany panel, mapy rejestrów (zapis).
5. **Dashboard + polling** — `PollingEngine`, live grid, układy dashboardów (zapis).

Topologia graficzna — poza MVP (na razie tabela urządzeń z §3.3).
