# Le Manoir des Pétales — Bot Discord

## Installation

### 1. Prérequis

- [Node.js](https://nodejs.org/) v18 ou supérieur
- Un compte Discord Developer ([discord.com/developers](https://discord.com/developers))
- Une clé API Groq ([console.groq.com](https://console.groq.com))

### 2. Cloner et installer

```bash
cd "le-manoir-des-p-tales"
npm install
```

### 3. Configurer les variables d'environnement

Copie `.env.example` en `.env` :

```bash
cp .env.example .env
```

Puis remplis `.env` :

```
DISCORD_TOKEN=ton_token_discord
GROQ_API_KEY=ta_cle_groq
```

#