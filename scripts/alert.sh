#!/usr/bin/env bash
# Tickets d'alerte : un seul ticket ouvert par donnée (étiquette « alerte »), commenté à chaque
# nouvel échec, refermé à la première réussite. Le propriétaire est mentionné : GitHub lui écrit.
#   alert.sh open <donnée> <message>    (RUN_URL, OWNER dans l'environnement)
#   alert.sh close <donnée>
set -euo pipefail
action=$1 entry=$2
title="Alerte : $entry"
gh label create alerte --color B60205 --description "Échec d'une tâche automatique" >/dev/null 2>&1 || true
number=$(gh issue list --label alerte --state open --search "\"$title\" in:title" --json number --jq '.[0].number // empty')
if [ "$action" = open ]; then
  body="@${OWNER} $3

Exécution : ${RUN_URL}
Date : $(date -u '+%Y-%m-%d %H:%M UTC')

Le détail du contrôle en échec est dans le journal de l'exécution."
  if [ -n "$number" ]; then gh issue comment "$number" --body "$body"; else gh issue create --title "$title" --label alerte --body "$body"; fi
elif [ -n "$number" ]; then
  gh issue close "$number" --comment "Réussite le $(date -u '+%Y-%m-%d %H:%M UTC') : alerte refermée."
fi
