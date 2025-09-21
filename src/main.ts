// backend/src/main.ts - Complete External Access Configuration
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
  
  // ✅ Configuration
  const useHttps = process.env.USE_HTTPS !== 'false';
  const port = process.env.PORT || 3770;
  const host = process.env.HOST || '0.0.0.0'; // ✅ CRITICAL for external access
  
  let httpsOptions: HttpsOptions | undefined = undefined;
  
  if (useHttps) {
    try {
      httpsOptions = await loadAndValidateSSLCertificates(logger);
    } catch (error) {
      logger.error('❌ Failed to load SSL certificates:', error.message);
      logger.warn('🔄 Falling back to HTTP...');
      httpsOptions = undefined;
    }
  }
  
  const nestOptions: NestApplicationOptions = {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  };
  
  if (httpsOptions) {
    nestOptions.httpsOptions = httpsOptions;
  }
  
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
      
      // External IP patterns
      /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}:4200$/,
      /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:4200$/,
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}:4200$/,
      
      // Production domains
      'https://demo.osi.my.id',
      /^https:\/\/.*\.osi\.my\.id$/,
      
      // Dynamic origin function
      (origin, callback) => {
        if (!origin) return callback(null, true);
        
        logger.debug(`🔍 CORS Origin check: ${origin}`);
        
        // Allow localhost variants
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
        
        // Allow local network IPs
        const localNetworkPattern = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/;
        if (localNetworkPattern.test(origin)) {
          logger.log(`✅ Allowed local network origin: ${origin}`);
          return callback(null, true);
        }
        
        // Allow production domains
        if (origin.includes('osi.my.id')) {
          return callback(null, true);
        }
        
        logger.warn(`⚠️ Blocked unknown origin: ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
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
      'Pragma'
    ],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false,
  });
  
  // ✅ Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    disableErrorMessages: false,
  }));
  
  // ✅ API prefix
  app.setGlobalPrefix('api');
  
  // ✅ Security headers middleware
  app.use((req: any, res: any, next: any) => {
    res.header('X-Frame-Options', 'DENY');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    if (httpsOptions) {
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    if (req.headers.origin) {
      logger.debug(`📨 Request from origin: ${req.headers.origin}`);
    }
    
    next();
  });
  
  // ✅ Start server
  await app.listen(port, host);
  
  // ✅ Enhanced logging
  const protocol = httpsOptions ? 'https' : 'http';
  const serverUrl = `${protocol}://${host}:${port}`;
  
  logger.log('🚀 =================================');
  logger.log(`🚀 Backend running on ${serverUrl}`);
  logger.log(`📡 API available at ${serverUrl}/api`);
  logger.log(`🔒 SSL/HTTPS: ${httpsOptions ? 'ENABLED' : 'DISABLED'}`);
  logger.log(`🌐 Host: ${host} (external access: ${host === '0.0.0.0' ? 'ENABLED' : 'DISABLED'})`);
  logger.log(`✅ CORS enabled with dynamic origin matching`);
  logger.log('🚀 =================================');
  
  // ✅ Show external access URLs
  if (host === '0.0.0.0') {
    const networkInterfaces = os.networkInterfaces();
    const externalIPs: string[] = [];
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
      const addresses = networkInterfaces[interfaceName];
      if (addresses) {
        addresses.forEach(address => {
          if (address.family === 'IPv4' && !address.internal) {
            externalIPs.push(address.address);
          }
        });
      }
    });
    
    if (externalIPs.length > 0) {
      logger.log('🌐 External access URLs:');
      externalIPs.forEach(ip => {
        logger.log(`   ${protocol}://${ip}:${port}/api`);
      });
    }
  }
  
  logEndpoints(serverUrl);
  return app;
}

// ✅ SSL Certificate Loading
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
        logger.log(`🔍 Attempting to load certificates from ${description}`);
        logger.log(`   🔑 Key: ${keyPath}`);
        logger.log(`   📜 Certificate: ${certPath}`);
        
        let keyContent = fs.readFileSync(keyPath, 'utf8');
        let certContent = fs.readFileSync(certPath, 'utf8');
        
        keyContent = repairPEMContent(keyContent, 'PRIVATE KEY', logger);
        certContent = repairPEMContent(certContent, 'CERTIFICATE', logger);
        
        if (!validatePEMFormat(keyContent, 'PRIVATE KEY') || !validatePEMFormat(certContent, 'CERTIFICATE')) {
          logger.warn(`⚠️ Certificate format validation failed for ${description}`);
          continue;
        }
        
        const httpsOptions = {
          key: Buffer.from(keyContent),
          cert: Buffer.from(certContent),
        };
        
        try {
          const https = require('https');
          const testServer = https.createServer(httpsOptions);
          testServer.close();
          
          logger.log(`✅ SSL certificates loaded and validated successfully from ${description}`);
          return httpsOptions;
          
        } catch (testError) {
          logger.error(`❌ Certificate test failed for ${description}:`, testError.message);
          continue;
        }
        
      } catch (readError) {
        logger.warn(`⚠️ Failed to process certificates from ${description}:`, readError.message);
        continue;
      }
    } else {
      logger.debug(`🔍 Certificates not found in ${description}`);
    }
  }

  // Generate new certificates if none found
  logger.warn('⚠️ No valid SSL certificates found. Generating self-signed certificate...');
  const sslPath = path.join(process.cwd(), 'ssl');
  await generateSelfSignedCertificate(sslPath);
  
  const keyPath = path.join(sslPath, 'localhost-key.pem');
  const certPath = path.join(sslPath, 'localhost.pem');
  
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

function repairPEMContent(content: string, type: string, logger: Logger): string {
  try {
    content = content.replace(/^\uFEFF/, '');
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    content = content.trim();
    
    const beginMarker = `-----BEGIN ${type}-----`;
    const endMarker = `-----END ${type}-----`;
    
    const beginPattern = `${beginMarker}([A-Za-z0-9+/=])`;
    const endPattern = `([A-Za-z0-9+/=])${endMarker}`;
    
    content = content.replace(new RegExp(beginPattern, 'g'), `${beginMarker}\n$1`);
    content = content.replace(new RegExp(endPattern, 'g'), `$1\n${endMarker}`);
    
    content = content.replace(
      /-----END CERTIFICATE----------BEGIN CERTIFICATE-----/g, 
      '-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----'
    );
    
    const lines: string[] = content.split('\n');
    const repairedLines: string[] = [];
    
    for (let line of lines) {
      if (line.startsWith('-----') || line.trim() === '') {
        repairedLines.push(line);
      } else {
        while (line.length > 64) {
          repairedLines.push(line.substring(0, 64));
          line = line.substring(64);
        }
        if (line.length > 0) {
          repairedLines.push(line);
        }
      }
    }
    
    const repairedContent = repairedLines.join('\n');
    
    if (repairedContent !== content) {
      logger.log(`🔧 Repaired ${type} formatting`);
    }
    
    return repairedContent;
    
  } catch (error) {
    logger.error(`❌ Failed to repair ${type} content:`, error.message);
    return content;
  }
}

function validatePEMFormat(content: string, type: string): boolean {
  const beginMarker = `-----BEGIN ${type}-----`;
  const endMarker = `-----END ${type}-----`;
  
  if (!content.includes(beginMarker) || !content.includes(endMarker)) {
    return false;
  }
  
  const beginIndex = content.indexOf(beginMarker) + beginMarker.length;
  const endIndex = content.indexOf(endMarker);
  
  if (beginIndex >= endIndex) {
    return false;
  }
  
  const base64Content = content.substring(beginIndex, endIndex).replace(/\s/g, '');
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(base64Content);
}

async function generateSelfSignedCertificate(sslPath: string): Promise<void> {
  const { execSync } = require('child_process');
  
  if (!fs.existsSync(sslPath)) {
    fs.mkdirSync(sslPath, { recursive: true });
  }
  
  const keyPath = path.join(sslPath, 'localhost-key.pem');
  const certPath = path.join(sslPath, 'localhost.pem');
  
  try {
    const command = `openssl req -x509 -newkey rsa:2048 -nodes -sha256 ` +
      `-subj "/C=ID/ST=Jakarta/L=Jakarta/O=Development/CN=localhost" ` +
      `-keyout "${keyPath}" -out "${certPath}" -days 365`;
    
    execSync(command, { stdio: 'pipe' });
    
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      throw new Error('SSL certificate files were not created');
    }
    
  } catch (error) {
    // Fallback certificate generation
    const basicKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7VJTUt9Us8cKB
wEiOfH3nzL7ZJvY1hKBYh9n+2c5f7cKBwEiOfH3nzL7ZJvY1hKBYh9n+2c5f7c
-----END PRIVATE KEY-----`;

    const basicCert = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK/OvD1234wDQYJKoZIhvcNAQELBQAwXjELMAkGA1UE
BhMCSUQxEDAOBgNVBAgTB0pha2FydGExEDAOBgNVBAcTB0pha2FydGExFDASBgNV
BAoTC0RldmVsb3BtZW50MRUwEwYDVQQDEwxsb2NhbGhvc3QuY29tMB4XDTIzMDEw
MTAwMDAwMFoXDTI0MDEwMTAwMDAwMFowXjELMAkGA1UEBhMCSUQxEDAOBgNVBAgT
-----END CERTIFICATE-----`;

    fs.writeFileSync(keyPath, basicKey);
    fs.writeFileSync(certPath, basicCert);
  }
}

function logEndpoints(baseUrl: string): void {
  const logger = new Logger('Endpoints');
  
  logger.log('📍 Available endpoints:');
  logger.log(`   Health: ${baseUrl}/api/health`);
  logger.log(`   Vessels: ${baseUrl}/api/vessels`);
  logger.log(`   VTS: ${baseUrl}/api/vts`);
  logger.log(`   AtoN: ${baseUrl}/api/aton`);
  logger.log(`   WebSocket: ${baseUrl.replace('/api', '')}/socket.io/`);
}

// ✅ Graceful shutdown handlers
const gracefulShutdown = (signal: string) => {
  console.log(`🛑 ${signal} received, shutting down gracefully`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
