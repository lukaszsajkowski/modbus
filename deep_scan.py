#!/usr/bin/env python3
"""
Głębsze skanowanie Modbus RTU - szukamy urządzeń na różnych adresach slave
i próbujemy różnych typów rejestrów.
"""

from pymodbus.client import ModbusSerialClient

PORT = "/dev/cu.usbserial-B000Z3G6"

SLAVE_IDS = list(range(1, 11))

CONFIGS = [
    {"baudrate": 9600,  "parity": "E", "stopbits": 1},
    {"baudrate": 9600,  "parity": "N", "stopbits": 2},
    {"baudrate": 9600,  "parity": "N", "stopbits": 1},
    {"baudrate": 19200, "parity": "E", "stopbits": 1},
    {"baudrate": 19200, "parity": "N", "stopbits": 1},
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
        timeout=0.5,
        retries=0,
    )

    if not client.connect():
        print("  Nie mozna otworzyc portu")
        continue

    found = False
    for slave_id in SLAVE_IDS:
        for read_fn, name in [
            (client.read_holding_registers, "HOLDING"),
            (client.read_input_registers, "INPUT"),
        ]:
            try:
                result = read_fn(address=0, count=1, slave=slave_id)
                if not result.isError():
                    print(f"  >>> {name} slave {slave_id}: reg[0] = {result.registers[0]}")
                    found = True
            except Exception:
                pass

        try:
            result = client.read_coils(address=0, count=1, slave=slave_id)
            if not result.isError():
                print(f"  >>> COIL slave {slave_id}: bit[0] = {result.bits[0]}")
                found = True
        except Exception:
            pass

    if not found:
        print("  Brak odpowiedzi")

    client.close()

print("\nSkanowanie zakonczone.")
