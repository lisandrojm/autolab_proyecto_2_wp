// PM2 en el VPS: `pm2 start ecosystem.config.cjs`. El entorno sale de la carpeta de deploy
// (/home/lumba/apps/<entorno>/tango-connector), igual que raal-development y raal-production.
// Las variables secretas salen del .env de la carpeta: el servicio lo carga al arrancar.
const entorno = __dirname.includes('/production/') ? 'production' : 'development';
const PUERTOS = { development: 7007, production: 7008 };

module.exports = {
  apps: [
    {
      name: `tango-connector-${entorno}`,
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: PUERTOS[entorno],
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
    },
  ],
};
