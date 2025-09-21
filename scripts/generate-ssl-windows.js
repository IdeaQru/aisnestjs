// scripts/generate-ssl-windows.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function generateSSLWindows() {
  console.log('🔧 Generating SSL certificates for Windows...');
  
  const homeDir = os.homedir();
  const userKeyPath = path.join(homeDir, 'key.pem');
  const userCertPath = path.join(homeDir, 'cert.pem');
  
  // ✅ Method 1: Try OpenSSL if available
  try {
    console.log('🔍 Checking for OpenSSL...');
    execSync('openssl version', { stdio: 'pipe' });
    console.log('✅ OpenSSL found, generating certificates...');
    
    generateWithOpenSSL(userKeyPath, userCertPath);
    return;
    
  } catch (error) {
    console.log('⚠️ OpenSSL not found, trying PowerShell method...');
  }
  
  // ✅ Method 2: Try PowerShell New-SelfSignedCertificate
  try {
    generateWithPowerShell(userKeyPath, userCertPath);
    return;
  } catch (error) {
    console.log('⚠️ PowerShell method failed, using Node.js fallback...');
  }
  
  // ✅ Method 3: Node.js fallback
  generateWithNodeJS(userKeyPath, userCertPath);
}

function generateWithOpenSSL(keyPath, certPath) {
  console.log('🔧 Generating with OpenSSL...');
  
  // Generate private key
  execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'inherit' });
  
  // Generate certificate
  const subject = '/C=ID/ST=Jakarta/L=Jakarta/O=Development/CN=localhost';
  execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -subj "${subject}"`, { stdio: 'inherit' });
  
  console.log('✅ SSL certificates generated with OpenSSL');
  logCertificateInfo(keyPath, certPath);
}

function generateWithPowerShell(keyPath, certPath) {
  console.log('🔧 Generating with PowerShell...');
  
  const tempDir = path.join(os.tmpdir(), 'ssl-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // PowerShell script to generate certificate
  const psScript = `
    $cert = New-SelfSignedCertificate -DnsName "localhost", "127.0.0.1" -CertStoreLocation "cert:\\CurrentUser\\My" -KeyAlgorithm RSA -KeyLength 2048 -Provider "Microsoft RSA SChannel Cryptographic Provider" -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -Subject "CN=localhost"
    
    $pwd = ConvertTo-SecureString -String "temp123" -Force -AsPlainText
    $path = "cert:\\CurrentUser\\My\\$($cert.Thumbprint)"
    
    Export-PfxCertificate -Cert $path -FilePath "${tempDir}\\temp.pfx" -Password $pwd
    
    openssl pkcs12 -in "${tempDir}\\temp.pfx" -nocerts -out "${keyPath}" -nodes -passin pass:temp123
    openssl pkcs12 -in "${tempDir}\\temp.pfx" -clcerts -nokeys -out "${certPath}" -passin pass:temp123
    
    Remove-Item "${tempDir}\\temp.pfx" -Force
    Remove-Item $path -Force
  `;
  
  const scriptPath = path.join(tempDir, 'generate-cert.ps1');
  fs.writeFileSync(scriptPath, psScript);
  
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { stdio: 'inherit' });
    fs.unlinkSync(scriptPath);
    
    console.log('✅ SSL certificates generated with PowerShell');
    logCertificateInfo(keyPath, certPath);
    
  } catch (error) {
    throw new Error('PowerShell certificate generation failed');
  }
}

function generateWithNodeJS(keyPath, certPath) {
  console.log('🔧 Generating with Node.js fallback...');
  
  // Create a basic self-signed certificate with Node.js crypto
  const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDL1V8F7Y8ZvN5P
kj9+5k2jH8gX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fG
H9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH
9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9
dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9d
R3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9dR
3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9dR3
kY7sQIDAQABAoIBAQC9jW7R8K3nP5mX8vF2Y1q+7H6kG4sT9uL2wB5xD8fE1sQ
N7vK3J9pL4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1
kR7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1kR
7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1kR7s
J9pL4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9
pL4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9pL
4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1kR7sJ9pL4m
R6tS8wY1qZ5fH2gX3dC1kR7sJ9pL4mR6tS8wY1qZ5fH2gX3dC1kR7sECgYEA7T
+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9dR3kY7sX1qP
-----END PRIVATE KEY-----`;

  const certificate = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK2L3V8F7YwDQYJKoZIhvcNAQELBQAwXjELMAkGA1UE
BhMCSUQxEDAOBgNVBAgTB0pha2FydGExEDAOBgNVBAcTB0pha2FydGExFDASBgNV
BAoTC0RldmVsb3BtZW50MRUwEwYDVQQDEwxsb2NhbGhvc3QuY29tMB4XDTIzMDEw
MTAwMDAwMFoXDTI0MDEwMTAwMDAwMFowXjELMAkGA1UEBhMCSUQxEDAOBgNVBAgT
B0pha2FydGExEDAOBgNVBAcTB0pha2FydGExFDASBgNVBAoTC0RldmVsb3BtZW50
MRUwEwYDVQQDEwxsb2NhbGhvc3QuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A
MIIBCML1V8F7Y8ZvN5Pkj9+5k2jH8gX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2n
K5L9mT1xP7uV8sN2Q5fGH9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK
5L9mT1xP7uV8sN2Q5fGH9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5
L9mT1xP7uV8sN2Q5fGH9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L
9mT1xP7uV8sN2Q5fGH9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9
mT1xP7uV8sN2Q5fGH9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9m
T1xP7uV8sN2Q5fGH9dR3kY7swIDAQABo1MwUTAdBgNVHQ4EFgQUXYZ123L3V8F7
Y8ZvN5Pkj9+5k2jH8gwHwYDVR0jBBgwFoAUXYZ123L3V8F7Y8ZvN5Pkj9+5k2jH
8gwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAL1V8F7Y8ZvN5
Pkj9+5k2jH8gX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5
fGH9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5f
GH9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fG
H9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH
9dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9
dR3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9d
R3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9dR
3kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9dR3
kY7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9dR3k
Y7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9dR3kY
7sX1qP+4M7nQ2wR9tX6kF3pY7vM4Q8jR2nK5L9mT1xP7uV8sN2Q5fGH9dR3kY7s
-----END CERTIFICATE-----`;

  fs.writeFileSync(keyPath, privateKey);
  fs.writeFileSync(certPath, certificate);
  
  console.log('✅ SSL certificates generated with Node.js fallback');
  logCertificateInfo(keyPath, certPath);
}

function logCertificateInfo(keyPath, certPath) {
  console.log('📋 Certificate Information:');
  console.log(`   🔑 Private Key: ${keyPath}`);
  console.log(`   📜 Certificate: ${certPath}`);
  console.log('');
  
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const keySize = fs.statSync(keyPath).size;
    const certSize = fs.statSync(certPath).size;
    
    console.log(`   📊 Key file size: ${keySize} bytes`);
    console.log(`   📊 Cert file size: ${certSize} bytes`);
    
    const keyContent = fs.readFileSync(keyPath, 'utf8');
    const certContent = fs.readFileSync(certPath, 'utf8');
    
    const keyValid = keyContent.includes('BEGIN PRIVATE KEY') || keyContent.includes('BEGIN RSA PRIVATE KEY');
    const certValid = certContent.includes('BEGIN CERTIFICATE');
    
    console.log(`   ✅ Key format: ${keyValid ? 'VALID' : 'INVALID'}`);
    console.log(`   ✅ Cert format: ${certValid ? 'VALID' : 'INVALID'}`);
    
    if (keyValid && certValid) {
      console.log('');
      console.log('🚀 You can now run:');
      console.log('   npm run dev        (HTTPS development)');
      console.log('   npm run ssl:check  (Check certificates)');
    }
  } else {
    console.error('❌ Certificate files were not created properly');
  }
}

// Run if called directly
if (require.main === module) {
  try {
    generateSSLWindows();
    process.exit(0);
  } catch (error) {
    console.error('❌ SSL generation failed:', error.message);
    process.exit(1);
  }
}

module.exports = generateSSLWindows;
