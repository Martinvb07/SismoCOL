/*
 * SismoCol — prototipo de simulación física.
 *
 * Recibe { idSimulacion, magnitud, duracionMs } en sismos/simulacion, responde
 * el ACK { idSimulacion, estado: "RECIBIDA" } en sismos/estado y enciende las
 * señales según la magnitud:
 *   verde siempre · amarillo y vibración si M ≥ 4,0 · rojo y buzzer si M ≥ 6,0
 * Cada 10 s publica un latido en sismos/latido. Si se cae, el broker publica
 * su último deseo (LWT) { conectado: false } y la API lo marca desconectado.
 */
#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>

#include "config.h"
#include "secrets.h"

static const int CANAL_BUZZER = 0;
static const int FRECUENCIA_BUZZER_HZ = 2700;
static const unsigned long PERIODO_PULSO_MS = 250;

WiFiClient red;
PubSubClient mqtt(red);
char idCliente[32];
char latidoDesconexion[96];

struct Senal {
  bool activa = false;
  unsigned long inicio = 0;
  unsigned long duracion = 0;
  bool amarillo = false;
  bool rojo = false;
} senal;

unsigned long ultimoLatido = 0;
unsigned long ultimoIntentoMqtt = 0;

void apagarSenales() {
  digitalWrite(PIN_LED_VERDE, LOW);
  digitalWrite(PIN_LED_AMARILLO, LOW);
  digitalWrite(PIN_LED_ROJO, LOW);
  digitalWrite(PIN_VIBRACION, LOW);
  ledcWriteTone(CANAL_BUZZER, 0);
}

void iniciarSenal(float magnitud, unsigned long duracionMs) {
  senal.activa = true;
  senal.inicio = millis();
  senal.duracion = duracionMs;
  senal.amarillo = magnitud >= UMBRAL_AMARILLO;
  senal.rojo = magnitud >= UMBRAL_ROJO;
  digitalWrite(PIN_LED_VERDE, HIGH);
  digitalWrite(PIN_LED_AMARILLO, senal.amarillo ? HIGH : LOW);
  digitalWrite(PIN_LED_ROJO, senal.rojo ? HIGH : LOW);
}

/** Vibración y buzzer en pulsos, sin bloquear el loop (el MQTT sigue atendiendo). */
void actualizarSenal() {
  if (!senal.activa) return;
  unsigned long transcurrido = millis() - senal.inicio;
  if (transcurrido >= senal.duracion) {
    senal.activa = false;
    apagarSenales();
    return;
  }
  bool fase = (transcurrido / PERIODO_PULSO_MS) % 2 == 0;
  digitalWrite(PIN_VIBRACION, senal.amarillo && fase ? HIGH : LOW);
  ledcWriteTone(CANAL_BUZZER, senal.rojo && fase ? FRECUENCIA_BUZZER_HZ : 0);
}

void publicarLatido() {
  JsonDocument doc;
  doc["topico"] = TOPICO_SIMULACION;
  doc["rssi"] = WiFi.RSSI();
  doc["uptimeS"] = millis() / 1000;
  doc["ip"] = WiFi.localIP().toString();
  char carga[160];
  serializeJson(doc, carga);
  mqtt.publish(TOPICO_LATIDO, carga);
}

void alRecibir(char* topico, byte* carga, unsigned int largo) {
  JsonDocument doc;
  if (deserializeJson(doc, reinterpret_cast<const char*>(carga), largo)) {
    Serial.println("Mensaje inválido (no es JSON)");
    return;
  }
  long idSimulacion = doc["idSimulacion"] | 0L;
  float magnitud = doc["magnitud"] | 0.0f;
  unsigned long duracion = doc["duracionMs"] | (unsigned long)DURACION_POR_DEFECTO_MS;
  if (idSimulacion <= 0 || magnitud <= 0) return;

  // El ACK sale antes de encender las señales: la API espera como máximo 5 s.
  JsonDocument ack;
  ack["idSimulacion"] = idSimulacion;
  ack["estado"] = "RECIBIDA";
  char respuesta[80];
  serializeJson(ack, respuesta);
  mqtt.publish(TOPICO_ESTADO, respuesta);

  Serial.printf("Simulación %ld: M %.1f durante %lu ms\n", idSimulacion, magnitud, duracion);
  iniciarSenal(magnitud, duracion);
}

void conectarWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Conectando a Wi-Fi «%s»", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_CLAVE);
  while (WiFi.status() != WL_CONNECTED) {
    // Verde parpadeando mientras no hay red
    digitalWrite(PIN_LED_VERDE, !digitalRead(PIN_LED_VERDE));
    delay(300);
    Serial.print(".");
  }
  digitalWrite(PIN_LED_VERDE, LOW);
  Serial.printf("\nWi-Fi listo: %s\n", WiFi.localIP().toString().c_str());
}

void conectarMqtt() {
  if (mqtt.connected() || millis() - ultimoIntentoMqtt < REINTENTO_MQTT_MS) return;
  ultimoIntentoMqtt = millis();
  Serial.print("Conectando a MQTT… ");
  bool ok = mqtt.connect(idCliente, MQTT_USUARIO, MQTT_CLAVE, TOPICO_LATIDO, 1, false, latidoDesconexion);
  if (!ok) {
    Serial.printf("falló (estado %d), reintento en %d s\n", mqtt.state(), REINTENTO_MQTT_MS / 1000);
    return;
  }
  Serial.println("listo");
  mqtt.subscribe(TOPICO_SIMULACION, 1);
  publicarLatido();
  ultimoLatido = millis();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_AMARILLO, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);
  pinMode(PIN_VIBRACION, OUTPUT);
  ledcSetup(CANAL_BUZZER, FRECUENCIA_BUZZER_HZ, 8);
  ledcAttachPin(PIN_BUZZER, CANAL_BUZZER);
  apagarSenales();

  snprintf(idCliente, sizeof(idCliente), "sismocol-esp32-%06llx", (unsigned long long)(ESP.getEfuseMac() & 0xFFFFFF));
  snprintf(latidoDesconexion, sizeof(latidoDesconexion), "{\"topico\":\"%s\",\"conectado\":false}", TOPICO_SIMULACION);

  conectarWifi();
  mqtt.setServer(MQTT_HOST, MQTT_PUERTO);
  mqtt.setCallback(alRecibir);
  mqtt.setKeepAlive(15);
}

void loop() {
  conectarWifi();
  conectarMqtt();
  mqtt.loop();
  actualizarSenal();
  if (mqtt.connected() && millis() - ultimoLatido >= INTERVALO_LATIDO_MS) {
    publicarLatido();
    ultimoLatido = millis();
  }
}
