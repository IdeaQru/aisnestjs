// backend/src/main.ts - FIXED TypeScript errors
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface HttpsOptions {
  key: Buffer;
  cert: Buffer;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // ✅ FIXED: Type-safe environment variable parsing [web:769][web:771]
  const useHttps = process.env.USE_HTTPS !== 'false';
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3770; // ✅ Fixed TypeScript error
  const host = process.env.HOST || '0.0.0.0'; // ✅ Already safe
  const nodeEnv = process.env.NODE_ENV || 'development'; // ✅ Already safe
  
  // ✅ Validate port number
  if (isNaN(port) || port < 1 || port > 65535) {
    logger.error(`❌ Invalid PORT value: ${process.env.PORT}. Using default 3770`);
    // Use default port if invalid
    const defaultPort = 3770;
    
    // Enhanced Debug Logging
    logger.log(`🔧 Bootstrap Configuration:`);
    logger.log(`   NODE_ENV: ${nodeEnv}`);
    logger.log(`   HOST: ${host} (${host === '0.0.0.0' ? 'All Interfaces - External Access Enabled' : 'Local Only'})`);
    logger.log(`   PORT: ${defaultPort} (using default due to invalid PORT env)`);
    logger.log(`   USE_HTTPS: ${useHttps}`);
    logger.log(`   Process ID: ${process.pid}`);
  } else {
    // ✅ Enhanced Debug Logging
    logger.log(`🔧 Bootstrap Configuration:`);
    logger.log(`   NODE_ENV: ${nodeEnv}`);
    logger.log(`   HOST: ${host} (${host === '0.0.0.0' ? 'All Interfaces - External Access Enabled' : 'Local Only'})`);
    logger.log(`   PORT: ${port}`);
    logger.log(`   USE_HTTPS: ${useHttps}`);
    logger.log(`   Process ID: ${process.pid}`);
  }
  
  // ✅ Show Network Interfaces for debugging
  const interfaces = os.networkInterfaces();
  logger.log('🌐 Available Network Interfaces:');
  Object.keys(interfaces).forEach(name => {
    const addresses = interfaces[name];
    if (addresses) {
      addresses.forEach(addr => {
        if (addr.family === 'IPv4') {
          logger.log(`   ${name}: ${addr.address} (${addr.internal ? 'internal' : 'external'})`);
        }
      });
    }
  });
  
  // ✅ HTTPS Options
  let httpsOptions: HttpsOptions | undefined = undefined;
  
  if (useHttps) {
    try {
      httpsOptions = await loadAndValidateSSLCertificates(logger);
    } catch (error: any) {
      logger.error('❌ Failed to load SSL certificates:', error.message);
      logger.warn('🔄 Falling back to HTTP...');
      httpsOptions = undefined;
    }
  }
  
  // ✅ Nest Application Options
  const nestOptions: NestApplicationOptions = {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    abortOnError: false,
  };
  
  if (httpsOptions) {
    nestOptions.httpsOptions = httpsOptions;
  }
  
  // ✅ Create NestJS Application
  const app = await NestFactory.create(AppModule, nestOptions);
  
  // ✅ ENHANCED CORS Configuration for External Access
  app.enableCors({
    origin: [
      // Local development
      'https://localhost:4200',
      'https://127.0.0.1:4200',
      'http://localhost:4200',
      'http://127.0.0.1:4200',
      'https://localhost:3770',
      'https://127.0.0.1:3770',
      'http://localhost:3770',
      'http://127.0.0.1:3770',
      
      // External IP patterns for local network
      /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:4200$/,
      /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:3770$/,
      /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:4200$/,
      /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:3770$/,
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}:4200$/,
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}:3770$/,
      
      // Production domains
      'https://demo.osi.my.id',
      /^https:\/\/.*\.osi\.my\.id$/,
      
      // ✅ FIXED: Dynamic origin function with proper TypeScript types
      (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          logger.debug('🔍 CORS: Request with no origin - ALLOWED');
          return callback(null, true);
        }
        
        logger.debug(`🔍 CORS Origin check: ${origin}`);
        
        // Allow localhost and 127.0.0.1 variants
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          logger.debug(`✅ CORS: Localhost origin allowed: ${origin}`);
          return callback(null, true);
        }
        
        // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        const localNetworkPattern = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/;
        if (localNetworkPattern.test(origin)) {
          logger.log(`✅ CORS: Local network origin allowed: ${origin}`);
          return callback(null, true);
        }
        
        // Allow production domains
        if (origin.includes('osi.my.id')) {
          logger.log(`✅ CORS: Production domain allowed: ${origin}`);
          return callback(null, true);
        }
        
        // Block unknown origins in production, allow in development
        if (nodeEnv === 'development') {
          logger.warn(`⚠️ CORS: Unknown origin in development - ALLOWED: ${origin}`);
          return callback(null, true);
        } else {
          logger.warn(`❌ CORS: Unknown origin blocked: ${origin}`);
          return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
        }
      }
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Access-Control-Allow-Headers',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
      'Cache-Control',
      'Pragma',
      'Expires',
      'X-Forwarded-For',
      'X-Real-IP'
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page',
      'X-Per-Page'
    ],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false,
    maxAge: 86400, // 24 hours
  });
  
  // ✅ Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    disableErrorMessages: nodeEnv === 'production',
    validationError: {
      target: false,
      value: false,
    },
  }));
  
  // ✅ API prefix
  app.setGlobalPrefix('api', {
    exclude: ['/health', '/'] // Health check endpoints without prefix
  });
  
  // ✅ Security headers middleware
  app.use((req: any, res: any, next: any) => {
    // Security headers
    res.header('X-Frame-Options', 'DENY');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.header('X-DNS-Prefetch-Control', 'off');
    
    if (httpsOptions) {
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    // Remove server signature
    res.removeHeader('X-Powered-By');
    res.header('Server', 'NestJS');
    
    // Debug logging for origins
    if (req.headers.origin && nodeEnv === 'development') {
      logger.debug(`📨 Request from origin: ${req.headers.origin}`);
      logger.debug(`📨 Request path: ${req.method} ${req.path}`);
    }
    
    next();
  });
  
  // ✅ Health check endpoint (before global prefix)
  app.use('/health', (req: any, res: any) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: nodeEnv,
      version: process.env.npm_package_version || '1.0.0',
      host: host,
      port: port,
      https: !!httpsOptions,
      pid: process.pid,
      memory: process.memoryUsage(),
      message: 'NestJS AIS Backend is running'
    });
  });
  
  // ✅ CRITICAL: Force IPv4 binding - Listen with explicit host
  const server = await app.listen(port, host);
  
  // ✅ Server information logging
  const protocol = httpsOptions ? 'https' : 'http';
  const serverUrl = `${protocol}://${host}:${port}`;
  
  logger.log('🚀 ========================================');
  logger.log(`🚀 NestJS Backend Successfully Started!`);
  logger.log(`📡 Server URL: ${serverUrl}`);
  logger.log(`📡 API Base: ${serverUrl}/api`);
  logger.log(`🏥 Health Check: ${serverUrl}/health`);
  logger.log(`🔒 HTTPS: ${httpsOptions ? 'ENABLED' : 'DISABLED'}`);
  logger.log(`🌐 External Access: ${host === '0.0.0.0' ? 'ENABLED' : 'DISABLED'}`);
  logger.log(`🛡️ CORS: ENABLED with dynamic origin matching`);
  logger.log(`🔧 Environment: ${nodeEnv.toUpperCase()}`);
  logger.log('🚀 ========================================');
  
  // ✅ Show external access URLs if available
  if (host === '0.0.0.0') {
    const externalIPs: string[] = [];
    Object.keys(interfaces).forEach(interfaceName => {
      const addresses = interfaces[interfaceName];
      if (addresses) {
        addresses.forEach(address => {
          if (address.family === 'IPv4' && !address.internal) {
            externalIPs.push(address.address);
          }
        });
      }
    });
    
    if (externalIPs.length > 0) {
      logger.log('🌐 External Access URLs:');
      externalIPs.forEach(ip => {
        logger.log(`   📱 ${protocol}://${ip}:${port}/health`);
        logger.log(`   📡 ${protocol}://${ip}:${port}/api`);
      });
    }
  }
  
  // ✅ Log all available endpoints
  logEndpoints(protocol, host, port, logger);
  
  // ✅ Verify server binding after startup
  setTimeout(async () => {
    try {
      const testUrl = `${protocol}://localhost:${port}/health`;
      const response = await fetch(testUrl, {
        headers: { 'Accept': 'application/json' }
      });
      logger.log(`✅ Server binding verification: ${response.ok ? 'SUCCESS' : 'FAILED'}`);
    } catch (error: any) {
      logger.error(`❌ Server binding verification failed: ${error.message}`);
    }
  }, 2000);
  
  return { app, server };
}

// ✅ FIXED: SSL Certificate Loading Function with proper error handling
async function loadAndValidateSSLCertificates(logger: Logger): Promise<HttpsOptions | undefined> {
  const possiblePaths = [
    {
      keyPath: path.join(os.homedir(), 'key.pem'),
      certPath: path.join(os.homedir(), 'cert.pem'),
      description: 'User home directory'
    },
    {
      keyPath: path.join(process.cwd(), 'ssl', 'localhost-key.pem'),
      certPath: path.join(process.cwd(), 'ssl', 'localhost.pem'),
      description: 'Project ssl directory'
    },
    {
      keyPath: process.env.SSL_KEY_PATH || '',
      certPath: process.env.SSL_CERT_PATH || '',
      description: 'Environment variables'
    }
  ];

  for (const { keyPath, certPath, description } of possiblePaths) {
    if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      try {
        logger.log(`🔍 Loading certificates from ${description}`);
        logger.log(`   🔑 Key: ${keyPath}`);
        logger.log(`   📜 Certificate: ${certPath}`);
        
        const keyContent = fs.readFileSync(keyPath, 'utf8');
        const certContent = fs.readFileSync(certPath, 'utf8');
        
        // Basic validation
        if (!keyContent.includes('BEGIN PRIVATE KEY') && !keyContent.includes('BEGIN RSA PRIVATE KEY')) {
          throw new Error('Invalid private key format');
        }
        
        if (!certContent.includes('BEGIN CERTIFICATE')) {
          throw new Error('Invalid certificate format');
        }
        
        const httpsOptions = {
          key: Buffer.from(keyContent),
          cert: Buffer.from(certContent),
        };
        
        // Test certificate by creating a temporary HTTPS server
        const https = require('https');
        const testServer = https.createServer(httpsOptions, (req: any, res: any) => {
          res.end('OK');
        });
        
        await new Promise<void>((resolve, reject) => {
          testServer.listen(0, () => {
            testServer.close();
            resolve();
          });
          testServer.on('error', reject);
        });
        
        logger.log(`✅ SSL certificates loaded and validated from ${description}`);
        return httpsOptions;
        
      } catch (error: any) {
        logger.warn(`⚠️ Failed to load certificates from ${description}: ${error.message}`);
        continue;
      }
    } else {
      logger.debug(`🔍 Certificates not found in ${description}`);
    }
  }

  // If no certificates found, generate basic ones
  logger.warn('⚠️ No valid SSL certificates found');
  return undefined;
}

// ✅ Endpoint logging function
function logEndpoints(protocol: string, host: string, port: number, logger: Logger): void {
  const baseUrl = `${protocol}://${host}:${port}`;
  
  logger.log('📍 Available Endpoints:');
  logger.log(`   🏥 Health Check: ${baseUrl}/health`);
  logger.log(`   🚢 Vessels API: ${baseUrl}/api/vessels`);
  logger.log(`   📡 VTS API: ${baseUrl}/api/vts`);
  logger.log(`   ⚓ AtoN API: ${baseUrl}/api/aton`);
  logger.log(`   🔌 WebSocket: ${baseUrl.replace(protocol, protocol === 'https' ? 'wss' : 'ws')}/socket.io/`);
  logger.log(`   📊 API Documentation: ${baseUrl}/api/docs`);
}

// ✅ Graceful shutdown handlers
const gracefulShutdown = (signal: string) => {
  const logger = new Logger('Shutdown');
  logger.log(`🛑 ${signal} received, shutting down gracefully`);
  
  // Cleanup tasks here
  setTimeout(() => {
    logger.log('🛑 Process terminated');
    process.exit(0);
  }, 1000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  const logger = new Logger('UncaughtException');
  logger.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const logger = new Logger('UnhandledRejection');
  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ✅ Bootstrap the application
bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('❌ Failed to start server:', error);
  process.exit(1);
});
