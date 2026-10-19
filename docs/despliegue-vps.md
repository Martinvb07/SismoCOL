# Despliegue en el VPS (PM2 + Nginx)

Dominio: `sismocol.trabajosucc.com` → registro A `sismocol` → `31.220.52.31`.
Ruta en el VPS: `/var/www/SismoCOL`.

| Proceso | Puerto | Expuesto |
|---|---|---|
| `sismocol-api` (PM2) | 4100 | Sí, vía Nginx en `/api` |
| `sismocol-analytics` (PM2) | 8100 | No, solo `127.0.0.1` |
| Frontend | — | Nginx sirve `Frontend/dist` |

ReservaTuCancha ya usa 3000 y 4000 en el mismo VPS. Antes de instalar, revisar que 4100 y 8100 estén libres:

```bash
sudo ss -tulpn | grep LISTEN                 # todo lo que escucha y qué proceso
sudo ss -tulpn | grep -E ':(4100|8100)\b'    # vacío = libres
pm2 ls                                       # procesos PM2 actuales
ls /etc/nginx/sites-enabled/                 # sitios de Nginx existentes
```

Si alguno está ocupado, cambiarlo en `ecosystem.config.js`, `infra/nginx/sismocol.conf`, `ANALYTICS_URL` de `Backend/.env` y los health checks de `.github/workflows/deploy.yml`.

## 1. Instalación inicial (una sola vez)

```bash
# Python 3.11 (Ubuntu): sudo add-apt-repository ppa:deadsnakes/ppa && sudo apt install python3.11 python3.11-venv
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
CORS_ORIGINS=https://sismocol.trabajosucc.com
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
(cd Analytics && python3.11 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt)

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
sudo certbot --nginx -d sismocol.trabajosucc.com
```

## 2. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`, igual que en ReservaTuCancha. En cada push a `main`:

1. **CI**: build de la API, lint + pruebas + build del frontend, pruebas del servicio analítico.
2. **Deploy** por SSH: `git reset --hard` al commit, build, `prisma migrate deploy`, `pm2 startOrReload`, health checks de `:4100/api/health` y `:8100/health`. Si fallan, vuelve al commit anterior.

En GitHub → Settings → Environments, crear `produccion` con estos secretos:

| Secreto | Valor |
|---|---|
| `VPS_HOST` | `31.220.52.31` |
| `VPS_USER` | usuario SSH del VPS (el mismo que corre PM2) |
| `VPS_PATH` | `/var/www/SismoCOL` |
| `VPS_SSH_KEY` | clave privada SSH cuya pública está en `~/.ssh/authorized_keys` del VPS |

Se puede reutilizar la misma clave de ReservaTuCancha.
