'use strict';

/**
 * CA Certificate Manager
 * Generates and caches a local root CA + per-domain leaf certs for HTTPS MITM.
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CA_DIR = path.join(os.homedir(), '.context-compressor', 'ca');
const CA_CERT_PATH = path.join(CA_DIR, 'ca.crt');
const CA_KEY_PATH = path.join(CA_DIR, 'ca.key');

let caCache = null;
const domainCertCache = new Map();

function generateCA() {
  console.log('🔐 Generating context-compressor root CA certificate...');
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  const attrs = [
    { name: 'commonName', value: 'Context Compressor MITM CA' },
    { name: 'organizationName', value: 'opencode-context-compressor' },
    { name: 'countryName', value: 'US' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  fs.mkdirSync(CA_DIR, { recursive: true });
  fs.writeFileSync(CA_CERT_PATH, forge.pki.certificateToPem(cert), 'utf8');
  fs.writeFileSync(CA_KEY_PATH, forge.pki.privateKeyToPem(keys.privateKey), 'utf8');
  console.log(`✅ Root CA saved to ${CA_CERT_PATH}`);
  return { cert, key: keys.privateKey, certPem: forge.pki.certificateToPem(cert) };
}

function getCA() {
  if (caCache) return caCache;
  if (fs.existsSync(CA_CERT_PATH) && fs.existsSync(CA_KEY_PATH)) {
    const certPem = fs.readFileSync(CA_CERT_PATH, 'utf8');
    caCache = {
      cert: forge.pki.certificateFromPem(certPem),
      key: forge.pki.privateKeyFromPem(fs.readFileSync(CA_KEY_PATH, 'utf8')),
      certPem,
    };
  } else {
    caCache = generateCA();
  }
  return caCache;
}

function getDomainCert(hostname) {
  if (domainCertCache.has(hostname)) return domainCertCache.get(hostname);

  const ca = getCA();
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = (Date.now() + Math.random()).toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

  const attrs = [{ name: 'commonName', value: hostname }];
  cert.setSubject(attrs);
  cert.setIssuer(ca.cert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(ca.key, forge.md.sha256.create());

  const result = {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  };
  domainCertCache.set(hostname, result);
  return result;
}

module.exports = { getCA, getDomainCert, CA_CERT_PATH, CA_DIR };
