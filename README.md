# PneusVentura Gestionale — programma per Mac e Windows

Il gestionale PneusVentura come app desktop con supporto hardware (stampante fiscale RCH, stampa diretta).

## Scarica

Si scarica dal gestionale, pagina **Scarica l'app**. Link diretti all'ultima versione:

| Sistema | File | Link |
|---------|------|------|
| Mac (Apple Silicon M1/M2/M3/M4) | `.dmg` | [Scarica](https://github.com/gianmarcoventura66-sys/pneusventura-app/releases/latest/download/PneusVentura-Mac-AppleSilicon.dmg) |
| Mac (Intel, fino al 2020) | `.dmg` | [Scarica](https://github.com/gianmarcoventura66-sys/pneusventura-app/releases/latest/download/PneusVentura-Mac-Intel.dmg) |
| Windows 10/11 (64 bit) | `.exe` | [Scarica](https://github.com/gianmarcoventura66-sys/pneusventura-app/releases/latest/download/PneusVentura-Windows.exe) |

## Indirizzo dinamico

L'app **non ha l'URL del gestionale scritto fisso nel codice**. All'avvio legge [`indirizzo.json`](indirizzo.json) da questo repository per sapere dove puntare.

Questo permette di cambiare piattaforma (Netlify, Vercel, dominio custom) senza toccare l'app: basta aggiornare `indirizzo.json` e al prossimo avvio l'app si adatta da sola.

### Come funziona

1. L'app si avvia e carica l'ultimo indirizzo noto dalla cache locale
2. In parallelo, scarica `indirizzo.json` da GitHub
3. Se l'URL e' cambiato, ricarica automaticamente la pagina
4. Se la rete non c'e', usa la cache locale
5. Se non c'e' neanche la cache, usa il fallback hardcoded

### Cambiare piattaforma

Per passare a un nuovo URL (es. da Netlify a Vercel):

```bash
# Leggi lo SHA attuale
SHA=$(gh api repos/gianmarcoventura66-sys/pneusventura-app/contents/indirizzo.json --jq '.sha')

# Aggiorna con il nuovo URL
CONTENT=$(echo -n '{"url":"https://NUOVO-INDIRIZZO.app"}' | base64 -w 0)
gh api repos/gianmarcoventura66-sys/pneusventura-app/contents/indirizzo.json \
  -X PUT -f message="Switch a nuovo indirizzo" -f content="$CONTENT" -f sha="$SHA"
```

Tutte le app desktop si aggiorneranno al prossimo avvio.

## Architettura

L'app e' un guscio Electron che apre il gestionale web in una finestra nativa. Il codice del gestionale non e' duplicato: vive sul server e si aggiorna ogni giorno. L'app si riscarica solo quando cambia il guscio (stampa, registratore, interfaccia).

**Cosa aggiunge rispetto al browser:**
- Finestra dedicata che ricorda posizione e dimensione
- Comunicazione diretta con il registratore fiscale RCH (HTTP e TCP)
- Stampa nativa
- Avvio automatico all'accensione del computer
- Schermata offline in italiano (invece del dinosauro di Chrome)

**Sicurezza:** la pagina web gira in sandbox (`contextIsolation: true`, `nodeIntegration: false`). Puo' solo usare le API esposte in `preload.js` tramite `contextBridge` — una per una, mai accesso libero a Node o al filesystem.