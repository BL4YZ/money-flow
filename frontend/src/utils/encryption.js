// Entrypoint `legacy` a proposito. Desde SDK 57 el principal expone la API
// nueva (File/Directory/Paths) y ya NO exporta readAsStringAsync: el import de
// siempre compilaba igual y FileSystem.readAsStringAsync quedaba undefined,
// rompiendo la subida recien cuando el usuario elegia un PDF. La API nueva no
// tiene lectura en base64 (solo arrayBuffer), y convertirlo a mano dentro de
// la ruta de cifrado es riesgo que no hace falta correr. Si algun dia Expo
// saca `legacy`, migrar con un test de subida real, no a ojo.
import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';
import forge from 'node-forge';
import * as Crypto from 'expo-crypto';
import api from '../api/client';

// ─── Randomness ─────────────────────────────────────────────────────
// crypto-js and node-forge both try to source randomness from a native
// `crypto` global that plain React Native/Hermes does not provide — with
// no polyfill, crypto-js throws outright and forge silently falls back to
// weak entropy (timestamp, navigator properties). We sidestep both by
// generating raw bytes with expo-crypto (native CSPRNG) and feeding them
// in explicitly.

function bytesToWordArray(bytes) {
  const words = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function bytesToBinaryString(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return bin;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

let forgeSeeded = false;
async function ensureForgeSeeded() {
  if (forgeSeeded) return;
  const entropy = await Crypto.getRandomBytesAsync(64);
  forge.random.collect(bytesToBinaryString(entropy));
  forgeSeeded = true;
}

// ─── Server RSA public key (cached for the app session) ────────────
let cachedPublicKeyPem = null;
async function getServerPublicKey() {
  if (cachedPublicKeyPem) return cachedPublicKeyPem;
  const { data } = await api.get('/upload/public-key');
  cachedPublicKeyPem = data.publicKey;
  return cachedPublicKeyPem;
}

/**
 * Reads a file, encrypts it with AES-256-CBC using a fresh key, then
 * encrypts that key with the server's RSA public key (RSA-OAEP/SHA-256)
 * so the AES key never travels in a form usable without the server's
 * private key — even if the request body itself is ever logged or
 * intercepted somewhere along the way.
 *
 * @param {string} fileUri   - Local URI from DocumentPicker
 * @param {string} mimeType  - MIME type of the file
 * @param {string} filename  - Original file name
 * @returns {{ encryptedData: string, encryptedKey: string, iv: string, mimeType: string, filename: string }}
 */
export async function encryptFile(fileUri, mimeType, filename) {
  // 1. Read file as base64
  const base64Data = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 2. Generate random 256-bit key and 128-bit IV from a real CSPRNG
  const keyBytes = await Crypto.getRandomBytesAsync(32);
  const ivBytes  = await Crypto.getRandomBytesAsync(16);
  const keyWA = bytesToWordArray(keyBytes);
  const ivWA  = bytesToWordArray(ivBytes);

  // 3. Encrypt base64 string with AES-256-CBC
  const encrypted = CryptoJS.AES.encrypt(base64Data, keyWA, {
    iv:      ivWA,
    mode:    CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // 4. Encrypt the AES key with the server's RSA public key (hybrid encryption)
  await ensureForgeSeeded();
  const publicKeyPem = await getServerPublicKey();
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const encryptedKeyBinary = publicKey.encrypt(bytesToBinaryString(keyBytes), 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });

  return {
    encryptedData: encrypted.toString(), // Base64-encoded AES ciphertext
    encryptedKey:  forge.util.encode64(encryptedKeyBinary), // RSA-OAEP encrypted AES key
    iv:            bytesToHex(ivBytes),
    mimeType,
    filename,
  };
}
