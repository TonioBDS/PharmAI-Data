/**
 * Signature Ed25519 des fichiers publiés. Le manifeste est publié sous la forme
 * { keyId, payload, signature } : `payload` = le JSON du manifeste en base64, `signature` =
 * sa signature (base64). L'app vérifie la signature sur les octets de `payload` avec la clé
 * publique qu'elle embarque, puis lit le JSON : aucune ambiguïté de mise en forme.
 *
 * Clé privée : 32 octets (graine Ed25519) en base64, dans le secret PHARMAI_DATA_SIGNING_KEY.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function privateKeyFromSeed(seedBase64) {
  const seed = Buffer.from(seedBase64.trim(), 'base64');
  if (seed.length !== 32) throw new Error('Clé de signature invalide : 32 octets attendus (base64)');
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}

/** Clé publique brute (32 octets, base64), celle qu'embarque l'app. */
export function publicKeyOf(seedBase64) {
  const der = createPublicKey(privateKeyFromSeed(seedBase64)).export({ format: 'der', type: 'spki' });
  return Buffer.from(der.subarray(SPKI_PREFIX.length)).toString('base64');
}

export function generateSeed() {
  const { privateKey } = generateKeyPairSync('ed25519');
  const der = privateKey.export({ format: 'der', type: 'pkcs8' });
  return Buffer.from(der.subarray(PKCS8_PREFIX.length)).toString('base64');
}

export function signManifest(manifest, seedBase64, keyId) {
  const payload = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  const signature = sign(null, payload, privateKeyFromSeed(seedBase64));
  return { keyId, payload: payload.toString('base64'), signature: signature.toString('base64') };
}

/** Vérifie et ouvre un manifeste signé ; lève une erreur si la signature ne correspond pas. */
export function openManifest(signed, publicKeys) {
  const raw = publicKeys[signed.keyId];
  if (!raw) throw new Error(`Clé inconnue : ${signed.keyId}`);
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(raw, 'base64')]), format: 'der', type: 'spki' });
  const payload = Buffer.from(signed.payload, 'base64');
  if (!verify(null, payload, key, Buffer.from(signed.signature, 'base64'))) throw new Error('Signature invalide');
  return JSON.parse(payload.toString('utf8'));
}

/** Contenu d'un manifeste signé, sans vérification (pour relire la version précédente en CI). */
export function readPayload(signed) {
  return JSON.parse(Buffer.from(signed.payload, 'base64').toString('utf8'));
}
