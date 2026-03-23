const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const forge = require('node-forge');

if (!fs.existsSync('./certs')) fs.mkdirSync('./certs');

const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

const attrs = [{ name: 'commonName', value: 'localhost' }];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey);

const pemCert = forge.pki.certificateToPem(cert);
const pemKey = forge.pki.privateKeyToPem(keys.privateKey);

fs.writeFileSync('./certs/server.cert', pemCert);
fs.writeFileSync('./certs/server.key', pemKey);

console.log('Certificats générés avec node-forge.');
