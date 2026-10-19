// Copiar como include/secrets.h (no se versiona) y completar.
#pragma once

#define WIFI_SSID "nombre-de-la-red"
#define WIFI_CLAVE "clave-de-la-red"

// Broker Mosquitto del VPS (ver docs/despliegue-vps.md, sección MQTT).
#define MQTT_HOST "sismocol.trabajosucc.site"
#define MQTT_PUERTO 1883
#define MQTT_USUARIO "sismocol-esp32"
#define MQTT_CLAVE "clave-del-usuario-esp32"
