# Firmware ESP32 — SismoCol

PlatformIO (framework Arduino) con PubSubClient y ArduinoJson. Recibe la magnitud de una simulación por MQTT y la traduce a luz, vibración y sonido durante 5 s.

## Conexiones

| Componente | Pin ESP32 | Nota |
|---|---|---|
| LED verde | GPIO 25 | resistencia de 220 Ω a GND |
| LED amarillo | GPIO 26 | resistencia de 220 Ω a GND |
| LED rojo | GPIO 27 | resistencia de 220 Ω a GND |
| Motor de vibración | GPIO 14 | con transistor NPN (2N2222) + diodo 1N4007 en paralelo con el motor; no conectarlo directo al pin |
| Buzzer pasivo | GPIO 12 | el tono lo genera el ESP32 (2,7 kHz) |

Los pines se cambian en `include/config.h`.

## Señales

Son las mismas reglas que en la pantalla de simulación:

| Magnitud | Verde | Amarillo | Rojo | Vibración | Buzzer |
|---|---|---|---|---|---|
| M < 4,0 | ✔ | | | | |
| 4,0 ≤ M < 6,0 | ✔ | ✔ | | pulsos | |
| M ≥ 6,0 | ✔ | ✔ | ✔ | pulsos | pulsos |

Mientras busca Wi-Fi, el LED verde parpadea.

## Protocolo MQTT

| Tópico | Dirección | Mensaje |
|---|---|---|
| `sismos/simulacion` | API → ESP32 | `{"idSimulacion": 12, "magnitud": 6.4, "duracionMs": 5000}` |
| `sismos/estado` | ESP32 → API | `{"idSimulacion": 12, "estado": "RECIBIDA"}` (ACK; la API espera hasta 5 s) |
| `sismos/latido` | ESP32 → API | `{"topico": "sismos/simulacion", "rssi": -61, "uptimeS": 340, "ip": "…"}` cada 10 s |
| `sismos/latido` (LWT) | broker → API | `{"topico": "sismos/simulacion", "conectado": false}` si el ESP32 se cae |

La API marca el dispositivo **en línea** con cada latido y **desconectado** con el LWT o si pasan 30 s sin latido. Una simulación queda **ENVIADA** si llega el ACK y **FALLIDA** si no.

## Compilar y cargar

1. Instalar [PlatformIO](https://platformio.org/install), en VS Code o por consola (`pip install platformio`).
2. Copiar `include/secrets.example.h` como `include/secrets.h`, que no se versiona, y completar:
   - `WIFI_SSID` y `WIFI_CLAVE`: la red a la que se conecta el ESP32 (2,4 GHz).
   - `MQTT_HOST`: `sismocol.trabajosucc.site` o la IP del VPS.
   - `MQTT_USUARIO` y `MQTT_CLAVE`: el usuario `sismocol-esp32` creado en Mosquitto (ver `docs/despliegue-vps.md`).
3. Conectar el ESP32 por USB y ejecutar:
   ```bash
   cd Firmware/esp32
   pio run -t upload
   pio device monitor        # 115200 baudios: muestra la conexión y cada simulación
   ```

## Probar sin el ESP32

Desde el VPS, con el usuario del ESP32:

```bash
# Simula al ESP32 respondiendo el ACK de la simulación 1
mosquitto_pub -h localhost -u sismocol-esp32 -P '<clave>' -t sismos/estado -m '{"idSimulacion":1,"estado":"RECIBIDA"}'
# Latido: el dispositivo aparece en línea por 30 s
mosquitto_pub -h localhost -u sismocol-esp32 -P '<clave>' -t sismos/latido -m '{"topico":"sismos/simulacion"}'
```
