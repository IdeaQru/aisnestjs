// ecosystem.config.js - Production Ready dengan Fork Mode
const os = require('os');
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'myapp',
      script: './dist/main.js',
      
      // ✅ FORK MODE Configuration [web:388][web:386]
      instances: 1,              // ✅ Single instance untuk fork mode
      exec_mode: 'fork',         // ✅ Fork mode (bukan cluster)
      
      // ✅ Development Environment
      env: {
        NODE_ENV: 'development',
        USE_HTTPS: 'true',
        HOST: '0.0.0.0',         // ✅ External access
        PORT: 3770,
        SSL_KEY_PATH: path.join(os.homedir(), 'key.pem'),
        SSL_CERT_PATH: path.join(os.homedir(), 'cert.pem')
      },
      
      // ✅ Production Environment (juga menggunakan fork)
      env_production: {
        NODE_ENV: 'production',
        USE_HTTPS: 'true',
        HOST: '0.0.0.0',         // ✅ External access
        PORT: 3770,
        SSL_KEY_PATH: path.join(os.homedir(), 'key.pem'),
        SSL_CERT_PATH: path.join(os.homedir(), 'cert.pem')
      },
      
      // ✅ Performance Settings untuk Fork Mode
      max_memory_restart: '2G',  // ✅ Lebih tinggi untuk single process
      min_uptime: '10s',
      max_restarts: 15,          // ✅ Lebih banyak restarts untuk single process
      restart_delay: 2000,       // ✅ 2 detik delay sebelum restart
      
      // ✅ Logging Configuration
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,          // ✅ Merge logs karena single instance
      
      // ✅ Fork Mode Settings
      watch: false,              // ✅ Disable watch untuk production
      ignore_watch: ['node_modules', 'dist', 'logs', '.git'],
      
      // ✅ Health Monitoring
      kill_timeout: 5000,
      wait_ready: true,          // ✅ Wait for ready signal
      listen_timeout: 10000,
      
      // ✅ Fork Mode Specific Options [web:388]
      interpreter: 'node',       // ✅ Use Node.js interpreter
      interpreter_args: [
        '--max-old-space-size=2048',  // ✅ 2GB heap size
        '--optimize-for-size'         // ✅ Optimize for memory usage
      ],
      
      // ✅ Process Management
      autorestart: true,         // ✅ Auto restart on crash
      force: false,              // ✅ Don't force restart if already running
      
      // ✅ Environment Variables untuk Fork Mode
      env_file: '.env',          // ✅ Load .env file if exists
      source_map_support: true,  // ✅ Enable source map support
      
      // ✅ Error Handling
      exp_backoff_restart_delay: 100,  // ✅ Exponential backoff
      max_restart_delay: 5000,         // ✅ Max restart delay
    }
  ]
};
