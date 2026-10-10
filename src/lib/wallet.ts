import { secp256k1 } from '@noble/curves/secp256k1.js'
import { blake2b } from 'blakejs'
import bs58 from 'bs58'
import sha3 from 'js-sha3'

const { keccak256 } = sha3

export type RholoxWallet = {
  privateKey: string
  publicKey: string
  ethAddress: string
  revAddress: string
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '').trim()
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('Expected an even-length hex string.')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function walletFromPrivateKey(input: string): RholoxWallet {
  const privateKey = input.replace(/^0x/, '').trim().toLowerCase()
  if (privateKey.length !== 64) throw new Error('Private key must be 32 bytes (64 hex characters).')

  const privateKeyBytes = hexToBytes(privateKey)
  if (!secp256k1.utils.isValidSecretKey(privateKeyBytes)) {
    throw new Error('Private key is outside the secp256k1 key space.')
  }

  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false)
  const publicKey = bytesToHex(publicKeyBytes)
  const publicKeyHash = keccak256(publicKeyBytes.slice(1))
  const ethHex = publicKeyHash.slice(-40)
  const ethBytes = hexToBytes(ethHex)
  const revHash = hexToBytes(keccak256(ethBytes))
  const payload = concatBytes(new Uint8Array([0, 0, 0, 0]), revHash)
  const checksum = blake2b(payload, undefined, 32).slice(0, 4)
  const revAddress = bs58.encode(concatBytes(payload, checksum))

  return {
    privateKey,
    publicKey,
    ethAddress: `0x${ethHex}`,
    revAddress,
  }
}

export function createWallet(): RholoxWallet {
  return walletFromPrivateKey(bytesToHex(secp256k1.utils.randomSecretKey()))
}
