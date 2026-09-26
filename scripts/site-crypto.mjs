import { webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const lockConfig = JSON.parse(await readFile(new URL('../web/site-lock-config.json', import.meta.url), 'utf8'))
const encoder = new TextEncoder()

export async function deriveSiteKey(password, config = lockConfig) {
  if (typeof password !== 'string' || !password.length) throw new Error('SITE_PASSWORD is required; refusing to publish an unlocked site')
  const material = await webcrypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(config.salt, 'base64'), iterations: config.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptSiteContent(text, key, kind, config = lockConfig) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`uncsway:${kind}:v1`) }, key, encoder.encode(text))
  return { ...config, iv: Buffer.from(iv).toString('base64'), ciphertext: Buffer.from(ciphertext).toString('base64') }
}

export async function decryptSiteContent(envelope, key, kind) {
  const plaintext = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(envelope.iv, 'base64'), additionalData: encoder.encode(`uncsway:${kind}:v1`) }, key, Buffer.from(envelope.ciphertext, 'base64'))
  return new TextDecoder().decode(plaintext)
}
