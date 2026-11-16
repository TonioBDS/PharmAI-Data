#!/usr/bin/env node
/**
 * Vérifie un manifeste signé avec les clés publiques de scripts/keys.json (celles de l'app).
 * Empêche de publier un manifeste que les téléphones refuseraient (secret et clé désaccordés).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openManifest } from './sign.mjs';

const { keys } = JSON.parse(readFileSync(join(import.meta.dirname, 'keys.json'), 'utf8'));
try {
  const manifest = openManifest(JSON.parse(readFileSync(process.argv[2], 'utf8')), keys);
  console.log('Signature valide :', Object.keys(manifest.files).join(', '));
} catch (err) {
  console.error(`Manifeste refusé : ${err.message}. Le secret PHARMAI_DATA_SIGNING_KEY ne correspond pas à une clé de scripts/keys.json.`);
  process.exit(1);
}
