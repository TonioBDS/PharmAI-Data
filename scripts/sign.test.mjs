import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';
import { generateSeed, openManifest, publicKeyOf, readPayload, signManifest } from './sign.mjs';

describe('signature des manifestes', () => {
  const seed = generateSeed();
  const keys = { test: publicKeyOf(seed) };
  const manifest = { format: 1, files: { 'catalog-fr': { version: '2026-11-16', sha256: 'ab' } } };

  it('signe et vérifie', () => {
    const signed = signManifest(manifest, seed, 'test');
    expect(openManifest(signed, keys)).toEqual(manifest);
    expect(readPayload(signed)).toEqual(manifest);
  });

  it('refuse un manifeste modifié ou une clé inconnue', () => {
    const signed = signManifest(manifest, seed, 'test');
    const altered = { ...signed, payload: Buffer.from(JSON.stringify({ ...manifest, format: 2 })).toString('base64') };
    expect(() => openManifest(altered, keys)).toThrow('Signature invalide');
    expect(() => openManifest({ ...signed, keyId: 'autre' }, keys)).toThrow('Clé inconnue');
  });

  it('se vérifie avec tweetnacl, comme dans l’app', () => {
    const signed = signManifest(manifest, seed, 'test');
    const ok = nacl.sign.detached.verify(Buffer.from(signed.payload, 'base64'), Buffer.from(signed.signature, 'base64'), Buffer.from(keys.test, 'base64'));
    expect(ok).toBe(true);
  });
});
