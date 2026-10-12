import { argon2id } from "hash-wasm";

export interface EncryptedPayload {
  iv: string; // Base64 encoded
  ciphertext: string; // Base64 encoded
  tag: string; // Base64 encoded
}

export class CryptoEngine {
  /**
   * Derives a Master Encryption Key using Argon2id.
   * This key should be kept entirely in-memory and never sent to the server.
   */
  static async deriveMasterKey(password: string, salt: Uint8Array, extractable = false): Promise<CryptoKey> {
    const rawKey = await argon2id({
      password,
      salt,
      parallelism: 1,
      iterations: 3,
      memorySize: 65536, // 64 MB
      hashLength: 32, // 256 bits for AES-256
      outputType: "binary",
    });

    return await window.crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      extractable, // Only legacy migration temporarily exports the key
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Generates a random Document Encryption Key (DEK).
   */
  static async generateDEK(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true, // extractable so we can share it via ECDH
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Generates an ECDH Key Pair for intra-domain document sharing.
   */
  static async generateECDHKeyPair(): Promise<CryptoKeyPair> {
    return await window.crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey", "deriveBits"]
    );
  }

  /**
   * Encrypts plaintext data using AES-256-GCM.
   * Splits the WebCrypto output into ciphertext and auth tag for Firestore schema compliance.
   */
  static async encryptPayload(plaintext: Uint8Array, key: CryptoKey): Promise<EncryptedPayload> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for GCM

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128,
      },
      key,
      plaintext
    );

    const encryptedArray = new Uint8Array(encryptedBuffer);
    
    // WebCrypto appends the 16-byte authentication tag to the end of the ciphertext
    const tagLengthBytes = 16;
    const ciphertext = encryptedArray.slice(0, encryptedArray.length - tagLengthBytes);
    const tag = encryptedArray.slice(encryptedArray.length - tagLengthBytes);

    return {
      iv: this.bufferToBase64(iv),
      ciphertext: this.bufferToBase64(ciphertext),
      tag: this.bufferToBase64(tag),
    };
  }

  /**
   * Decrypts an AES-256-GCM payload.
   */
  static async decryptPayload(payload: EncryptedPayload, key: CryptoKey): Promise<Uint8Array> {
    const iv = this.base64ToBuffer(payload.iv);
    const ciphertext = this.base64ToBuffer(payload.ciphertext);
    const tag = this.base64ToBuffer(payload.tag);

    // Recombine ciphertext and tag for WebCrypto
    const combinedBuffer = new Uint8Array(ciphertext.length + tag.length);
    combinedBuffer.set(ciphertext, 0);
    combinedBuffer.set(tag, ciphertext.length);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128,
      },
      key,
      combinedBuffer
    );

    return new Uint8Array(decryptedBuffer);
  }

  /**
   * Derives a shared AES-GCM key using our private ECDH key and their public ECDH key.
   */
  static async deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
    return await window.crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: publicKey,
      },
      privateKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Exports a CryptoKey to raw base64 for storage/transmission.
   */
  static async exportKeyToBase64(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return this.bufferToBase64(new Uint8Array(exported));
  }

  /**
   * Imports a raw base64 AES-GCM key.
   */
  static async importAESKeyFromBase64(base64: string, extractable = true): Promise<CryptoKey> {
    const rawKey = this.base64ToBuffer(base64);
    return await window.crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM" },
      extractable,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Exports a public ECDH key to SPKI format (base64) for Firestore storage.
   */
  static async exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("spki", key);
    return this.bufferToBase64(new Uint8Array(exported));
  }

  /**
   * Imports a public ECDH key from SPKI format (base64).
   */
  static async importPublicKey(base64: string): Promise<CryptoKey> {
    const rawKey = this.base64ToBuffer(base64);
    return await window.crypto.subtle.importKey(
      "spki",
      rawKey,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [] // Public keys cannot be used for deriveKey directly, only passed as public param
    );
  }

  // --- Utility functions ---

  static bufferToBase64(buffer: Uint8Array): string {
    const binString = Array.from(buffer, (x) => String.fromCharCode(x)).join("");
    return btoa(binString);
  }

  static base64ToBuffer(base64: string): Uint8Array {
    const binString = atob(base64);
    return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
  }

  static encodeText(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  static decodeText(buffer: Uint8Array): string {
    return new TextDecoder().decode(buffer);
  }
}

