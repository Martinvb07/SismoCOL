/*
 * SismoCol — maqueta sísmica (ESP32 + L298N).
 *
 * Recibe { idSimulacion, magnitud, duracionMs } en sismos/simulacion, responde
 * el ACK { idSimulacion, estado: "RECIBIDA" } en sismos/estado y mueve la
 * maqueta durante duracionMs:
 *   M < 6 · motor vibrador, más fuerte cuanto mayor la magnitud
 *   M ≥ 6 · motorreductor de ida y vuelta, más rápido cuanto mayor la magnitud
 * Los LEDs y el buzzer son opcionales: verde siempre · amarillo si M ≥ 4,0 ·
 * rojo y buzzer si M ≥ 6,0.
 * Además crea su propia red (SISMO_ESP32) con un panel en http://192.168.4.1
 * para lanzar sismos sin internet; el panel también muestra los que llegan de la web.
 * Cada 10 s publica un latido en sismos/latido. Si se cae, el broker publica
 * su último deseo (LWT) { conectado: false } y la API lo marca desconectado.
 */
#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WebServer.h>
#include <WiFi.h>

#include "secrets.h"  // antes que config.h, que usa AP_SSID/AP_CLAVE si están
#include "config.h"
#include "panel.h"

// Canales LEDC en temporizadores distintos: el buzzer cambia de frecuencia y los motores no.
static const int CANAL_BUZZER = 0;
static const int CANAL_VIBRADOR = 2;
static const int CANAL_LINEAL = 4;
static const int FRECUENCIA_BUZZER_HZ = 2700;
static const int FRECUENCIA_MOTORES_HZ = 1000;
static const unsigned long PERIODO_PULSO_MS = 250;

WiFiClient red;
PubSubClient mqtt(red);
WebServer servidor(80);
char idCliente[32];
char latidoDesconexion[96];

enum Fase { AVANCE, PAUSA_AVANCE, RETROCESO, PAUSA_RETROCESO };

struct Senal {
  bool activa = false;
  float magnitud = 0;
  const char* origen = "-";
  unsigned long inicio = 0;
  unsigned long duracion = 0;
  bool amarillo = false;
  bool rojo = false;
  bool lineal = false;
  int pwmLineal = 0;
  unsigned long giroMs = 0;
  unsigned long pausaMs = 0;
  Fase fase = AVANCE;
  unsigned long inicioFase = 0;
} senal;

unsigned long ultimoLatido = 0;
unsigned long ultimoIntentoMqtt = 0;
unsigned long ultimoIntentoWifi = 0;
bool wifiConectado = false;

/** Interpola v de [a, b] a [desde, hasta], recortando fuera del rango. */
float interpolar(float v, float a, float b, float desde, float hasta) {
  float t = constrain((v - a) / (b - a), 0.0f, 1.0f);
  return desde + t * (hasta - desde);
}

void motorVibrador(int pwm) {
  digitalWrite(PIN_IN1, pwm > 0 ? HIGH : LOW);
  digitalWrite(PIN_IN2, LOW);
  ledcWrite(CANAL_VIBRADOR, pwm);
}

/** sentido: 1 adelante, -1 atrás, 0 detenido. */
void motorLineal(int sentido, int pwm) {
  digitalWrite(PIN_IN3, sentido > 0 ? HIGH : LOW);
  digitalWrite(PIN_IN4, sentido < 0 ? HIGH : LOW);
  ledcWrite(CANAL_LINEAL, sentido == 0 ? 0 : pwm);
}

void apagarSenales() {
  digitalWrite(PIN_LED_VERDE, LOW);
  digitalWrite(PIN_LED_AMARILLO, LOW);
  digitalWrite(PIN_LED_ROJO, LOW);
  ledcWriteTone(CANAL_BUZZER, 0);
  motorVibrador(0);
  motorLineal(0, 0);
}

void iniciarSenal(float magnitud, unsigned long duracionMs, const char* origen) {
  apagarSenales();
  senal.activa = true;
  senal.magnitud = magnitud;
  senal.origen = origen;
  senal.inicio = millis();
  senal.duracion = duracionMs;
  senal.amarillo = magnitud >= UMBRAL_AMARILLO;
  senal.rojo = magnitud >= UMBRAL_ROJO;
  senal.lineal = magnitud >= UMBRAL_LINEAL;
  digitalWrite(PIN_LED_VERDE, HIGH);
  digitalWrite(PIN_LED_AMARILLO, senal.amarillo ? HIGH : LOW);
  digitalWrite(PIN_LED_ROJO, senal.rojo ? HIGH : LOW);

  if (senal.lineal) {
    senal.pwmLineal = interpolar(magnitud, UMBRAL_LINEAL, MAG_MAXIMA, PWM_LINEAL_MIN, PWM_LINEAL_MAX);
    senal.giroMs = interpolar(magnitud, UMBRAL_LINEAL, MAG_MAXIMA, GIRO_MS_MIN_MAG, GIRO_MS_MAX_MAG);
    senal.pausaMs = interpolar(magnitud, UMBRAL_LINEAL, MAG_MAXIMA, PAUSA_MS_MIN_MAG, PAUSA_MS_MAX_MAG);
    senal.fase = AVANCE;
    senal.inicioFase = millis();
    motorLineal(1, senal.pwmLineal);
    Serial.printf("Movimiento lineal: PWM %d, giro %lu ms, pausa %lu ms\n", senal.pwmLineal, senal.giroMs,
                  senal.pausaMs);
  } else {
    int pwm = interpolar(magnitud, MAG_MINIMA, 5.0f, PWM_VIBRADOR_MIN, PWM_VIBRADOR_MAX);
    motorVibrador(pwm);
    Serial.printf("Vibrador: PWM %d\n", pwm);
  }
}

/** Ida y vuelta del motorreductor, sin bloquear el loop. */
void actualizarMovimiento(unsigned long ahora) {
  unsigned long enFase = ahora - senal.inicioFase;
  switch (senal.fase) {
    case AVANCE:
    case RETROCESO:
      if (enFase < senal.giroMs) return;
      motorLineal(0, 0);
      senal.fase = senal.fase == AVANCE ? PAUSA_AVANCE : PAUSA_RETROCESO;
      break;
    case PAUSA_AVANCE:
    case PAUSA_RETROCESO: {
      if (enFase < senal.pausaMs) return;
      bool atras = senal.fase == PAUSA_AVANCE;
      motorLineal(atras ? -1 : 1, senal.pwmLineal);
      senal.fase = atras ? RETROCESO : AVANCE;
      break;
    }
  }
  senal.inicioFase = ahora;
}

void detenerSenal() {
  senal.activa = false;
  apagarSenales();
}

/** Motores y buzzer, sin bloquear el loop (el MQTT sigue atendiendo). */
void actualizarSenal() {
  if (!senal.activa) return;
  unsigned long ahora = millis();
  unsigned long transcurrido = ahora - senal.inicio;
  if (transcurrido >= senal.duracion) {
    detenerSenal();
    Serial.println("Simulación terminada");
    return;
  }
  if (senal.lineal) actualizarMovimiento(ahora);
  bool fase = (transcurrido / PERIODO_PULSO_MS) % 2 == 0;
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
  iniciarSenal(magnitud, duracion, "web");
}

/** Reintenta la red con internet sin bloquear: el panel local sigue respondiendo sin ella. */
void vigilarWifi() {
  bool conectado = WiFi.status() == WL_CONNECTED;
  if (conectado != wifiConectado) {
    wifiConectado = conectado;
    if (conectado) Serial.printf("Wi-Fi «%s» listo: %s\n", WIFI_SSID, WiFi.localIP().toString().c_str());
    else Serial.printf("Sin Wi-Fi «%s», reintentando…\n", WIFI_SSID);
  }
  if (conectado) return;
  // Verde parpadeando mientras no hay internet (salvo durante un sismo)
  if (!senal.activa) digitalWrite(PIN_LED_VERDE, (millis() / 300) % 2);
  if (millis() - ultimoIntentoWifi >= REINTENTO_WIFI_MS) {
    ultimoIntentoWifi = millis();
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_CLAVE);
  }
}

// ---------- Panel local ----------

void panelIniciar() {
  float mag = servidor.arg("mag").toFloat();
  if (mag < MAG_MINIMA || mag > MAG_MAXIMA) {
    servidor.send(400, "application/json", "{\"mensaje\":\"La magnitud debe estar entre 2 y 8\"}");
    return;
  }
  Serial.printf("Panel local: M %.1f durante %d ms\n", mag, DURACION_PANEL_MS);
  iniciarSenal(mag, DURACION_PANEL_MS, "panel local");
  servidor.send(200, "application/json", "{\"mensaje\":\"Sismo iniciado\"}");
}

void panelDetener() {
  detenerSenal();
  Serial.println("Panel local: detenido");
  servidor.send(200, "application/json", "{\"mensaje\":\"Motores detenidos\"}");
}

void panelEstado() {
  const char* estado = "Motores detenidos";
  const char* fase = "Detenido";
  if (senal.activa && !senal.lineal) {
    estado = "Vibrador activo";
    fase = "Sin movimiento lineal";
  } else if (senal.activa) {
    estado = "Movimiento lineal activo";
    const char* fases[] = {"Avanzando", "Pausa al avanzar", "Retrocediendo", "Pausa al regresar"};
    fase = fases[senal.fase];
  }
  JsonDocument doc;
  doc["magnitud"] = senal.activa ? senal.magnitud : 0;
  doc["estado"] = estado;
  doc["fase"] = fase;
  doc["origen"] = senal.origen;
  doc["restanteMs"] = senal.activa ? senal.duracion - (millis() - senal.inicio) : 0;
  doc["wifi"] = wifiConectado;
  doc["mqtt"] = mqtt.connected();
  String json;
  serializeJson(doc, json);
  servidor.send(200, "application/json", json);
}

void conectarMqtt() {
  if (!wifiConectado || mqtt.connected() || millis() - ultimoIntentoMqtt < REINTENTO_MQTT_MS) return;
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
  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IN3, OUTPUT);
  pinMode(PIN_IN4, OUTPUT);
  ledcSetup(CANAL_BUZZER, FRECUENCIA_BUZZER_HZ, 8);
  ledcAttachPin(PIN_BUZZER, CANAL_BUZZER);
  ledcSetup(CANAL_VIBRADOR, FRECUENCIA_MOTORES_HZ, 8);
  ledcAttachPin(PIN_ENA, CANAL_VIBRADOR);
  ledcSetup(CANAL_LINEAL, FRECUENCIA_MOTORES_HZ, 8);
  ledcAttachPin(PIN_ENB, CANAL_LINEAL);
  apagarSenales();

  snprintf(idCliente, sizeof(idCliente), "sismocol-esp32-%06llx", (unsigned long long)(ESP.getEfuseMac() & 0xFFFFFF));
  snprintf(latidoDesconexion, sizeof(latidoDesconexion), "{\"topico\":\"%s\",\"conectado\":false}", TOPICO_SIMULACION);

  // Red propia (panel local) y red con internet (web SismoCol) al mismo tiempo
  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(true);
  if (WiFi.softAP(AP_SSID, AP_CLAVE)) {
    Serial.printf("Red propia «%s»: panel en http://%s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
  } else {
    Serial.println("Error al crear la red propia");
  }
  WiFi.begin(WIFI_SSID, WIFI_CLAVE);
  ultimoIntentoWifi = millis();
  Serial.printf("Conectando a Wi-Fi «%s»…\n", WIFI_SSID);

  servidor.on("/", HTTP_GET, []() { servidor.send_P(200, "text/html", PANEL_HTML); });
  servidor.on("/iniciar", HTTP_GET, panelIniciar);
  servidor.on("/detener", HTTP_GET, panelDetener);
  servidor.on("/estado", HTTP_GET, panelEstado);
  servidor.begin();

  mqtt.setServer(MQTT_HOST, MQTT_PUERTO);
  mqtt.setCallback(alRecibir);
  mqtt.setKeepAlive(15);
}

void loop() {
  servidor.handleClient();
  vigilarWifi();
  conectarMqtt();
  mqtt.loop();
  actualizarSenal();
  if (mqtt.connected() && millis() - ultimoLatido >= INTERVALO_LATIDO_MS) {
    publicarLatido();
    ultimoLatido = millis();
  }
}
