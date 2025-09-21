// ecosystem.static.config.js - Untuk serve static build dengan HTTPS
const path = require('path');
const os = require('os');

module.exports = {
  apps: [
    {
      name: 'angular-static',
      script: 'npx',
      args: [
        'serve', 
        'dist/my-leaflet-map/browser', 
        '-s', 
        '-p', '4200',
        '--ssl-cert', path.join(os.homedir(), 'cert.pem'),
        '--ssl-key', path.join(os.homedir(), 'key.pem'),
        '--cors'
      ],
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      
      env: {
        NODE_ENV: 'production'
      },
      
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 5,
      
      log_file: './logs/angular-static-combined.log',
      out_file: './logs/angular-static-out.log',
      error_file: './logs/angular-static-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
