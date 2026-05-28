import * as FileSystem from 'expo-file-system';
import CryptoJS from 'crypto-js';

/**
 * Reads a file, encrypts it with AES-256-CBC, and returns the
 * payload ready to POST as JSON to the backend.
 *
 * @param {string} fileUri   - Local URI from DocumentPicker
 * @param {string} mimeType  - MIME type of the file
 * @param {string} filename  - Original file name
 * @returns {{ encryptedData: string, key: string, iv: string, mimeType: string, filename: string }}
 */
export async function encryptFile(fileUri, mimeType, filename) {
  // 1. Read file as base64
  const base64Data = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 2. Generate random 256-bit key and 128-bit IV (pure JS, no native module needed)
  const keyWA = CryptoJS.lib.WordArray.random(32);
  const ivWA  = CryptoJS.lib.WordArray.random(16);

  const keyHex = keyWA.toString(CryptoJS.enc.Hex);
  const ivHex  = ivWA.toString(CryptoJS.enc.Hex);

  // 3. Encrypt base64 string with AES-256-CBC
  const encrypted = CryptoJS.AES.encrypt(base64Data, keyWA, {
    iv:      ivWA,
    mode:    CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    encryptedData: encrypted.toString(), // Base64-encoded ciphertext
    key:           keyHex,
    iv:            ivHex,
    mimeType,
    filename,
  };
}
