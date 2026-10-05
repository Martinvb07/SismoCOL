# Firmware ESP32 — SismoCol

PlatformIO (framework Arduino) con PubSubClient y ArduinoJson. Se suscribe a `sismos/simulacion` y responde por `sismos/estado` y `sismos/latido`.

Se construye en la fase 6. Las credenciales de Wi-Fi y del broker van en `include/secrets.h`, que no se versiona; la plantilla es `include/secrets.example.h`.
