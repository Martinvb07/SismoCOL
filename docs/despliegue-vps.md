# Despliegue en el VPS (PM2 + Nginx)

Dominio: `sismocol.trabajosucc.site` → registro A `sismocol` → `31.220.52.31`.
Ruta en el VPS: `/var/www/SismoCOL`.

| Proceso | Puerto | Expuesto |
|---|---|---|
| `sismocol-api` (PM2) | 4100 | Sí, vía Nginx en `/api` |
| `sismocol-analytics` (PM2) | 8100 | No, solo `127.0.0.1` |
| Frontend | — | Nginx sirve `Frontend/dist` |

El VPS ya tiene otros proyectos en 3000–3020, 4000–4010, 6010, 27017, 3306 y 33060; 4100 y 8100 están libres (revisado el 2026-10-19). Para volver a comprobarlo:

```bash
sudo ss -tulpn | grep LISTEN                 # todo lo que escucha y qué proceso
sudo ss -tulpn | grep -E ':(4100|8100)\b'    # vacío = libres
pm2 ls                                       # procesos PM2 actuales
ls /etc/nginx/sites-enabled/                 # sitios de Nginx existentes
```

Si alguno está ocupado, cambiarlo en `ecosystem.config.js`, `infra/nginx/sismocol.conf`, `ANALYTICS_URL` de `Backend/.env` y los health checks de `.github/workflows/deploy.yml`.

## 1. Instalación inicial (una sola vez)

```bash
# Se usa el Python del sistema (3.12 en Ubuntu 24.04); solo hace falta el módulo venv:
apt install -y python3-venv
cd /var/www
git clone https://github.com/Martinvb07/SismoCOL.git
cd SismoCOL
```

### Base de datos

```sql
CREATE DATABASE sismocol CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sismocol'@'localhost' IDENTIFIED BY 'una-clave-segura';
GRANT ALL PRIVILEGES ON sismocol.* TO 'sismocol'@'localhost';
FLUSH PRIVILEGES;
```

### Variables de entorno

```bash
cp Backend/.env.example Backend/.env
cp Analytics/.env.example Analytics/.env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # ANALYTICS_TOKEN (igual en ambos .env)
```

En `Backend/.env`:

```
NODE_ENV=production
PORT=4100
CORS_ORIGINS=https://sismocol.trabajosucc.site
DATABASE_URL=mysql://sismocol:una-clave-segura@localhost:3306/sismocol
ANALYTICS_URL=http://127.0.0.1:8100
```

Borrar `SHADOW_DATABASE_URL` (no se usa en producción) y completar `SEED_*`.
En `Analytics/.env`, la misma clave de MySQL y el mismo `ANALYTICS_TOKEN`.

### Primer build

```bash
cd /var/www/SismoCOL
(cd Backend && npm ci && npm run build && npx prisma migrate deploy && npm run db:seed)
printf 'VITE_API_URL=\nVITE_USAR_MOCKS=false\n' > Frontend/.env.production
(cd Frontend && npm ci && npm run build)
(cd Analytics && python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt)

pm2 startOrReload ecosystem.config.js
pm2 save
curl http://127.0.0.1:4100/api/health
curl http://127.0.0.1:8100/health
```

### Nginx y HTTPS

```bash
sudo cp infra/nginx/sismocol.conf /etc/nginx/sites-available/sismocol
sudo ln -s /etc/nginx/sites-available/sismocol /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d sismocol.trabajosucc.site
```

## 2. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`, igual que en ReservaTuCancha. En cada push a `main`:

1. **CI**: build de la API, lint + pruebas + build del frontend, pruebas del servicio analítico.
2. **Deploy** por SSH: `git reset --hard` al commit, build, `prisma migrate deploy`, `pm2 startOrReload`, health checks de `:4100/api/health` y `:8100/health`. Si fallan, vuelve al commit anterior.

En GitHub → Settings → Environments, crear `produccion` con estos secretos:

| Secreto | Valor |
|---|---|
| `VPS_HOST` | `31.220.52.31` |
| `VPS_USER` | `root` (el usuario que corre PM2) |
| `VPS_PATH` | `/var/www/SismoCOL` |
| `VPS_SSH_KEY` | clave privada SSH cuya pública está en `~/.ssh/authorized_keys` del VPS |

Se puede reutilizar la misma clave de ReservaTuCancha.

## 3. MQTT para la simulación (Mosquitto)

La API publica las simulaciones y el ESP32 las recibe a través de Mosquitto en el VPS. El ESP32 se conecta desde otra red (Wi-Fi de la universidad o de la casa), así que el puerto 1883 queda abierto pero **con usuario y clave**, y cada usuario solo puede usar sus tópicos (`infra/mosquitto/acl`).

```bash
apt install -y mosquitto mosquitto-clients
cp /var/www/SismoCOL/infra/mosquitto/mosquitto.conf /etc/mosquitto/conf.d/sismocol.conf
cp /var/www/SismoCOL/infra/mosquitto/acl /etc/mosquitto/acl

# Claves: genere dos distintas y guárdelas
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
mosquitto_passwd -c /etc/mosquitto/passwd sismocol-api      # pide la clave de la API
mosquitto_passwd    /etc/mosquitto/passwd sismocol-esp32    # pide la clave del ESP32
chown mosquitto:mosquitto /etc/mosquitto/passwd /etc/mosquitto/acl
chmod 600 /etc/mosquitto/passwd

systemctl enable --now mosquitto && systemctl restart mosquitto
ufw allow 1883/tcp            # solo si usa ufw
```

En `Backend/.env`:

```
MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=sismocol-api
MQTT_PASSWORD=<clave de sismocol-api>
```

Después: `pm2 restart sismocol-api --update-env`. En el log (`pm2 logs sismocol-api`) debe aparecer `MQTT conectado`.

El ESP32 usa `MQTT_HOST "sismocol.trabajosucc.site"`, el usuario `sismocol-esp32` y su clave en `Firmware/esp32/include/secrets.h` (ver `Firmware/esp32/README.md`).

Sin Mosquitto la API funciona igual: las simulaciones quedan **FALLIDA** y el dispositivo aparece desconectado.

## Pendiente: prototipo ESP32

El servidor ya está listo para la simulación: Mosquitto corre en el VPS con usuarios y ACL, el puerto 1883/TCP está abierto en `ufw` y la API muestra `MQTT conectado`. Falta lo que depende del prototipo físico:

- [ ] Armar el circuito (LEDs, motor con transistor y buzzer), según `Firmware/esp32/README.md`.
- [ ] Crear `Firmware/esp32/include/secrets.h` con la red Wi-Fi (2,4 GHz) y el usuario `sismocol-esp32`.
- [ ] Compilar y cargar el firmware: `pio run -t upload`, y revisar con `pio device monitor`.
- [ ] Probar la conexión desde otra red. Si no conecta, abrir el 1883/TCP en el firewall del panel de Hostinger.
- [ ] Enviar una simulación desde la web y confirmar que queda **ENVIADA** y que se encienden las señales.
