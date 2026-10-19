// Pines y tópicos. Deben coincidir con Backend/.env (MQTT_TOPIC_*).
#pragma once

#define PIN_LED_VERDE 25
#define PIN_LED_AMARILLO 26
#define PIN_LED_ROJO 27
#define PIN_VIBRACION 14  // motor por transistor (NPN + diodo)
#define PIN_BUZZER 12     // buzzer pasivo

#define TOPICO_SIMULACION "sismos/simulacion"
#define TOPICO_ESTADO "sismos/estado"
#define TOPICO_LATIDO "sismos/latido"

// Mismas reglas que el frontend (docs/api-contrato.md, "Simulación y ESP32").
#define UMBRAL_AMARILLO 4.0f
#define UMBRAL_ROJO 6.0f
#define DURACION_POR_DEFECTO_MS 5000

#define INTERVALO_LATIDO_MS 10000
#define REINTENTO_MQTT_MS 5000
