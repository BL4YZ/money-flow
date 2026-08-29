const crypto = require('crypto');

/**
 * Hybrid-encryption keypair for /api/upload.
 *
 * The client encrypts the file with a fresh AES-256 key, then encrypts
 * THAT key with this RSA public key (OAEP/SHA-256) before sending both
 * in the same request. Only this server's private key can recover the
 * AES key, so a leaked/logged request body alone is not decryptable —
 * unlike the previous scheme, which sent the raw AES key next to the
 * ciphertext.
 */
let privateKeyObj = null;
let publicKeyPem = null;

function loadKeys() {
  if (privateKeyObj) return;

  const b64 = process.env.UPLOAD_RSA_PRIVATE_KEY_B64;
  if (!b64) {
    throw new Error(
      'UPLOAD_RSA_PRIVATE_KEY_B64 no configurado — generar con: ' +
      `node -e "const{generateKeyPairSync}=require('crypto');const{privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});console.log(privateKey.export({type:'pkcs1',format:'pem'}).toString('base64'))"`
    );
  }

  const pem = Buffer.from(b64, 'base64').toString('utf8');
  privateKeyObj = crypto.createPrivateKey({ key: pem, format: 'pem', type: 'pkcs1' });
  publicKeyPem = crypto
    .createPublicKey(privateKeyObj)
    .export({ type: 'pkcs1', format: 'pem' })
    .toString();
}

function getPublicKeyPem() {
  loadKeys();
  return publicKeyPem;
}

// Decrypts an RSA-OAEP/SHA-256 encrypted AES key (base64) back to a raw Buffer.
function decryptAesKey(encryptedKeyBase64) {
  loadKeys();
  return crypto.privateDecrypt(
    {
      key: privateKeyObj,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encryptedKeyBase64, 'base64')
  );
}

module.exports = { getPublicKeyPem, decryptAesKey };
