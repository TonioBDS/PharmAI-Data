#!/usr/bin/env node
/**
 * Note dans status.json la date du dernier contrôle réussi (et de la dernière publication).
 * Ce petit commit hebdomadaire est aussi « l'activité » qui empêche GitHub de suspendre les
 * tâches planifiées d'un dépôt public resté 60 jours sans changement.
 *   node scripts/status.mjs --entry catalog-fr --ok [--published]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(import.meta.dirname, '..', 'status.json');
const args = process.argv.slice(2);
const entry = args[args.indexOf('--entry') + 1];
let status = {};
try {
  status = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  // premier état
}
const now = new Date().toISOString();
status[entry] = { ...(status[entry] ?? {}), lastSuccess: now, ...(args.includes('--published') ? { lastPublished: now } : {}) };
writeFileSync(file, JSON.stringify(status, null, 2) + '\n');
console.log(`${entry} :`, status[entry]);
