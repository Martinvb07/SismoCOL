# Firmware ESP32 — SismoCol

PlatformIO (framework Arduino) con PubSubClient y ArduinoJson. Recibe la magnitud de una simulación enviada desde la web por MQTT y mueve la maqueta durante 5 s.

## Conexiones

| Componente | Pin ESP32 | Nota |
|---|---|---|
| L298N ENA (motor vibrador, PWM) | GPIO 25 | quitar el jumper de ENA |
| L298N IN1 / IN2 | GPIO 26 / 27 | |
| L298N ENB (motorreductor, PWM) | GPIO 33 | quitar el jumper de ENB |
| L298N IN3 / IN4 | GPIO 18 / 19 | |
| LED verde / amarillo / rojo (opcional) | GPIO 21 / 22 / 23 | resistencia de 220 Ω a GND |
| Buzzer pasivo (opcional) | GPIO 12 | el tono lo genera el ESP32 (2,7 kHz) |

Los motores se alimentan con la fuente externa en el L298N, nunca con los 5 V del ESP32, y el GND del L298N va unido al GND del ESP32. Los pines se cambian en `include/config.h`.

## Movimiento de la maqueta

La web manda magnitudes de 2,0 a 8,0. Durante los 5 s de la simulación:

| Magnitud | Motor vibrador | Motorreductor (ida y vuelta) |
|---|---|---|
| 2,0 ≤ M < 6,0 | PWM 90 (M 2) → 145 (M 5 en adelante) | detenido |
| M ≥ 6,0 | detenido | PWM 90 → 150, cada ida o vuelta 700 → 180 ms y pausa 180 → 30 ms (M 6 → M 8) |

Si un motor no arranca con magnitudes bajas, subir `PWM_VIBRADOR_MIN` o `PWM_LINEAL_MIN` en `include/config.h` (el L298N pierde unos 2 V).

Los LEDs y el buzzer, si están, siguen las reglas de la pantalla de simulación: verde siempre, amarillo si M ≥ 4,0, rojo y buzzer en pulsos si M ≥ 6,0. Mientras busca Wi-Fi, el LED verde parpadea.

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
   - `WIFI_SSID` y `WIFI_CLAVE`: una red con internet a la que se conecta el ESP32 (2,4 GHz; sirve el punto de acceso del celular).
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
