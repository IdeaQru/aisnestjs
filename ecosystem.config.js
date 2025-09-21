// ecosystem.config.js
const os = require('os');
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'nestjs-app',
      script: './dist/main.js',
      instances: Math.floor(require('os').cpus().length / 2), // Atau gunakan number spesfik seperti 2, 4
      exec_mode: 'cluster',
      
      // ✅ HTTPS Environment Variables
      env: {
        NODE_ENV: 'development',
        USE_HTTPS: 'true',
        HOST: 'localhost',
        PORT: 3770,
        SSL_KEY_PATH: path.join(os.homedir(), 'key.pem'),
        SSL_CERT_PATH: path.join(os.homedir(), 'cert.pem'),
        
        // Database
        MONGODB_URI: 'mongodb://localhost:27017/myapp-dev',
        
        // CORS
        CORS_ORIGIN: 'https://localhost:4200,https://127.0.0.1:4200',
        
        // Debug
        NODE_TLS_REJECT_UNAUTHORIZED: '0'
      },
      
      env_production: {
        NODE_ENV: 'production',
        USE_HTTPS: 'true',
        HOST: '0.0.0.0',
        PORT: 3770,
        SSL_KEY_PATH: path.join(os.homedir(), 'key.pem'),
        SSL_CERT_PATH: path.join(os.homedir(), 'cert.pem'),
        
        // Database
        MONGODB_URI: 'mongodb://localhost:27017/myapp-prod',
        
        // CORS (update with your production domains)
        CORS_ORIGIN: 'https://your-domain.com,https://demo.osi.my.id',
        
        // Security
        NODE_TLS_REJECT_UNAUTHORIZED: '1'
      },
      
      // ✅ PM2 Configuration
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      
      // ✅ Performance Settings
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      
      // ✅ Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // ✅ Advanced Settings
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // ✅ Auto-restart on file changes (hanya untuk development)
      watch_delay: 1000,
      
      // ✅ Cluster settings
      increment_var: 'PORT',
      
      // ✅ Health check
      health_check_grace_period: 3000
    }
  ],
  
  // ✅ Deployment Configuration (Optional)
  deploy: {
    production: {
      user: 'node',
      host: 'your-server.com',
      ref: 'origin/master',
      repo: 'git@github.com:your-username/your-repo.git',
      path: '/var/www/production',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
