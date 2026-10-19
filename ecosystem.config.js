/* Procesos de producción en el VPS — lo consume el deploy de GitHub Actions
   con `pm2 startOrReload ecosystem.config.js` (crea los procesos la primera
   vez y los recarga las siguientes).

   Los puertos no son 4000/3000 porque en el mismo VPS ya corre ReservaTuCancha.
   Si se cambian, actualizar también infra/nginx/sismocol.conf, ANALYTICS_URL
   en Backend/.env y los health checks de .github/workflows/deploy.yml.

   Los secretos NO van aquí. La API lee Backend/.env y el servicio analítico
   lee Analytics/.env. El frontend es estático (Frontend/dist) y lo sirve Nginx,
   así que no necesita proceso en PM2. */
module.exports = {
  apps: [
    {
      name: 'sismocol-api',
      cwd: './Backend',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production', PORT: 4100 },
      max_memory_restart: '512M',
      time: true,
    },
    {
      name: 'sismocol-analytics',
      cwd: './Analytics',
      script: '.venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8100 --workers 1',
      interpreter: 'none',
      // Un solo worker: APScheduler corre dentro del proceso y no debe duplicarse.
      max_memory_restart: '1G',
      time: true,
    },
  ],
};
