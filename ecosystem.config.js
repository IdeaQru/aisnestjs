// ecosystem.config.js
const os = require('os');
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'myapp',
      script: './dist/main.js',  // ✅ Point to built file
      instances: 'max',          // ✅ Use all CPU cores untuk production
      exec_mode: 'cluster',      // ✅ Cluster mode untuk high availability
      
      env: {
        NODE_ENV: 'development',
        USE_HTTPS: 'true',
        HOST: '0.0.0.0',
        PORT: 3770,
        SSL_KEY_PATH: path.join(os.homedir(), 'key.pem'),
        SSL_CERT_PATH: path.join(os.homedir(), 'cert.pem')
      },
      
      env_production: {
        NODE_ENV: 'production',
        USE_HTTPS: 'true',
        HOST: '0.0.0.0',          // ✅ Accept connections dari semua interface
        PORT: 3770,
        SSL_KEY_PATH: path.join(os.homedir(), 'key.pem'),
        SSL_CERT_PATH: path.join(os.homedir(), 'cert.pem')
      },
      
      // ✅ Performance settings
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      
      // ✅ Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // ✅ Auto-restart settings
      watch: false,              // ✅ Disable untuk production
      ignore_watch: ['node_modules', 'logs'],
      
      // ✅ Health monitoring
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ]
};
