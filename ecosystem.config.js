// ecosystem.config.js - FIXED SSL paths dan debugging
const os = require('os');
const path = require('path');

// ✅ Debug certificate paths
const sslKeyPath = path.join(os.homedir(), 'key.pem');
const sslCertPath = path.join(os.homedir(), 'cert.pem');

console.log('🔍 SSL Certificate Paths:');
console.log(`   Key: ${sslKeyPath}`);
console.log(`   Cert: ${sslCertPath}`);
console.log(`   Key exists: ${require('fs').existsSync(sslKeyPath)}`);
console.log(`   Cert exists: ${require('fs').existsSync(sslCertPath)}`);

module.exports = {
  apps: [
    {
      name: 'myapp',
      script: './dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      
      env: {
        NODE_ENV: 'development',
        USE_HTTPS: 'true',              // ✅ String 'true'
        HOST: '0.0.0.0',
        PORT: '3770',                   // ✅ String untuk consistency
        SSL_KEY_PATH: sslKeyPath,
        SSL_CERT_PATH: sslCertPath
      },
      
      env_production: {
        NODE_ENV: 'production',
        USE_HTTPS: 'true',              // ✅ CRITICAL: Must be string 'true'
        HOST: '0.0.0.0',
        PORT: '3770',
        SSL_KEY_PATH: sslKeyPath,       // ✅ Full path
        SSL_CERT_PATH: sslCertPath      // ✅ Full path
      },
      
      // ✅ Performance Settings
      max_memory_restart: '2G',
      min_uptime: '10s',
      max_restarts: 15,
      restart_delay: 2000,
      
      // ✅ Enhanced Logging untuk debug
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // ✅ Environment
      watch: false,
      ignore_watch: ['node_modules', 'dist', 'logs', '.git'],
      
      // ✅ Process settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      autorestart: true,
      force: false,
    }
  ]
};
