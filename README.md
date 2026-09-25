# WikiMasters Auto-Pulls

Extension Chrome (Manifest V3) qui ouvre automatiquement les paquets disponibles sur
<https://www.wiki-masters.com/pulls> tant que l'onglet est ouvert, pour ne jamais rester
bloqué au plafond de 10 paquets.

Elle pilote l'interface comme un utilisateur (clic sur le paquet, flèches « suivant », « Continuer »).
Elle n'appelle jamais l'API du site directement, ne clique jamais sur les boutons payants
(« Rechargez », « S'abonner au PRO »), et se met en pause si le site demande une vérification humaine.

## Installation

1. Ouvrir `chrome://extensions`.
2. Activer le **Mode développeur** (en haut à droite).
3. Cliquer **Charger l'extension non empaquetée** et choisir ce dossier.
4. Ouvrir <https://www.wiki-masters.com/pulls> (connecté). Un petit bandeau « Auto-Pulls : Actif » apparaît en bas à droite.

## Utilisation

- Laisser l'onglet `/pulls` ouvert (idéalement épinglé ou dans sa propre fenêtre : Chrome ralentit
  les timers des onglets en arrière-plan, mais un cycle de 10 min laisse une large marge).
- Le popup de l'extension (icône dans la barre) permet de mettre en pause / reprendre, et affiche
  l'état, les paquets disponibles, le prochain crédit, le nombre de paquets ouverts et un journal.
- Le badge sur l'icône indique le nombre de paquets ouverts dans la session.
- Si le site affiche une vérification humaine, l'extension se fige, le titre de l'onglet clignote
  et une notification est envoyée : il faut valider manuellement, puis l'extension reprend seule.

## Récap des cartes

Chaque carte révélée est enregistrée localement (`chrome.storage.local`, 1000 dernières cartes) :
rareté, nom, description, ATK / DEF, image et lien Wikipédia.

- Si des paquets ont été ouverts pendant que l'onglet n'était pas visible, un panneau « Pendant ton
  absence » s'affiche au retour sur l'onglet avec la liste des cartes, groupées par paquet. « Fermer »
  marque ces cartes comme vues.
- Le popup montre les 10 dernières cartes.
- « Historique des cartes » ouvre une page complète : recherche, filtre par rareté, export JSON / CSV.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `manifest.json` | Déclaration MV3, content script limité à `/pulls` |
| `content.js` | Machine à états : attente → ouverture → révélation → retour |
| `cards.js` | Capture des cartes révélées, stockage, panneau de récap |
| `history.html` / `history.js` | Page d'historique complet des cartes |
| `background.js` | Badge et notifications |
| `popup.html` / `popup.js` | Interrupteur ON/OFF, stats, journal |
| `icons/` | Icônes |

## Développement

Après modification, cliquer sur l'icône « Recharger » de l'extension dans `chrome://extensions`
puis recharger l'onglet `/pulls`. Les logs sont visibles dans la console de la page (préfixe `[WM-Auto]`).
