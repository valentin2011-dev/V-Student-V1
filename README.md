[README.md](https://github.com/user-attachments/files/31553711/README.md)
# V-Student V1 — Google Classroom + Calendar

Projet **perso** de test. La V1 fait une seule chose : se connecter à ton compte Google et afficher les cours/devoirs Google Classroom + les événements Google Calendar dans une interface personnalisée.

## ⚠️ Important

- Ne mets **jamais** `.env` ou un `client_secret` Google sur GitHub.
- Cette V1 utilise OAuth 2.0 et demande uniquement des accès en lecture.
- Aucun devoir n'est créé, modifié, rendu ou supprimé.
- Le test se fait d'abord en local sur `http://localhost:3000`.

Google recommande justement de garder le secret OAuth hors du dépôt quand le projet est partagé sur GitHub.

## 1. Installer

Il faut Node.js installé.

```bash
npm install
```

## 2. Créer le projet Google

Va dans Google Cloud Console :

https://console.cloud.google.com/

Crée un projet (par exemple `V-Student V1`).

Dans **APIs & Services > Library**, active :

- Google Classroom API
- Google Calendar API

Puis dans **APIs & Services > Credentials** :

1. Configure l'écran de consentement OAuth si Google le demande.
2. Crée un **OAuth Client ID**.
3. Type : **Web application**.
4. Ajoute exactement cette URI de redirection :

```text
http://localhost:3000/oauth2callback
```

Télécharge/recopie le Client ID et le Client Secret.

## 3. Configurer `.env`

Copie `.env.example` vers `.env` :

```bash
cp .env.example .env
```

Puis remplis :

```env
PORT=3000
SESSION_SECRET=une-longue-valeur-aleatoire
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
```

## 4. Lancer

```bash
npm start
```

Puis ouvre :

http://localhost:3000

Clique **Continuer avec Google**.

## 5. Le test important pour ton compte scolaire

Utilise ton compte scolaire Google.

Si Google te laisse accepter les autorisations et que le dashboard se charge :

✅ ton compte scolaire autorise cette intégration.

Si tu obtiens un message du genre :

- administrateur de votre organisation
- accès bloqué
- l'administrateur doit approuver cette application
- Google Workspace policy

❌ ce n'est probablement pas ton code qui est en cause : l'administrateur de l'école bloque l'accès OAuth/API.

Dans ce cas, on pourra changer de stratégie.

## 6. Ce que la V1 récupère

### Classroom
- cours actifs
- devoirs publiés
- titre
- description
- date/heure limite
- lien vers le devoir

### Calendar
- événements des 60 prochains jours
- titre
- date/heure
- lien vers l'événement

## 7. Architecture

```text
Google OAuth
     ↓
Node.js / Express
     ↓
Google Classroom API + Google Calendar API
     ↓
V-Student PWA
```

Le navigateur ne reçoit pas le Client Secret.

## 8. GitHub

Tu peux mettre le projet sur GitHub **sans `.env`**.

Le `.gitignore` est déjà configuré pour éviter de pousser :

- `.env`
- `node_modules`
- credentials
- tokens

## 9. Après le test

Si ça fonctionne, V2 pourra ajouter par exemple :

- vrai calendrier hebdomadaire
- filtres par matière
- devoirs en retard
- statut terminé/non terminé
- notifications
- PWA installable offline pour l'interface
- meilleure gestion des fuseaux horaires
- synchronisation plus intelligente
- design encore plus poussé
