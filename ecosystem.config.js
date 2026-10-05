/* Procesos de producción en el VPS: `pm2 startOrReload ecosystem.config.js`.

   Los secretos NO van aquí. La API lee Backend/.env y el servicio analítico
   lee Analytics/.env. El frontend es estático (Frontend/dist) y lo sirve Nginx,
   así que no necesita proceso en PM2. */
module.exports = {
  apps: [
    {
      name: 'sismocol-api',
      cwd: './Backend',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production', PORT: 4000 },
      max_memory_restart: '512M',
      time: true,
    },
    {
      name: 'sismocol-analytics',
      cwd: './Analytics',
      script: '.venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8000 --workers 1',
      interpreter: 'none',
      // Un solo worker: APScheduler corre dentro del proceso y no debe duplicarse.
      max_memory_restart: '1G',
      time: true,
    },
  ],
};
