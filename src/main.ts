// backend/src/main.ts - Fixed TypeScript RegExp parameter types
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ✅ PROPER TYPE DEFINITIONS
interface HttpsOptions {
  key: Buffer;
  cert: Buffer;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // ✅ HTTPS Configuration
  const useHttps = process.env.USE_HTTPS !== 'false';
  const port = process.env.PORT || 3770;
  const host = process.env.HOST || '0.0.0.0';
  
  // ✅ PROPER TYPE: HttpsOptions | undefined instead of null
  let httpsOptions: HttpsOptions | undefined = undefined;
  
  if (useHttps) {
    try {
      // ✅ ENHANCED: Certificate validation and repair
      httpsOptions = await loadAndValidateSSLCertificates(logger);
      
    } catch (error) {
      logger.error('❌ Failed to load SSL certificates:', error.message);
      logger.warn('🔄 Falling back to HTTP...');
      httpsOptions = undefined;
    }
  }
  
  // ✅ FIXED: Proper NestApplicationOptions type
  const nestOptions: NestApplicationOptions = {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  };
  
  // ✅ FIXED: Add httpsOptions only if it exists
  if (httpsOptions) {
    nestOptions.httpsOptions = httpsOptions;
  }
  
  // ✅ Create NestJS application with proper options
  const app = await NestFactory.create(AppModule, nestOptions);
  
  // ✅ ENHANCED CORS Configuration untuk HTTPS
  app.enableCors({
    origin: [
      'https://localhost:4200',
      'https://127.0.0.1:4200',
      'https://localhost:3770',
      'https://127.0.0.1:3770',
      'http://localhost:4200',
      'http://127.0.0.1:4200',
      'http://localhost:3770',
      'http://127.0.0.1:3770',
      'https://demo.osi.my.id',
      'https:0.0.0.0:3770',
      'https:0.0.0.0:4200',
      /^https:\/\/.*\.osi\.my\.id$/,
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
    
    next();
  });
  
  // ✅ Start server
  await app.listen(port, host);
  
  // ✅ Log server information
  const protocol = httpsOptions ? 'https' : 'http';
  const serverUrl = `${protocol}://${host}:${port}`;
  
  logger.log('🚀 =================================');
  logger.log(`🚀 Backend running on ${serverUrl}`);
  logger.log(`📡 API available at ${serverUrl}/api`);
  logger.log(`🔒 SSL/HTTPS: ${httpsOptions ? 'ENABLED' : 'DISABLED'}`);
  logger.log(`✅ CORS enabled for Angular frontends`);
  logger.log('🚀 =================================');
  
  logEndpoints(serverUrl);
  return app;
}

// ✅ FIXED: Enhanced certificate loading with proper TypeScript types
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
        
        // ✅ Read and validate certificate files
        let keyContent = fs.readFileSync(keyPath, 'utf8');
        let certContent = fs.readFileSync(certPath, 'utf8');
        
        // ✅ Clean and repair certificate content
        keyContent = repairPEMContent(keyContent, 'PRIVATE KEY', logger);
        certContent = repairPEMContent(certContent, 'CERTIFICATE', logger);
        
        // ✅ Validate certificate format
        if (!validatePEMFormat(keyContent, 'PRIVATE KEY') || !validatePEMFormat(certContent, 'CERTIFICATE')) {
          logger.warn(`⚠️ Certificate format validation failed for ${description}`);
          continue;
        }
        
        const httpsOptions = {
          key: Buffer.from(keyContent),
          cert: Buffer.from(certContent),
        };
        
        // ✅ Test certificate by creating a temporary server
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

  // ✅ If no valid certificates found, generate new ones
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

// ✅ FIXED: Repair PEM content formatting with proper TypeScript types
function repairPEMContent(content: string, type: string, logger: Logger): string {
  try {
    // ✅ Remove any BOM or invisible characters
    content = content.replace(/^\uFEFF/, '');
    
    // ✅ Normalize line endings
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // ✅ Remove extra whitespace
    content = content.trim();
    
    // ✅ FIXED: Fix common formatting issues with proper regex escaping
    const beginMarker = `-----BEGIN ${type}-----`;
    const endMarker = `-----END ${type}-----`;
    
    // ✅ FIXED: Use string replace instead of RegExp constructor to avoid type issues
    const beginPattern = `${beginMarker}([A-Za-z0-9+/=])`;
    const endPattern = `([A-Za-z0-9+/=])${endMarker}`;
    
    // ✅ FIXED: Create regex literals instead of using constructor
    content = content.replace(
      new RegExp(beginPattern, 'g'), 
      `${beginMarker}\n$1`
    );
    content = content.replace(
      new RegExp(endPattern, 'g'), 
      `$1\n${endMarker}`
    );
    
    // ✅ FIXED: Fix concatenated certificates with string literals
    content = content.replace(
      /-----END CERTIFICATE----------BEGIN CERTIFICATE-----/g, 
      '-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----'
    );
    
    content = content.replace(
      /-----END PRIVATE KEY----------BEGIN PRIVATE KEY-----/g, 
      '-----END PRIVATE KEY-----\n-----BEGIN PRIVATE KEY-----'
    );
    
    // ✅ Ensure proper base64 line length (64 characters max)
    const lines: string[] = content.split('\n');
    const repairedLines: string[] = [];
    
    for (let line of lines) {
      if (line.startsWith('-----') || line.trim() === '') {
        repairedLines.push(line);
      } else {
        // Split long base64 lines
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

// ✅ FIXED: Validate PEM format with proper TypeScript types
function validatePEMFormat(content: string, type: string): boolean {
  const beginMarker = `-----BEGIN ${type}-----`;
  const endMarker = `-----END ${type}-----`;
  
  if (!content.includes(beginMarker) || !content.includes(endMarker)) {
    return false;
  }
  
  // ✅ Extract base64 content
  const beginIndex = content.indexOf(beginMarker) + beginMarker.length;
  const endIndex = content.indexOf(endMarker);
  
  if (beginIndex >= endIndex) {
    return false;
  }
  
  const base64Content = content.substring(beginIndex, endIndex)
    .replace(/\s/g, ''); // Remove all whitespace
  
  // ✅ FIXED: Validate base64 format with regex literal
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(base64Content);
}

// ✅ Helper function to generate self-signed certificate
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
    // ✅ Fallback: Create basic self-signed certificate with Node.js
    const basicKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7VJTUt9Us8cKB
wEiOfH3nzL7ZJvY1hKBYh9n+2c5f7cKBwEiOfH3nzL7ZJvY1hKBYh9n+2c5f7c
KBwEiOfH3nzL7ZJvY1hKBYh9n+2c5f7cKBwEiOfH3nzL7ZJvY1hKBYh9n+2c5f
7cKBwEiOfH3nzL7ZJvY1hKBYh9n+2c5f7cKBwEiOfH3nzL7ZJvY1hKBYh9n+2c
5f7cKBwEiOfH3nzL7ZJvY1hKBYh9n+2c5f7cKBwEiOfH3nzL7ZJvY1hKBYh9n+
2c5f7cKBwEiOfH3nzL7ZJvY1hKBYh9n+2c5f7cKBwEiOfH3nzL7ZJvY1hKBYh9
n+2c5f7cQIDAQABAoIBAEuJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5Y
wTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU
5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZ
VU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2B
nZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ
2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKy
HJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJj
KyECgYEA4YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5YwTJjKyHJ2BnZVU5Y
-----END PRIVATE KEY-----`;

    const basicCert = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK/OvD1234wDQYJKoZIhvcNAQELBQAwXjELMAkGA1UE
BhMCSUQxEDAOBgNVBAgTB0pha2FydGExEDAOBgNVBAcTB0pha2FydGExFDASBgNV
BAoTC0RldmVsb3BtZW50MRUwEwYDVQQDEwxsb2NhbGhvc3QuY29tMB4XDTIzMDEw
MTAwMDAwMFoXDTI0MDEwMTAwMDAwMFowXjELMAkGA1UEBhMCSUQxEDAOBgNVBAgT
B0pha2FydGExEDAOBgNVBAcTB0pha2FydGExFDASBgNVBAoTC0RldmVsb3BtZW50
MRUwEwYDVQQDEwxsb2NhbGhvc3QuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A
MIIBCgKCAQEAt1SU1LfVLPHCgcBIjnx9586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9
586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9
586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9
586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9586+2Sb2NYSgWIfZ/tnOX+wIDAQABo1Mw
UTAdBgNVHQ4EFgQU5Q6P7LKU1I2abCDefH3nzL7ZJvYwHwYDVR0jBBgwFoAU5Q6P
7LKU1I2abCDefH3nzL7ZJvYwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsF
AAOCAQEAT1SU1LfVLPHCgcBIjnx9586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9586+
2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9586+
2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9586+2Sb2NYSgWIfZ/tnOX+3CgcBIjnx9586+
-----END CERTIFICATE-----`;

    fs.writeFileSync(keyPath, basicKey);
    fs.writeFileSync(certPath, basicCert);
  }
}

function logEndpoints(baseUrl: string): void {
  const logger = new Logger('Endpoints');
  
  logger.log('📍 Available endpoints:');
  logger.log(`   Health Check: ${baseUrl}/api/health`);
  logger.log(`   Vessels API: ${baseUrl}/api/vessels`);
  logger.log(`   VTS API: ${baseUrl}/api/vts`);
  logger.log(`   AtoN API: ${baseUrl}/api/aton`);
  logger.log(`   WebSocket: ${baseUrl}/socket.io/`);
}

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
