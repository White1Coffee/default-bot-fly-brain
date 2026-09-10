# Mineflayer Default Bot

Dit is een zelfstandige versie van de productie-bot. De repository heeft geen Hub of gedeelde `Bots/node_modules` nodig en bewaart zijn instellingen, knowledge en world memory lokaal.

## Vereisten

- Windows, Linux of macOS
- Node.js 22 of nieuwer
- Een Minecraft Java-server die past bij de ingestelde authenticatiemethode

## Installeren

Windows:

```bat
setup.cmd
```

Alle platformen:

```bash
npm ci
```

`node_modules` staat na installatie lokaal in deze map. De map wordt bewust niet naar GitHub gestuurd: `package-lock.json` legt de reproduceerbare dependencies vast.

## Configureren

Kopieer bij een handmatige installatie eerst het voorbeeld en pas daarna `bot-settings.json` aan. `setup.cmd` en `start.cmd` doen dit automatisch wanneer het bestand ontbreekt.

```powershell
Copy-Item bot-settings.example.json bot-settings.json
```

Configureer vervolgens:

- `host` en `port`: Minecraft-server;
- `username`: botnaam;
- `auth`: `offline` of `microsoft`;
- `version`: Minecraft-versie;
- `ownerPlayer`: speler die alle commando's mag geven;
- `whitelistedPlayers`: aanvullende spelers die commando's mogen geven.

Er worden geen wachtwoorden of Microsoft-tokens in deze configuratie opgeslagen. Microsoft-authenticatie maakt lokaal de genegeerde map `microsoft-auth` aan.

Omgevingsvariabelen zoals `MC_HOST`, `MC_PORT`, `MC_USERNAME`, `MC_AUTH`, `MC_VERSION`, `PORT` en `VIEWER_PORT` overschrijven de JSON-instellingen. `.env.example` is documentatie; exporteer deze waarden in je shell of startscript wanneer je ze wilt gebruiken.

## Starten

Windows:

```bat
start.cmd
```

Alle platformen:

```bash
npm start
```

Standaard gebruikt de bot:

- Minecraft: `localhost:25565`;
- username: `default-bot`;
- authenticatie: `offline`;
- HUD: `http://localhost:3000`;
- viewer: poort `3001`, alleen automatisch gestart met `VIEWER_AUTOSTART=1`.

## Testen

```bash
npm test
```

De tests gebruiken mocks en vereisen geen publieke Minecraft-server of Microsoft-login.

## Permanente en lokale gegevens

Tijdens gebruik ontstaan onder meer `bot-settings.json`, `knowledge/*.json`, `worlds/*.json`, `ai-memory.json`, `ai-recipes.json`, backups en authenticatiecache. Deze bestanden staan in `.gitignore`, zodat een repository geen persoonlijke servergegevens, werelddata of loginmateriaal publiceert. Alleen `bot-settings.example.json` hoort in GitHub.

## Knowledge mergen

```bash
npm run merge-knowledge -- pad/naar/knowledge-a pad/naar/knowledge-b pad/naar/merged
```

Stop bots voordat knowledgebestanden worden vervangen of gemerged.
