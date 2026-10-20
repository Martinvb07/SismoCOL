// Pines y tópicos. Deben coincidir con Backend/.env (MQTT_TOPIC_*).
#pragma once

// L298N de la maqueta
#define PIN_ENA 25  // PWM del motor vibrador
#define PIN_IN1 26
#define PIN_IN2 27
#define PIN_ENB 33  // PWM del motorreductor (movimiento ida y vuelta)
#define PIN_IN3 18
#define PIN_IN4 19

// Señales opcionales (si no están conectadas no pasa nada)
#define PIN_LED_VERDE 21
#define PIN_LED_AMARILLO 22
#define PIN_LED_ROJO 23
#define PIN_BUZZER 12  // buzzer pasivo

#define TOPICO_SIMULACION "sismos/simulacion"
#define TOPICO_ESTADO "sismos/estado"
#define TOPICO_LATIDO "sismos/latido"

// Mismas reglas que el frontend (docs/api-contrato.md, "Simulación y ESP32").
#define UMBRAL_AMARILLO 4.0f
#define UMBRAL_ROJO 6.0f
#define DURACION_POR_DEFECTO_MS 5000

// Maqueta: M < 6 solo vibrador; M ≥ 6 solo movimiento lineal.
// La web manda magnitudes de 2,0 a 8,0; M 8 es el movimiento más fuerte.
#define UMBRAL_LINEAL 6.0f
#define MAG_MINIMA 2.0f
#define MAG_MAXIMA 8.0f
#define PWM_VIBRADOR_MIN 90   // M 2
#define PWM_VIBRADOR_MAX 145  // M 5 en adelante
#define PWM_LINEAL_MIN 90     // M 6
#define PWM_LINEAL_MAX 150    // M 8
#define GIRO_MS_MIN_MAG 700   // duración de cada ida o vuelta en M 6
#define GIRO_MS_MAX_MAG 180   // … y en M 8
#define PAUSA_MS_MIN_MAG 180  // pausa al cambiar de sentido en M 6
#define PAUSA_MS_MAX_MAG 30   // … y en M 8

#define INTERVALO_LATIDO_MS 10000
#define REINTENTO_MQTT_MS 5000
