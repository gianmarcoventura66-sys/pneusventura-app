/**
 * Il gestionale come programma Windows.
 *
 * Dentro non c'è una seconda copia del gestionale: c'è una finestra che apre
 * quello vero. È una scelta e non una scorciatoia — il giorno che si corregge
 * un prezzo, chi lavora dal browser e chi lavora dal programma devono vedere
 * la stessa cifra nello stesso momento. Due copie che si aggiornano quando
 * capita sono il modo più veloce per far litigare due persone sullo stesso
 * numero. Ed è anche il motivo per cui il gestionale si aggiorna da solo:
 * questo file cambia raramente, quello che c'è dentro cambia ogni giorno.
 *
 * Quello che il programma aggiunge, e che il browser non può dare:
 *
 *   * una finestra sua che si ricorda dov'era e quanto era grande;
 *   * una schermata di attesa e una di «linea assente» scritte in italiano,
 *     invece del dinosauro di Chrome — al banco, davanti al cliente, la
 *     differenza fra «sta caricando» e «è rotto» la fa quello che c'è scritto;
 *   * un'icona nel menu Start e la voce fra le app installate;
 *   * **la strada verso l'hardware**: stampante fiscale, cassetto, lettore
 *     barcode. Non c'è ancora niente attaccato, ma il ponte sì — ed è tutta
 *     la ragione per cui questo guscio esiste invece della PWA.
 *
 * Il ponte sta in `preload.js` e passa da `contextBridge`: la pagina web non
 * vede Node e non può toccare il computer. Può solo chiedere le cose che il
 * processo principale ha deciso di offrire, una per una. È la differenza fra
 * «il gestionale può stampare» e «il gestionale può fare qualunque cosa sul
 * PC di chi lo apre».
 */

const { app, BrowserWindow, shell, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Dove sta il gestionale.
 *
 * L'indirizzo non è più fisso: all'avvio il programma legge un file da GitHub
 * che dice dove puntare (Vercel, Netlify, o qualunque altra cosa). Se la rete
 * non c'è, usa l'ultimo indirizzo che ha funzionato. Se non ha mai funzionato,
 * prova il fallback qui sotto.
 *
 * Si può forzare con GESTIONALE_URL: serve per provare il programma
 * contro il computer di sviluppo prima di darlo in officina.
 */
const FALLBACK = 'https://pneusventura-gestionale.netlify.app';
const CONFIG_URL = 'https://raw.githubusercontent.com/gianmarcoventura66-sys/pneusventura-app/main/indirizzo.json';
const FILE_INDIRIZZO = () => path.join(app.getPath('userData'), 'indirizzo.json');

let INDIRIZZO = process.env.GESTIONALE_URL || FALLBACK;

/** Legge l'indirizzo dalla cache locale. */
function indirizzoSalvato() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE_INDIRIZZO(), 'utf8'));
    if (d?.url && typeof d.url === 'string') return d.url;
  } catch { /* niente cache */ }
  return null;
}

/** Scarica l'indirizzo da GitHub e lo salva in cache. */
async function aggiornaIndirizzo() {
  if (process.env.GESTIONALE_URL) return; // forzato: non toccare
  try {
    const r = await fetch(CONFIG_URL, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    if (d?.url && typeof d.url === 'string') {
      const nuovo = d.url.replace(/\/+$/, '');
      fs.writeFileSync(FILE_INDIRIZZO(), JSON.stringify({ url: nuovo }, null, 2));
      if (nuovo !== INDIRIZZO) {
        INDIRIZZO = nuovo;
        CASA = new URL(INDIRIZZO).host;
        // Ricarica la pagina col nuovo indirizzo
        if (finestra && !finestra.isDestroyed()) finestra.loadURL(INDIRIZZO);
      }
    }
  } catch {
    // Niente rete: si usa quello che c'è
  }
}

// All'avvio: prima la cache locale, poi si aggiorna da GitHub in sottofondo.
INDIRIZZO = process.env.GESTIONALE_URL || indirizzoSalvato() || FALLBACK;

/** L'host di casa: tutto il resto si apre nel browser, non qui dentro. */
let CASA = new URL(INDIRIZZO).host;

let finestra = null;

// ─────────────────────────────────────────────────────────────────────────────
// Dove era la finestra l'ultima volta
// ─────────────────────────────────────────────────────────────────────────────
//
// Un programma che riapre sempre al centro, sempre della stessa misura, si
// riconosce subito per quello che e': una pagina web travestita. Chi lavora
// mette la finestra dove gli serve — a sinistra, sul secondo schermo, a tutto
// schermo — e se la ritrova li' il giorno dopo.

const FILE_STATO = () => path.join(app.getPath('userData'), 'finestra.json');

function leggiStato() {
  try {
    return JSON.parse(fs.readFileSync(FILE_STATO(), 'utf8'));
  } catch {
    return {};
  }
}

function salvaStato() {
  if (!finestra || finestra.isDestroyed()) return;
  try {
    const b = finestra.getNormalBounds();
    fs.writeFileSync(
      FILE_STATO(),
      // Si fonde con quello che c'era: riscrivere solo la finestra cancellava
      // lo zoom scelto e le preferenze, a ogni spostamento.
      JSON.stringify({ ...leggiStato(), ...b, massimizzata: finestra.isMaximized() }, null, 2),
    );
  } catch {
    // Non ricordarsi dov'era la finestra e' un fastidio, non un errore: non
    // deve impedire al programma di chiudersi.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Le due schermate scritte in casa
// ─────────────────────────────────────────────────────────────────────────────
//
// Stanno dentro il programma e non in rete, per la ragione ovvia: si vedono
// proprio quando la rete non c'e'.

const pagina = (titolo, testo, tasto) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><meta charset="utf-8">
<style>
  :root { color-scheme: dark }
  body { margin:0; height:100vh; display:flex; flex-direction:column;
         align-items:center; justify-content:center; gap:14px;
         background:#0f1621; color:#e8edf5;
         font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif; }
  .logo { width:88px; height:88px; border-radius:50%; border:5px solid #8f2230;
          display:flex; align-items:center; justify-content:center;
          font:700 34px/1 system-ui; letter-spacing:1px; }
  h1 { font-size:19px; font-weight:600; margin:0 }
  p  { margin:0; color:#93a1b5; max-width:26rem; text-align:center }
  button { margin-top:8px; padding:11px 24px; font-size:15px; font-weight:600;
           color:#0f1621; background:#e8edf5; border:0; border-radius:8px;
           cursor:pointer }
</style>
<div class="logo">PV</div>
<h1>${titolo}</h1>
<p>${testo}</p>
${tasto ? `<button onclick="location.reload()">${tasto}</button>` : ''}
`)}`;

const ATTESA = pagina('PneusVentura', 'Sto aprendo il gestionale…', null);
const SENZA_LINEA = pagina(
  'Manca la connessione',
  'Il gestionale vive in rete, e adesso la rete non risponde. Controlla il cavo o il Wi-Fi e riprova.',
  'Riprova',
);

let staUscendo = false;
app.on('before-quit', () => {
  staUscendo = true;
  salvaFoto();
});

const FOTO = () => path.join(app.getPath('userData'), 'ultima-schermata.jpg');

/** Una foto della schermata, per ripartire da li' al prossimo avvio. */
function salvaFoto() {
  const w = finestra;
  if (!w || w.isDestroyed() || !w.isVisible()) return;
  const url = w.webContents.getURL();
  if (!url.startsWith(INDIRIZZO)) return;
  w.webContents
    .capturePage()
    .then((img) => fs.writeFileSync(FOTO(), img.toJPEG(80)))
    .catch(() => {});
}

/** La foto come pagina, se c'e' ed e' recente (meno di tre giorni). */
function fotoUltimaSchermata() {
  try {
    const st = fs.statSync(FOTO());
    if (Date.now() - st.mtimeMs > 3 * 86_400_000) return null;
    const b64 = fs.readFileSync(FOTO()).toString('base64');
    return `data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><style>html,body{margin:0;height:100%;background:#0f1621}
       img{width:100%;height:100%;object-fit:cover;display:block}</style>
       <img src="data:image/jpeg;base64,${b64}">`,
    )}`;
  } catch {
    return null;
  }
}

function creaFinestra() {
  const stato = leggiStato();

  finestra = new BrowserWindow({
    width: stato.width ?? 1440,
    height: stato.height ?? 900,
    x: stato.x,
    y: stato.y,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f1621',
    title: 'PneusVentura — Gestionale',
    icon: path.join(__dirname, 'build', 'icon.png'),
    // La finestra parte subito con la schermata d'attesa dentro. Aprirla vuota
    // e poi riempirla e' il secondo in cui il programma sembra rotto, ed e' il
    // primo secondo che le persone ricordano.
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Le tre righe che tengono separato il gestionale dal computer.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Lo zoom scelto resta: al banco c'e' chi lavora a 110% e chi a 90%.
      zoomFactor: stato.zoom ?? 1,
      // Anche in secondo piano il gestionale continua a tenere pronte le
      // pagine: tornandoci, il clic e' istantaneo come prima.
      backgroundThrottling: false,
      // La versione del programma arriva al preload da qui: nel sandbox il
      // preload non vede `app`. La pagina «Scarica l'app» la usa per dire se
      // questo computer ha l'ultima.
      additionalArguments: [`--pv-versione=${app.getVersion()}`],
    },
  });

  if (stato.massimizzata) finestra.maximize();

  // Si parte dall'ultima schermata vista (una foto salvata alla chiusura):
  // il programma sembra gia' aperto mentre in sottofondo si collega. Senza
  // foto, la schermata d'attesa di sempre.
  finestra.loadURL(fotoUltimaSchermata() ?? ATTESA);
  setTimeout(() => finestra?.loadURL(INDIRIZZO), 60);

  // Se la rete non risponde si dice cosi', in italiano, con un tasto per
  // riprovare. Il dinosauro di Chrome davanti a un cliente non va bene.
  finestra.webContents.on('did-fail-load', (_e, codice, _desc, urlFallito, principale) => {
    // −3 e' «richiesta annullata», che succede normalmente cambiando pagina.
    if (!principale || codice === -3) return;
    if (urlFallito.startsWith('data:')) return;
    finestra?.loadURL(SENZA_LINEA);
  });

  // Un link fuori casa — una mappa, un portale fornitore — si apre nel
  // browser. Aprirlo qui dentro lascerebbe qualcuno in una finestra senza
  // barra degli indirizzi e senza modo di tornare indietro.
  //
  // Il banco invece si apre in una finestra sua, del programma: la ricerca
  // gomme lo chiama con window.open('', 'pos-banco') e poi ci carica la cassa.
  // Una finestra vuota o un indirizzo di casa restano qui dentro.
  finestra.webContents.setWindowOpenHandler(({ url, frameName }) => {
    let diCasa = url === '' || url === 'about:blank';
    try {
      diCasa = diCasa || new URL(url).host === CASA;
    } catch {
      /* indirizzo strano: fuori */
    }
    if (diCasa || frameName === 'pos-banco') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 960,
          height: 1000,
          autoHideMenuBar: true,
          title: 'Banco — PneusVentura',
          webPreferences: { contextIsolation: true, sandbox: true },
        },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  finestra.webContents.on('will-navigate', (evento, url) => {
    if (url.startsWith('data:')) return;
    try {
      if (new URL(url).host !== CASA) {
        evento.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      evento.preventDefault();
    }
  });

  for (const evento of ['resize', 'move', 'maximize', 'unmaximize']) {
    finestra.on(evento, salvaStato);
  }
  finestra.on('close', (evento) => {
    salvaStato();
    salvaFoto();
    // Chiudere la finestra non chiude il programma: resta acceso, con le
    // pagine pronte, e riaprirlo dal Dock e' istantaneo. Si esce davvero
    // con Esci (Cmd+Q) o spegnendo il computer.
    if (!staUscendo) {
      evento.preventDefault();
      if (process.platform === 'darwin') finestra?.hide();
      else finestra?.minimize();
    }
  });
  finestra.on('closed', () => {
    finestra = null;
  });
}

/**
 * Il menu, ridotto a quello che serve al banco.
 *
 * Quello di partenza di Electron e' in inglese e pieno di voci che in officina
 * non vogliono dire niente («Speech», «Emoji & Symbols»). Qui servono tre
 * cose: ricaricare quando la linea e' tornata, cambiare la dimensione del
 * testo, e stampare.
 */
// Il tasto destro: Copia / Incolla come in qualunque programma. Electron non ne
// ha uno suo, e senza si poteva solo selezionare il testo senza farci niente.
app.on('web-contents-created', (_e, contenuti) => {
  contenuti.on('context-menu', (_ev, p) => {
    const voci = [];
    if (p.isEditable) {
      voci.push(
        { label: 'Taglia', role: 'cut', enabled: p.editFlags.canCut },
        { label: 'Copia', role: 'copy', enabled: p.editFlags.canCopy },
        { label: 'Incolla', role: 'paste', enabled: p.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Seleziona tutto', role: 'selectAll' },
      );
    } else if (p.selectionText && p.selectionText.trim()) {
      voci.push({ label: 'Copia', role: 'copy' });
    }
    if (p.linkURL) {
      if (voci.length) voci.push({ type: 'separator' });
      voci.push({
        label: 'Copia indirizzo del link',
        click: () => require('electron').clipboard.writeText(p.linkURL),
      });
    }
    if (voci.length) Menu.buildFromTemplate(voci).popup();
  });
});

function creaMenu() {
  const zoom = (delta) => {
    if (!finestra) return;
    const w = finestra.webContents;
    const nuovo = Math.min(2, Math.max(0.6, w.getZoomFactor() + delta));
    w.setZoomFactor(nuovo);
    try {
      const stato = leggiStato();
      fs.writeFileSync(FILE_STATO(), JSON.stringify({ ...stato, zoom: nuovo }, null, 2));
    } catch {
      /* lo zoom non ricordato non e' un errore */
    }
  };

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Gestionale',
        submenu: [
          {
            label: 'Ricarica',
            accelerator: 'CmdOrCtrl+R',
            click: () => finestra?.loadURL(INDIRIZZO),
          },
          {
            label: 'Indietro',
            accelerator: 'Alt+Left',
            click: () => finestra?.webContents.navigationHistory.goBack(),
          },
          { type: 'separator' },
          {
            label: 'Stampa…',
            accelerator: 'CmdOrCtrl+P',
            click: () => finestra?.webContents.print(),
          },
          { type: 'separator' },
          {
            label: "Apri all'accensione del computer",
            type: 'checkbox',
            checked: avvioAutomatico(),
            click: (voce) => impostaAvvioAutomatico(voce.checked),
          },
          { type: 'separator' },
          { label: 'Esci', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
        ],
      },
      // Senza questo menu, su Mac, Cmd+C / Cmd+V / Cmd+A non fanno niente: le
      // scorciatoie di copia e incolla passano da qui, non dalla pagina.
      {
        label: 'Modifica',
        submenu: [
          { label: 'Annulla', role: 'undo' },
          { label: 'Ripeti', role: 'redo' },
          { type: 'separator' },
          { label: 'Taglia', role: 'cut' },
          { label: 'Copia', role: 'copy' },
          { label: 'Incolla', role: 'paste' },
          { label: 'Incolla senza formattazione', role: 'pasteAndMatchStyle' },
          { label: 'Seleziona tutto', role: 'selectAll' },
        ],
      },
      {
        label: 'Vista',
        submenu: [
          { label: 'Testo più grande', accelerator: 'CmdOrCtrl+Plus', click: () => zoom(0.1) },
          { label: 'Testo più piccolo', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.1) },
          { label: 'Dimensione normale', accelerator: 'CmdOrCtrl+0', click: () => zoom(-99) },
          { type: 'separator' },
          { label: 'Schermo intero', accelerator: 'F11', role: 'togglefullscreen' },
        ],
      },
    ]),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Il ponte verso il computer
// ─────────────────────────────────────────────────────────────────────────────
//
// Qui dentro finiranno le cose che il browser non sa fare: parlare con la
// stampante fiscale, aprire il cassetto, leggere un barcode dalla seriale.
// Adesso c'e' solo la stampa, che serve gia' e non richiede nessun apparecchio.
//
// Ogni cosa nuova e' una riga qui e una in `preload.js`. La pagina web non
// guadagna nessun potere che non le sia stato dato uno per uno, ed e' cosi'
// che deve restare anche quando gli apparecchi arriveranno.

ipcMain.handle('officina:stampa', async () => {
  if (!finestra) return { ok: false, errore: 'Nessuna finestra aperta' };
  return new Promise((risolvi) => {
    finestra.webContents.print({ silent: false }, (riuscito, motivo) =>
      risolvi({ ok: riuscito, errore: riuscito ? null : motivo }),
    );
  });
});

ipcMain.handle('officina:stampanti', async () => {
  if (!finestra) return [];
  const elenco = await finestra.webContents.getPrintersAsync();
  return elenco.map((s) => ({
    nome: s.name,
    descrizione: s.displayName,
    predefinita: s.isDefault,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Il registratore telematico RCH
// ─────────────────────────────────────────────────────────────────────────────
//
// Il registratore ha dentro un piccolo server web: si manda un XML in POST a
// http://<indirizzo>/service.cgi con un comando per riga, e lui risponde con
// lo stato. Dal browser non si puo' — la pagina e' in https e il registratore
// in http, e comunque non manda le intestazioni CORS — da qui si'.
//
// La pagina puo' chiedere solo questo: comandi RCH verso un indirizzo della
// rete di casa. Non un indirizzo qualunque, non un percorso qualunque.

const RT_ATTESA_MS = 15000;
// Col POS Ingenico collegato al registratore, il pagamento con carta aspetta
// il cliente al terminale: il registratore risponde fino a due minuti dopo.
const RT_ATTESA_MASSIMA_MS = 150000;
const RT_TENTATIVI_OCCUPATO = 6;

function indirizzoDiCasa(indirizzo) {
  // La porta è facoltativa: «192.168.1.50» oppure «192.168.1.50:8080».
  const m = String(indirizzo)
    .trim()
    .match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1, 5).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (m[5] !== undefined && (Number(m[5]) < 1 || Number(m[5]) > 65535)) return false;
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * Un comando RCH: `=…` per le operazioni, `<</?…` per le letture di stato,
 * `>…` per la programmazione (intestazione, cortesia, logo).
 * Solo testo stampabile; `<` e `&` (servono a letture e riferimenti) si
 * mettono nell'XML come entità, quindi non lo possono rompere.
 */
function comandoValido(c) {
  return typeof c === 'string' && /^(=|<<\/\?|>)[\x20-\x7e]{0,220}$/.test(c);
}

function xml(testo) {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function leggiStatoRt(xml) {
  const stato = {};
  for (const [, nome, valore] of xml.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) stato[nome] = valore.trim();
  return stato;
}

function spiegaStatoRt(s) {
  if (s.paperEnd === '1') return 'Il registratore ha finito la carta.';
  if (s.coverOpen === '1') return 'Il coperchio del registratore è aperto.';
  if (s.printerError && s.printerError !== '0')
    return `Errore della stampante fiscale (${s.printerError}).`;
  if (s.errorCode && s.errorCode !== '0') {
    return `Il registratore ha rifiutato il comando n. ${s.lastCmd ?? '?'} (errore ${s.errorCode}).`;
  }
  return null;
}

const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Il protocollo RCH diretto, su porta TCP (manuale Print! 3.0 RT, cap. 1)
// ─────────────────────────────────────────────────────────────────────────────
//
// Gli stessi comandi del web service, ma a pacchetti:
//   STX(02) · ADDS «01» · LUNGH 3 cifre · PROT-ID «N» · DATI · PACK-ID · CHK · ETX(03)
// CHK è lo XOR di tutti i byte da STX a PACK-ID, scritto in due cifre esadecimali.
// Un comando alla volta: il registratore risponde ACK (06) o NACK (15), poi
// il pacchetto di risposta con lo stesso PACK-ID.

const net = require('node:net');

const STX = 0x02;
const ETX = 0x03;
const ACK = 0x06;
const NACK = 0x15;

function pacchettoRch(dati, id) {
  const corpo = Buffer.from(`\x0201${String(dati.length).padStart(3, '0')}N${dati}${id}`, 'latin1');
  let x = 0;
  for (const b of corpo) x ^= b;
  return Buffer.concat([
    corpo,
    Buffer.from(x.toString(16).toUpperCase().padStart(2, '0'), 'latin1'),
    Buffer.from([ETX]),
  ]);
}

/** Il campo DATI di un pacchetto di risposta (tolti intestazione, PACK-ID e CHK). */
function datiRisposta(pacchetto) {
  const t = pacchetto.toString('latin1');
  // STX + ADDS(2) + LUNGH(3) + PROT-ID(1) = 7 caratteri prima dei DATI
  const lung = Number(t.slice(3, 6));
  return Number.isFinite(lung) ? t.slice(7, 7 + lung) : t.slice(7, -4);
}

/**
 * Una sessione sul socket: manda i comandi uno per volta e raccoglie le
 * risposte. Si ferma al primo errore, come il web service.
 */
function sessioneTcp(host, porta, comandi, attesa) {
  return new Promise((risolvi) => {
    const socket = net.createConnection({ host, port: porta });
    let buffer = Buffer.alloc(0);
    let indice = 0;
    let idAttuale = '0';
    let testo = '';
    const risposte = [];
    let timer = null;
    let finito = false;

    const fine = (esito) => {
      if (finito) return;
      finito = true;
      clearTimeout(timer);
      socket.destroy();
      risolvi({ ...esito, risposte, testo });
    };
    const armaTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fine({ ok: false, scaduto: true, eseguiti: indice }), attesa);
    };
    const manda = () => {
      if (indice >= comandi.length) return fine({ ok: true, eseguiti: indice });
      idAttuale = String(indice % 10);
      buffer = Buffer.alloc(0);
      armaTimer();
      socket.write(pacchettoRch(comandi[indice], idAttuale));
    };

    socket.on('connect', manda);
    socket.on('error', (err) => fine({ ok: false, errore: err.message, eseguiti: indice }));
    socket.on('data', (pezzo) => {
      buffer = Buffer.concat([buffer, pezzo]);
      for (;;) {
        if (buffer.length === 0) return;
        if (buffer[0] === ACK) {
          buffer = buffer.subarray(1);
          continue;
        }
        if (buffer[0] === NACK) {
          return fine({
            ok: false,
            errore: 'Il registratore non ha capito il pacchetto (NACK).',
            eseguiti: indice,
          });
        }
        const inizio = buffer.indexOf(STX);
        const fineP = buffer.indexOf(ETX, inizio + 1);
        if (inizio < 0 || fineP < 0) {
          // Testo in chiaro (scarichi, letture): si tiene e si aspetta il pacchetto.
          if (inizio < 0) {
            testo += buffer.toString('latin1');
            buffer = Buffer.alloc(0);
          }
          return;
        }
        if (inizio > 0) testo += buffer.subarray(0, inizio).toString('latin1');
        // I due byte dopo ETX non esistono: il CHK sta prima. Il pacchetto finisce a ETX.
        const pacchetto = buffer.subarray(inizio, fineP + 1);
        buffer = buffer.subarray(fineP + 1);
        const dati = datiRisposta(pacchetto);
        risposte.push({ comando: comandi[indice], dati });
        const errore = dati.match(/([OE])([NGSP])(\d{4})(\d{2})/);
        if (errore && errore[1] === 'E') {
          return fine({
            ok: false,
            codice: Number(errore[3]),
            cartaFinita: errore[2] === 'P',
            eseguiti: indice,
          });
        }
        indice++;
        manda();
      }
    });
  });
}

/**
 * Il protocollo TCP non rimanda lo stato a ogni risposta come il web
 * service: dopo un documento lo si chiede (`<</?s` ultimo documento,
 * `<</?7` numero di chiusure), così il gestionale ha gli stessi campi.
 */
async function fiscaleTcp(host, porta, comandi, attesa) {
  const r = await sessioneTcp(host, porta, comandi, attesa);
  const stato = {
    errorCode: String(r.codice ?? 0),
    lastCmd: String(r.eseguiti ?? 0),
    paperEnd: r.cartaFinita ? '1' : '0',
    coverOpen: '0',
    printerError: '0',
  };
  const grezza = [
    ...r.risposte.map((x) => `${x.comando} → ${x.dati}`),
    r.testo ? `\n${r.testo}` : '',
  ]
    .join('\n')
    .slice(0, 40000);
  if (!r.ok) {
    return {
      ok: false,
      motivo: r.scaduto
        ? 'Il registratore non ha risposto in tempo. Controlla sul registratore se lo scontrino è uscito prima di rifarlo.'
        : r.errore
          ? `Registratore (TCP ${porta}): ${r.errore}`
          : `Il registratore ha rifiutato il comando n. ${(r.eseguiti ?? 0) + 1} (errore ${r.codice}).`,
      stato,
      grezza,
    };
  }
  // Lo stato dopo: numero dell'ultimo documento, stato del documento, chiusure.
  const s = await sessioneTcp(host, porta, ['<</?s', '<</?7'], 8000);
  const ds = s.risposte.find((x) => x.comando === '<</?s')?.dati ?? '';
  // «s0000  RE0104»: errore, stato documento (a volte due spazi = libero),
  // chiave, euro, ultimo documento.
  const m = ds.match(/s(\d{4})(..)(.)(.)(\d{4})/);
  if (m) {
    stato.idleState = String(Number(m[2].trim() || '0') || 0);
    stato.lastDocF = String(Number(m[5]));
  }
  const d7 = s.risposte.find((x) => x.comando === '<</?7')?.dati ?? '';
  const z = d7.match(/(\d+)/);
  if (z) stato.lastZ = String(Number(z[1]));
  return { ok: true, stato, grezza };
}

ipcMain.handle('officina:fiscale', async (_e, richiesta) => {
  const indirizzo = richiesta?.indirizzo;
  const comandi = richiesta?.comandi;
  const attesa = Math.min(
    RT_ATTESA_MASSIMA_MS,
    Math.max(RT_ATTESA_MS, Number(richiesta?.attesaMs) || RT_ATTESA_MS),
  );
  if (!indirizzoDiCasa(indirizzo)) {
    return {
      ok: false,
      motivo: 'Indirizzo del registratore non valido: deve essere della rete del negozio.',
    };
  }
  if (
    !Array.isArray(comandi) ||
    comandi.length === 0 ||
    comandi.length > 200 ||
    !comandi.every(comandoValido)
  ) {
    return { ok: false, motivo: 'Comandi per il registratore non validi.' };
  }

  // Protocollo RCH diretto su TCP, se scelto in impostazioni.
  if (richiesta?.trasporto?.tipo === 'tcp') {
    const porta = Math.min(65535, Math.max(1, Number(richiesta.trasporto.porta) || 23));
    const host = String(indirizzo).trim().split(':')[0];
    return fiscaleTcp(host, porta, comandi, attesa);
  }

  const corpo =
    '<?xml version="1.0" encoding="UTF-8"?>\n<Service>\n' +
    comandi.map((c) => `<cmd>${xml(c)}</cmd>`).join('\n') +
    '\n</Service>';

  // «busy» vuol dire che sta finendo il lavoro di prima: si riprova fra poco.
  // Qualunque altra risposta e' definitiva — ripetere uno scontrino che forse
  // e' gia' uscito vorrebbe dire rischiarne due.
  for (let tentativo = 0; tentativo < RT_TENTATIVI_OCCUPATO; tentativo++) {
    let testo;
    try {
      const risposta = await fetch(`http://${indirizzo.trim()}/service.cgi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        body: corpo,
        signal: AbortSignal.timeout(attesa),
      });
      testo = await risposta.text();
      if (!risposta.ok) {
        return {
          ok: false,
          motivo: `Il registratore ha risposto ${risposta.status}. Il servizio web è attivo?`,
        };
      }
    } catch (err) {
      const scaduto = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return {
        ok: false,
        motivo: scaduto
          ? 'Il registratore non ha risposto in tempo. Controlla sul registratore se lo scontrino è uscito prima di rifarlo.'
          : `Non raggiungo il registratore a ${indirizzo}: è acceso e sulla stessa rete?`,
      };
    }

    const stato = leggiStatoRt(testo);
    if (stato.busy === '1' && tentativo < RT_TENTATIVI_OCCUPATO - 1) {
      await aspetta(700);
      continue;
    }
    const problema = spiegaStatoRt(stato);
    const grezza = testo.slice(0, 40000);
    return problema ? { ok: false, motivo: problema, stato, grezza } : { ok: true, stato, grezza };
  }
  return { ok: false, motivo: 'Il registratore è occupato. Riprova fra qualche secondo.' };
});

// Il registratore c'è? Si bussa alla porta del suo server web con una GET,
// senza mandare nessun comando: serve alla spia «Connesso» della cassa, che
// controlla spesso, e una verifica che non tocca il registratore si può fare
// quante volte si vuole.
ipcMain.handle('officina:rt-raggiungibile', async (_e, indirizzo) => {
  if (!indirizzoDiCasa(indirizzo)) {
    return { ok: false, motivo: 'Indirizzo del registratore non valido.' };
  }
  try {
    await fetch(`http://${String(indirizzo).trim()}/`, { signal: AbortSignal.timeout(3000) });
    return { ok: true };
  } catch (err) {
    const scaduto = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      ok: false,
      motivo: scaduto
        ? `Il registratore a ${indirizzo} non risponde: è acceso? Il cavo di rete è attaccato?`
        : `Non raggiungo ${indirizzo}: il PC e il registratore sono sulla stessa rete?`,
    };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Si apre da solo all'accensione del computer
// ─────────────────────────────────────────────────────────────────────────────
//
// Al banco il computer si accende la mattina e la cassa deve esserci, senza
// cercare l'icona. Acceso di partenza; si spegne dal menu Gestionale.

function avvioAutomatico() {
  return leggiStato().avvioAutomatico !== false;
}

function impostaAvvioAutomatico(acceso) {
  try {
    const stato = leggiStato();
    fs.writeFileSync(FILE_STATO(), JSON.stringify({ ...stato, avvioAutomatico: acceso }, null, 2));
  } catch {
    /* la preferenza non salvata vale per questa volta */
  }
  // In sviluppo (npm start) non si registra: aprirebbe Electron nudo.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: acceso });
}

ipcMain.handle('officina:avvio-automatico', () => avvioAutomatico());
ipcMain.handle('officina:imposta-avvio-automatico', (_e, acceso) => {
  impostaAvvioAutomatico(Boolean(acceso));
  creaMenu();
  return avvioAutomatico();
});

// Una sola copia per volta: due finestre sullo stesso banco vogliono dire due
// scontrini aperti, e prima o poi si incassa quello sbagliato.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (finestra) {
      if (finestra.isMinimized()) finestra.restore();
      finestra.show();
      finestra.focus();
    }
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    app.setAppUserModelId('it.pneusventura.gestionale');
    creaMenu();
    impostaAvvioAutomatico(avvioAutomatico());
    creaFinestra();
    // Controlla su GitHub se l'indirizzo è cambiato (Netlify↔Vercel).
    // Se sì, ricarica automaticamente la pagina col nuovo indirizzo.
    aggiornaIndirizzo();

    app.on('activate', () => {
      if (finestra) finestra.show();
      else creaFinestra();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
