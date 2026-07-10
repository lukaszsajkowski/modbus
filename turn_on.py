#!/usr/bin/env python3
"""
Wysyłanie komendy ON do klimakonwektora Daikin EKWHCTRL1 via Modbus RTU.
Próbuje różne konfiguracje baudrate/parity.
"""

from pymodbus.client import ModbusSerialClient

PORT = "/dev/cu.usbserial-B000Z3G6"
SLAVE_ID = 2

CONFIGS = [
    {"baudrate": 9600,  "parity": "E", "stopbits": 1},
    {"baudrate": 9600,  "parity": "N", "stopbits": 2},
    {"baudrate": 9600,  "parity": "N", "stopbits": 1},
    {"baudrate": 19200, "parity": "E", "stopbits": 1},
    {"baudrate": 19200, "parity": "N", "stopbits": 2},
    {"baudrate": 19200, "parity": "N", "stopbits": 1},
    {"baudrate": 4800,  "parity": "E", "stopbits": 1},
    {"baudrate": 4800,  "parity": "N", "stopbits": 1},
]

for cfg in CONFIGS:
    label = f"baud={cfg['baudrate']} parity={cfg['parity']} stop={cfg['stopbits']}"
    print(f"\n=== {label} ===")

    client = ModbusSerialClient(
        port=PORT,
        baudrate=cfg["baudrate"],
        bytesize=8,
        parity=cfg["parity"],
        stopbits=cfg["stopbits"],
        timeout=1,
        retries=1,
    )

    if not client.connect():
        print("  Nie mozna otworzyc portu")
        continue

    # Najpierw spróbuj odczytać cokolwiek
    try:
        result = client.read_holding_registers(address=0, count=1, device_id=SLAVE_ID)
        if not result.isError():
            print(f"  >>> ODCZYT OK! reg[0] = {result.registers[0]}")
            # Skoro mamy połączenie, wyślij ON
            wr = client.write_register(address=0, value=1, device_id=SLAVE_ID)
            if not wr.isError():
                print(f"  >>> ZAPIS ON - OK!")
            else:
                print(f"  Zapis: {wr}")
            client.close()
            print("\nZnaleziono konfigurację!")
            exit(0)
        else:
            print(f"  Brak odpowiedzi")
    except Exception as e:
        print(f"  {e}")

    client.close()

print("\nZadna konfiguracja nie dziala.")
