# Marketplace Notai ↔ Utenti — Product & Technical Specification per Codex

> **Working title:** `Notaio Marketplace`
> **Status:** Product spec / build brief
> **Obiettivo:** costruire un marketplace italiano a due lati che non sia soltanto un comparatore di preventivi, ma una piattaforma di **matching + preparazione pratica + gestione documentale + relazione continuativa** tra utenti e notai.

---

## 0. Executive summary

Il prodotto deve partire da una **core interaction molto semplice**:

> **Un utente descrive una necessità notarile, la piattaforma struttura la pratica e la invia ai notai più adatti; il notaio riceve una richiesta completa e qualificata, formula un preventivo e può trasformarla in incarico.**

Il marketplace deve differenziarsi dai portali esistenti soprattutto su tre dimensioni:

1. **qualità della richiesta**, non quantità indiscriminata di lead;
2. **workflow successivo al preventivo**, così da arrivare fino alla scelta del notaio e alla preparazione della pratica;
3. **utility permanente per entrambi i lati**, in modo che l'utente non sparisca dopo il preventivo e il notaio abbia un motivo per usare la piattaforma anche quando non sta acquistando lead.

### Posizionamento

Non:

> "Trova il notaio più economico."

Ma:

> **"Trova il notaio giusto, ottieni un preventivo comprensibile e arriva preparato all'atto."**

Per il notaio:

> **"Ricevi richieste complete, qualificate e compatibili con il tuo studio. Meno tempo perso, più incarichi."**

---

# 1. Principi di prodotto

## 1.1 Marketplace, non directory

La piattaforma possiede già un database di tutti i notai, con:

- anagrafica;
- sede / sedi operative;
- territorio;
- recapiti certificati;
- altri dati disponibili.

Questo database è il **cold-start asset principale**.

Non richiedere quindi che il notaio si registri per "esistere" nel marketplace.

Ogni notaio deve poter avere inizialmente una pagina pubblica generata dal database, marcata:

- `Profilo da fonte pubblica/certificata`;
- `Profilo non ancora rivendicato`.

La registrazione del notaio serve a **rivendicare e potenziare il profilo**, non a essere incluso.

---

## 1.2 La core interaction

### Partecipanti

**Consumer**
- privato;
- impresa;
- professionista/intermediario autorizzato.

**Producer**
- notaio;
- studio notarile;
- collaboratore di studio autorizzato.

### Value unit principale

La value unit non deve essere il semplice "lead".

Deve essere una:

## `Richiesta Notarile Qualificata`

contenente, per quanto applicabile:

- tipo di atto;
- luogo;
- tempistica;
- soggetti coinvolti;
- dati economici rilevanti;
- immobili coinvolti;
- eventuale mutuo;
- documenti disponibili;
- documenti mancanti;
- eventuali complessità dichiarate;
- preferenze dell'utente;
- recapito verificato;
- consenso alla trasmissione ai notai selezionati.

### Filter / matching

Il sistema deve scegliere i notai in base a:

- compatibilità geografica;
- tipologia di atto;
- disponibilità dichiarata;
- tempi medi di risposta;
- capacità di presa in carico;
- lingue;
- servizi digitali;
- preferenze del cliente;
- qualità storica dell'interazione;
- eventuale prezzo indicativo **solo come uno dei fattori, mai l'unico**.

---

# 2. Analisi competitiva sintetica e differenziazione

I principali modelli osservabili nel mercato italiano sono:

- **NotaioFacile:** forte acquisizione SEO e invio di richieste a notai;
- **NotaiOnline:** calcolatore, directory, checklist, richiesta preventivi fino a un numero limitato di notai;
- **Notaio.io:** focalizzazione su preventivo e gestione più digitale della pratica.

La nuova piattaforma deve evitare di essere una copia con grafica differente.

## Differenziazione proposta

| Area | Portali tradizionali | Nuovo marketplace |
|---|---|---|
| Lead | richiesta spesso sintetica | richiesta qualificata e controllata |
| Preventivo | documento / risposta | preventivo strutturato e confrontabile |
| Matching | zona + disponibilità | ranking multi-fattore |
| Documenti | spesso post-contatto | fascicolo digitale già nella richiesta |
| Utente dopo preventivo | quasi sempre perso | area personale persistente |
| Notaio | compra/riceve lead | CRM leggero + workflow + analytics |
| Competizione | rischio asta al ribasso | qualità, specializzazione, servizio, tempo |
| Dati | singola richiesta | patrimonio informativo riusabile |
| AI | eventuale chatbot | copilota di preparazione e controllo, non decisore |
| SEO | guide + landing | directory completa + strumenti + programmatic SEO |

---

# 3. Value proposition lato utente

## 3.1 Prima dell'incarico

L'utente deve ottenere valore **anche se non sceglie subito un notaio**.

Servizi gratuiti:

1. ricerca notai per comune/provincia;
2. profili verificati / dati certificati;
3. guida guidata alla scelta dell'atto;
4. stima orientativa delle componenti di costo;
5. checklist documentale personalizzata;
6. verifica di completezza della richiesta;
7. richiesta di preventivo;
8. confronto dei preventivi ricevuti;
9. spiegazione delle diverse voci;
10. timeline indicativa della pratica.

---

## 3.2 Preventivo comparabile, non "prezzo secco"

I preventivi devono essere normalizzati in campi confrontabili:

- compenso professionale;
- IVA;
- imposte;
- tasse;
- anticipazioni;
- visure / spese;
- altre voci;
- totale;
- inclusioni;
- esclusioni;
- validità;
- eventuali condizioni;
- documentazione ancora da verificare.

### UX

Mostrare:

- `Totale stimato`
- `Di cui imposte e anticipazioni`
- `Di cui compensi/spese professionali`
- `Cosa comprende`
- `Cosa potrebbe variare`
- `Tempo di risposta`
- `Disponibilità indicativa`

**Non ordinare di default solo per prezzo.**

Default ranking suggerito:

`Compatibilità pratica + qualità risposta + completezza + distanza + tempi + prezzo`

---

# 4. Area personale utente: "Fascicolo Patrimoniale"

Questa è una delle principali differenze strategiche rispetto al semplice comparatore.

## 4.1 MVP

Creare un'area chiamata:

# `Il mio fascicolo`

Contiene:

### Persone
- dati anagrafici;
- codice fiscale;
- recapiti;
- relazioni utili alla pratica;
- consensi.

### Immobili
- nickname ("Casa Milano");
- indirizzo;
- comune;
- foglio;
- particella;
- subalterno;
- categoria;
- rendita catastale se fornita;
- quota possesso;
- titolo / atto di provenienza;
- documenti collegati.

### Società
- ragione sociale;
- CF / P.IVA;
- sede;
- ruolo dell'utente;
- documenti societari caricati.

### Pratiche
- nuova;
- richiesta preventivi;
- preventivi ricevuti;
- notaio scelto;
- documentazione in preparazione;
- pronta per lo studio;
- chiusa;
- archiviata.

### Documenti
- upload PDF / immagini;
- classificazione;
- collegamento a persona / immobile / pratica;
- scadenza se applicabile;
- versione;
- fonte;
- autorizzazioni di condivisione.

---

## 4.2 Importante: dati catastali

**Non assumere nel MVP un accesso automatico alle banche dati catastali pubbliche.**

Implementare prima:

- inserimento manuale;
- import da documenti caricati;
- estrazione assistita tramite AI/OCR con conferma utente;
- possibilità di correggere tutti i campi;
- provenienza del dato (`manual`, `document_extraction`, `professional`, `external_api`).

Prevedere un adapter tecnico futuro:

```ts
interface PropertyDataProvider {
  searchByFiscalCode(input: SearchInput): Promise<PropertyResult[]>
  getPropertyDetails(id: string): Promise<PropertyDetails>
}
```

ma lasciare `external_api` disabilitato finché non esiste una base normativa/contrattuale e un provider autorizzato.

---

# 5. Perché il notaio dovrebbe registrarsi

Il marketplace non deve vendere al notaio solo "visibilità".

## 5.1 Incentivi gratuiti immediati

Registrandosi / rivendicando il profilo il notaio può:

- correggere e arricchire i dati dello studio;
- inserire sedi secondarie;
- indicare ambiti di attività;
- lingue;
- orari;
- canali di contatto;
- servizi digitali;
- disponibilità indicativa;
- ricevere richieste qualificate;
- impostare comuni/province di interesse;
- escludere categorie di richieste non desiderate;
- impostare capacità massima;
- ricevere una scheda già completa della pratica;
- usare template di risposta;
- mantenere una mini pipeline;
- monitorare richieste, risposte, incarichi;
- ottenere statistiche private.

---

## 5.2 CRM leggero per lo studio

Dashboard:

### Inbox
- nuove richieste;
- da valutare;
- incomplete;
- preventivo da preparare;
- preventivo inviato;
- follow-up;
- acquisita;
- persa;
- archiviata.

### Ogni lead deve mostrare subito

- tipo atto;
- zona;
- data desiderata;
- score di completezza;
- documenti disponibili;
- elementi mancanti;
- eventuale importo operazione;
- numero di notai coinvolti;
- data/ora invio;
- SLA di risposta;
- eventuale messaggio utente.

Questo è un forte incentivo: il notaio riceve **meno richieste spazzatura**.

---

# 6. "Lead Quality Score"

Ogni richiesta deve avere uno score da 0 a 100.

Esempio:

```text
+20 recapito verificato
+10 identità verificata
+15 tipo atto definito
+15 dati economici sufficienti
+10 località definita
+15 documenti minimi caricati
+10 tempistica indicata
+5 utente ha completato checklist
```

Classi:

- `A` = 80–100
- `B` = 60–79
- `C` = 40–59
- `Incomplete` < 40

Il notaio può scegliere:

- accetta A+B;
- solo A;
- anche richieste incomplete;
- solo determinate categorie.

---

# 7. AI: dove usarla

L'AI deve **preparare e controllare**, non decidere il compenso del notaio.

## 7.1 Intake assistant

Chat / wizard ibrido:

> "Devo comprare una casa a Milano con mutuo."

Il sistema:

1. riconosce `compravendita + mutuo`;
2. chiede solo i dati necessari;
3. evita domande irrilevanti;
4. crea JSON strutturato;
5. indica cosa manca;
6. genera la checklist.

### Regola

Ogni campo estratto dall'AI deve avere:

```ts
{
  value: "...",
  confidence: 0.92,
  source: "user_message | uploaded_document",
  confirmedByUser: false
}
```

Prima dell'invio al notaio i campi rilevanti devono essere confermati.

---

## 7.2 Document intelligence

Per PDF / foto:

- classificazione documento;
- estrazione dati;
- data documento;
- parti;
- immobile;
- riferimenti catastali;
- importi;
- eventuali campi mancanti.

Non generare conclusioni giuridiche autonome.

---

## 7.3 Preventivo normalizer

Il notaio può:

- compilare un form strutturato;
- caricare il proprio PDF;
- incollare testo.

L'AI può estrarre il preventivo in struttura standard.

Il notaio vede l'anteprima e conferma.

---

## 7.4 Quote checker

Prima dell'invio:

- totale = somma delle componenti;
- campi obbligatori;
- validità;
- presenza di note;
- incongruenze evidenti;
- differenze rispetto ai template dello studio.

**Il sistema segnala; non modifica automaticamente il prezzo.**

---

## 7.5 Copilota notaio

Funzioni premium possibili:

- riassunto richiesta;
- lista informazioni mancanti;
- bozza email al cliente;
- checklist studio;
- confronto con precedenti dello stesso studio;
- follow-up automatico da approvare.

---

# 8. Matching engine

## 8.1 Hard filters

Escludere i notai che non soddisfano:

- area geografica;
- tipologia richiesta;
- disponibilità;
- account sospeso;
- opt-out;
- limite lead raggiunto;
- eventuali incompatibilità configurate.

## 8.2 Ranking score

Esempio iniziale:

```text
30% geo_fit
20% practice_fit
15% availability
10% response_rate
10% response_speed
10% user_preference
 5% marketplace_quality
```

Il `price` **non entra nel ranking prima che esista un preventivo**.

Dopo i preventivi, l'utente può ordinare per:

- consigliato;
- prezzo totale;
- distanza;
- rapidità;
- completezza;
- disponibilità.

---

# 9. Meccanica anti-asta al ribasso

Questa è fondamentale.

## Regole

1. inviare una richiesta inizialmente a **massimo 3 notai**;
2. non mostrare ai notai i prezzi proposti dagli altri;
3. non notificare "sei più caro";
4. non creare countdown aggressivi;
5. mostrare al cliente il dettaglio delle componenti;
6. esplicitare che prezzo e qualità/complessità non sono equivalenti;
7. consentire al notaio di chiedere chiarimenti prima di quotare;
8. consentire preventivi:
   - `indicativo`;
   - `di massima`;
   - `definitivo previa verifica documentale`.

---

# 10. Trust layer

## Lato notaio

Badge possibili:

- `Identità verificata`
- `Profilo rivendicato`
- `Dati professionali verificati`
- `Risponde in media entro X`
- `Accetta documenti digitali`
- `Lingue`
- `Disponibilità aggiornata`

Evitare badge che implichino valutazioni legali qualitative non dimostrabili.

## Lato cliente

- email verificata;
- telefono verificato;
- richiesta completa;
- documenti caricati;
- identità verificata opzionale;
- storico richieste genuine.

Il notaio deve poter vedere **il livello di verifica**, non dati superflui.

---

# 11. Recensioni

Le recensioni generiche sui notai sono delicate e facilmente manipolabili.

MVP consigliato:

Consentire feedback solo dopo una pratica con stato `chosen` / `completed`.

Valutare aspetti osservabili:

- chiarezza del preventivo;
- rapidità di risposta;
- organizzazione;
- chiarezza comunicativa;
- facilità scambio documenti.

Evitare inizialmente giudizi sulla "qualità giuridica" della prestazione.

---

# 12. Monetizzazione

## 12.1 Lato utente

Core gratuito.

Possibili servizi premium futuri:

- spazio documentale esteso;
- fascicolo famiglia;
- monitor scadenze;
- assistenza concierge;
- recupero / organizzazione documenti tramite provider autorizzati.

Non monetizzare l'utente sul semplice accesso ai preventivi nella fase iniziale.

---

## 12.2 Lato notaio

### Free
- claim profilo;
- gestione dati;
- ricezione limitata di lead;
- risposta;
- dashboard base.

### Pro — abbonamento
- più aree geografiche;
- regole avanzate;
- più utenti studio;
- template;
- analytics;
- automazioni;
- AI copilot;
- inbox avanzata;
- storico;
- export;
- webhook/API;
- branding profilo.

### Possibile pay-per-qualified-lead

Solo successivamente.

Se usato, il costo deve dipendere dal livello di qualificazione, non dall'invio indiscriminato.

Esempio:

- lead C = gratuito / quasi gratuito;
- lead B = fee bassa;
- lead A = fee superiore;
- incarico confermato = eventuale piano premium, **non percentuale sul compenso senza preventiva verifica normativa/deontologica**.

---

# 13. Acquisition e network effects

## 13.1 Cold start lato notai

Dato che il DB è già completo:

1. pubblicare directory nazionale;
2. creare pagina per ogni notaio;
3. far arrivare domanda prima della registrazione;
4. quando arriva una richiesta per un notaio non registrato:
   - inviare notifica al recapito professionale disponibile;
   - mostrare contenuto sintetico;
   - CTA: `Rivendica gratuitamente il profilo e rispondi`;
5. onboarding di 2 minuti.

Questo trasforma la domanda in strumento di acquisizione supply-side.

---

## 13.2 Programmatic SEO

Strutture:

```text
/notai/{regione}
/notai/{provincia}
/notai/{comune}
/notaio/{slug-nome-comune}

/preventivo/{tipo-atto}
/preventivo/{tipo-atto}/{citta}

/costo-notaio/{tipo-atto}
/costo-notaio/{tipo-atto}/{citta}

/documenti/{tipo-atto}
/guide/{argomento}
```

Esempi:

- `/notai/milano`
- `/preventivo/compravendita/milano`
- `/costo-notaio/compravendita/milano`
- `/documenti/donazione`
- `/notaio/mario-rossi-milano`

### SEO rule

Le landing non devono essere doorway pages vuote.

Devono avere:

- elenco reale;
- numero notai;
- dati territoriali;
- strumenti;
- FAQ specifiche;
- checklist;
- collegamenti interni;
- dati strutturati;
- contenuto utile e originale.

---

# 14. User journeys

## 14.1 Utente — preventivo compravendita + mutuo

1. landing SEO;
2. `Richiedi preventivo`;
3. seleziona / descrive esigenza;
4. wizard raccoglie dati;
5. sistema calcola completeness score;
6. invita a caricare documenti;
7. utente sceglie:
   - "scegli per me i notai più adatti";
   - "voglio scegliere io";
8. sistema propone max 3 notai;
9. consenso invio dati;
10. richiesta inviata;
11. preventivi ricevuti;
12. normalizzazione;
13. comparatore;
14. chat / chiarimenti;
15. utente sceglie notaio;
16. crea workspace condiviso;
17. checklist documenti;
18. caricamento;
19. pratica pronta;
20. chiusura;
21. documenti restano nel fascicolo personale.

---

## 14.2 Notaio non registrato

1. riceve email "Un utente ti ha selezionato";
2. vede preview non sensibile:
   - atto;
   - comune;
   - tempistica;
   - score;
3. CTA `Visualizza richiesta`;
4. verifica email / OTP;
5. claim profilo;
6. accetta termini;
7. vede richiesta;
8. risponde;
9. profilo rimane attivo per future richieste.

---

## 14.3 Notaio registrato

1. login;
2. inbox;
3. filtra richieste;
4. apre lead;
5. vede score + dati + documenti;
6. può:
   - chiedere chiarimento;
   - rifiutare;
   - preventivare;
7. genera preventivo;
8. controllo;
9. invio;
10. follow-up;
11. esito:
   - acquisito;
   - perso;
   - nessuna risposta;
12. analytics.

---

# 15. Architettura tecnica proposta

## 15.1 Stack consigliato

### Frontend
- Next.js 15+ App Router
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Query dove utile

### Backend
Opzione semplice:

- Next.js server actions / route handlers per MVP

oppure:

- NestJS / Fastify separato se si prevede alta complessità.

### DB
- PostgreSQL
- Prisma ORM

### Search
MVP:
- PostgreSQL full-text + trigram

Scale:
- Meilisearch / Typesense / OpenSearch

### Storage
- S3-compatible object storage
- signed URLs
- encryption at rest

### Auth
- Auth.js / Clerk / equivalente
- email OTP
- MFA per account professionali opzionale/consigliato

### Queue
- Redis + BullMQ / managed queue

### Email
- provider transactional
- template versionati

### Observability
- Sentry
- structured logs
- audit log

---

# 16. Modello dati

## 16.1 Core entities

```prisma
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  phone           String?
  firstName       String?
  lastName        String?
  fiscalCode      String?
  emailVerifiedAt DateTime?
  phoneVerifiedAt DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Notary {
  id                String   @id
  firstName         String
  lastName          String
  fiscalCode        String?
  officialEmail     String?
  certifiedEmail    String?
  phone             String?
  source             String
  sourceUpdatedAt    DateTime?
  claimedAt          DateTime?
  profileStatus      String   @default("UNCLAIMED")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model NotaryOffice {
  id        String @id @default(cuid())
  notaryId  String
  name      String?
  address   String
  city      String
  province  String
  region    String
  postalCode String?
  lat       Decimal?
  lng       Decimal?
}

model NotaryProfile {
  id                String @id @default(cuid())
  notaryId          String @unique
  bio               String?
  languages         Json?
  practiceAreas     Json?
  digitalServices   Json?
  responsePolicy    Json?
  visibilitySettings Json?
}

model PracticeRequest {
  id                String   @id @default(cuid())
  userId            String
  practiceType      String
  status            String
  city              String?
  province          String?
  desiredDate       DateTime?
  structuredData    Json
  completenessScore Int      @default(0)
  qualification     String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model RequestNotaryMatch {
  id              String   @id @default(cuid())
  requestId       String
  notaryId        String
  matchScore      Float
  status          String
  deliveredAt     DateTime?
  openedAt        DateTime?
  respondedAt     DateTime?
  createdAt       DateTime @default(now())

  @@unique([requestId, notaryId])
}

model Quote {
  id                String   @id @default(cuid())
  requestId         String
  notaryId          String
  status            String
  quoteType         String
  professionalFee   Decimal?
  vat               Decimal?
  taxes             Decimal?
  advances          Decimal?
  searchesAndCosts  Decimal?
  otherCosts        Decimal?
  total             Decimal?
  includedItems     Json?
  excludedItems     Json?
  notes             String?
  validUntil        DateTime?
  sourceDocumentId  String?
  sentAt            DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model Property {
  id              String @id @default(cuid())
  userId          String
  nickname        String?
  address         String?
  city            String?
  province        String?
  sheet           String?
  parcel          String?
  subaltern       String?
  cadastralIncome Decimal?
  ownershipShare  Decimal?
  source          String
  sourceMetadata  Json?
}

model Document {
  id           String   @id @default(cuid())
  ownerUserId  String?
  requestId    String?
  propertyId   String?
  fileName     String
  mimeType     String
  storageKey   String
  category     String?
  extractedData Json?
  createdAt    DateTime @default(now())
}

model Conversation {
  id        String @id @default(cuid())
  requestId String
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  senderType     String
  senderId       String
  body           String
  createdAt      DateTime @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  actorType  String
  actorId    String?
  action     String
  entityType String
  entityId   String
  metadata   Json?
  createdAt  DateTime @default(now())
}
```

---

# 17. API principali

## Public

```text
GET  /api/notaries/search
GET  /api/notaries/:slug
GET  /api/locations/:slug
GET  /api/practice-types
POST /api/quote-estimate
```

## User

```text
POST /api/requests
GET  /api/requests/:id
PATCH /api/requests/:id
POST /api/requests/:id/documents
POST /api/requests/:id/submit
GET  /api/requests/:id/matches
POST /api/requests/:id/select-notaries
GET  /api/requests/:id/quotes
POST /api/requests/:id/choose-quote

GET  /api/properties
POST /api/properties
PATCH /api/properties/:id
```

## Notary

```text
POST /api/notary/claim
GET  /api/notary/inbox
GET  /api/notary/requests/:id
POST /api/notary/requests/:id/accept
POST /api/notary/requests/:id/decline
POST /api/notary/requests/:id/question
POST /api/notary/requests/:id/quote
PATCH /api/notary/quotes/:id
POST /api/notary/quotes/:id/send
GET  /api/notary/analytics
PATCH /api/notary/profile
PATCH /api/notary/preferences
```

---

# 18. Stati applicativi

## PracticeRequest

```text
DRAFT
INCOMPLETE
READY
MATCHING
SENT
QUOTES_RECEIVED
NOTARY_CHOSEN
DOCUMENT_COLLECTION
IN_PROGRESS
COMPLETED
CANCELLED
ARCHIVED
```

## Match

```text
PROPOSED
SELECTED
DELIVERED
OPENED
ACCEPTED
DECLINED
RESPONDED
EXPIRED
```

## Quote

```text
DRAFT
NEEDS_REVIEW
SENT
VIEWED
QUESTIONED
ACCEPTED
REJECTED
EXPIRED
WITHDRAWN
```

---

# 19. Privacy, sicurezza e governance

Questa piattaforma tratta dati personali e documenti ad alta sensibilità pratica.

Implementare dal giorno 1:

- privacy by design;
- data minimization;
- consenso granulare alla condivisione;
- nessun documento visibile al notaio prima dell'esplicito invio;
- signed URLs a durata breve;
- encryption at rest;
- TLS;
- audit trail accessi;
- download log;
- cancellazione account;
- retention configurabile;
- separazione storage metadata/file;
- virus scanning upload;
- rate limiting;
- RBAC;
- MFA per amministratori;
- segreti fuori dal repository;
- backup;
- procedure breach.

### Consent model

Il cliente deve autorizzare esplicitamente:

> "Autorizzo la piattaforma a trasmettere a Notaio X i dati e i documenti selezionati per consentirgli di valutare la richiesta."

Il consenso deve essere registrato con:

- utente;
- destinatario;
- documenti;
- timestamp;
- versione testo;
- IP / technical context ove appropriato.

---

# 20. Compliance / legal review gates

Prima del go-live reale, richiedere revisione legale specializzata almeno su:

1. modalità di intermediazione tra utenti e notai;
2. deontologia notarile;
3. rappresentazione comparativa dei compensi;
4. eventuali commissioni / pay-per-lead / success fee;
5. pubblicità dei professionisti;
6. recensioni;
7. trattamento dati personali e documenti;
8. eventuale accesso a dati catastali / immobiliari;
9. uso di AI su documenti e dati;
10. termini "verificato", "specializzato", "migliore", "consigliato".

**Codex non deve inventare vincoli normativi.**
Dove una feature dipende da un punto non validato, implementare un feature flag.

---

# 21. Admin console

## Funzioni

- gestione utenti;
- gestione notai;
- merge duplicati;
- verifica claim;
- gestione sedi;
- blacklist / sospensioni;
- richieste;
- quote;
- ticket;
- document abuse;
- analytics;
- matching weights;
- practice types;
- checklist;
- email templates;
- landing SEO;
- feature flags;
- audit logs.

---

# 22. Analytics del marketplace

## North Star Metric

# `Qualified Requests resulting in a meaningful notary interaction`

Non "numero lead".

## Funnel utente

```text
landing
→ start request
→ request completed
→ qualified
→ sent
→ quote received
→ quote viewed
→ notary chosen
→ practice started
→ completed
```

Metriche:

- completion rate;
- tempo compilazione;
- % richieste A/B/C;
- time to first quote;
- quote coverage;
- choice rate;
- conversion to engagement;
- repeat user rate.

## Funnel notaio

```text
profile viewed
→ claim
→ request delivered
→ opened
→ accepted
→ quote sent
→ chosen
```

Metriche:

- claim rate;
- open rate;
- response rate;
- median response time;
- win rate;
- lead rejection reasons;
- qualified lead / total;
- subscription conversion.

---

# 23. Marketplace health metrics

Misurare per territorio e practice type:

```text
demand_count
active_supply
request_to_notary_ratio
median_response_time
quote_coverage
no_response_rate
average_matches_per_request
user_choice_rate
notary_win_distribution
```

Alert:

- troppi utenti / pochi notai;
- troppi notai / poche richieste;
- concentrazione eccessiva;
- molti lead ignorati;
- molte richieste incomplete.

---

# 24. MVP — cosa costruire subito

## Release 1

### Public
- homepage;
- directory notai;
- ricerca;
- pagina notaio;
- pagine città;
- pagine tipo atto;
- CTA preventivo.

### Utente
- registrazione / magic link;
- wizard richiesta;
- completeness score;
- selezione max 3 notai;
- invio;
- area richieste;
- ricezione preventivi;
- comparatore strutturato;
- messaggistica;
- scelta notaio.

### Notaio
- claim profilo;
- onboarding;
- inbox;
- dettaglio richiesta;
- accetta/rifiuta;
- domande;
- creazione preventivo;
- invio;
- pipeline base.

### Admin
- CRUD;
- gestione claim;
- matching;
- audit.

---

# 25. Release 2

- fascicolo immobiliare;
- upload documenti;
- estrazione assistita;
- checklist dinamiche;
- workspace post-scelta;
- analytics notaio;
- template;
- follow-up;
- recensioni verificate;
- disponibilità.

---

# 26. Release 3

- AI copilot;
- preventivo PDF normalizer;
- quote checker;
- CRM studio multiutente;
- webhook/API;
- integrazioni gestionali;
- provider dati esterni autorizzati;
- notifiche scadenze;
- fascicolo famiglia / società;
- referral professionali.

---

# 27. Cose da NON costruire all'inizio

Non partire da:

- videoconferenza proprietaria;
- firma elettronica proprietaria;
- pagamenti complessi;
- social network;
- app mobile native;
- accesso automatico a catasto senza provider;
- rating complesso;
- marketplace con 20 preventivi per richiesta;
- AI che determina il prezzo;
- escrow;
- calendari sofisticati.

Il rischio principale è costruire troppo prima di dimostrare la core interaction.

---

# 28. UI / UX

## Tone

- autorevole;
- semplice;
- rassicurante;
- non burocratico;
- non "discount marketplace".

## Homepage

Hero:

> **Trova il notaio giusto. Arriva già preparato.**

Sub:

> Descrivi ciò che devi fare, prepara i documenti e confronta preventivi chiari da notai della tua zona.

CTA:

- `Richiedi un preventivo`
- `Trova un notaio`

Trust:

- database nazionale;
- dati verificati;
- richiesta gratuita;
- massimo 3 studi per richiesta;
- dati condivisi solo con i notai scelti.

---

# 29. Design system

- mobile first;
- WCAG AA;
- max content width 1200;
- form a step brevi;
- autosave;
- progress indicator;
- spiegazioni inline;
- errori specifici;
- empty state utili;
- skeleton loading;
- no dark patterns.

---

# 30. Onboarding notaio

Step 1:
`Sei il Notaio Mario Rossi?`

Step 2:
verifica tramite canale professionale disponibile.

Step 3:
conferma dati.

Step 4:
preferenze richieste:

```text
[ ] Compravendite
[ ] Mutui
[ ] Donazioni
[ ] Successioni
[ ] Società
[ ] Procure
...
```

Step 5:
territorio.

Step 6:
capacità:

```text
○ ricevi tutte le richieste compatibili
○ max 5/settimana
○ max 10/settimana
○ pausa richieste
```

Step 7:
profilo attivo.

Tempo target: `< 3 minuti`.

---

# 31. Request schema

Esempio compravendita:

```json
{
  "practiceType": "REAL_ESTATE_PURCHASE",
  "location": {
    "city": "Milano",
    "province": "MI"
  },
  "property": {
    "purchasePrice": 320000,
    "cadastralIncome": 950.50,
    "firstHome": true,
    "sellerType": "PRIVATE",
    "hasGarage": true
  },
  "mortgage": {
    "required": true,
    "amount": 220000,
    "bank": null
  },
  "timing": {
    "desiredDate": null,
    "urgency": "WITHIN_60_DAYS"
  },
  "documents": [],
  "notes": ""
}
```

Creare schema Zod per ciascun `practiceType`.

---

# 32. Practice Type configuration engine

Non hardcodificare ogni wizard nel frontend.

Creare configurazione:

```ts
type PracticeTypeConfig = {
  code: string
  name: string
  description: string
  steps: FormStep[]
  requiredFields: RequirementRule[]
  checklist: ChecklistRule[]
  matchingRules: MatchingRule[]
}
```

Questo consente di aggiungere nuovi atti senza rifare l'applicazione.

---

# 33. Seed delle categorie

MVP:

- compravendita immobiliare;
- compravendita + mutuo;
- mutuo;
- donazione;
- successione / atti connessi;
- procura;
- costituzione società;
- modifica societaria;
- cessione quote;
- testamento / consulenza;
- divisione;
- atto famiglia/patrimonio;
- altro / da classificare.

---

# 34. SEO tecnico

Implementare:

- SSR / static generation dove possibile;
- canonical;
- sitemap segmented;
- breadcrumb;
- robots;
- pagination crawlable;
- noindex filtri poveri;
- schema.org appropriato e prudente;
- internal linking città ↔ provincia ↔ notaio ↔ servizio;
- Core Web Vitals;
- immagini ottimizzate;
- title/meta unici;
- JSON-LD generato server-side;
- gestione profili duplicati.

---

# 35. Content engine

Entità editoriali:

```text
Guide
FAQ
Checklist
GlossaryTerm
PracticeType
Location
NotaryProfile
CostCalculator
```

Il CMS può essere inizialmente DB-based con editor admin.

---

# 36. Feature flags

```text
ENABLE_AI_INTAKE
ENABLE_DOCUMENT_EXTRACTION
ENABLE_USER_VAULT
ENABLE_REVIEWS
ENABLE_PAID_LEADS
ENABLE_SUBSCRIPTIONS
ENABLE_EXTERNAL_PROPERTY_PROVIDER
ENABLE_NOTARY_COPILOT
ENABLE_MULTIUSER_STUDIO
```

---

# 37. Testing

## Unit

- matching score;
- completeness score;
- quote totals;
- permission checks;
- practice schemas.

## Integration

- request → matches;
- request → quote;
- consent → document access;
- claim flow;
- notifications.

## E2E Playwright

1. utente crea richiesta;
2. seleziona notai;
3. notaio claim;
4. notaio risponde;
5. utente confronta;
6. utente sceglie;
7. document permissions.

---

# 38. Security acceptance tests

- IDOR;
- cross-account document access;
- signed URL expiry;
- role escalation;
- CSRF;
- XSS;
- injection;
- upload malicious file;
- brute force OTP;
- API rate limit;
- PII leakage in logs;
- admin access.

---

# 39. Definition of Done MVP

Il prodotto è pronto per beta quando:

- un utente riesce a inviare una richiesta completa in < 5 minuti;
- può scegliere fino a 3 notai reali dal DB;
- ogni notaio può rivendicare il profilo;
- il notaio riceve la richiesta;
- può chiedere chiarimenti;
- può inviare un preventivo strutturato;
- l'utente può confrontare più preventivi;
- può scegliere un notaio;
- esiste audit log;
- documenti non sono mai cross-visible;
- admin può intervenire su ogni stato;
- eventi analytics coprono tutto il funnel.

---

# 40. KPI beta

Obiettivi da validare, non assunzioni:

- >60% request completion;
- >50% richieste con quality score B o superiore;
- >60% richieste con almeno un preventivo;
- median time first quote < 24h;
- >25% quote → scelta notaio;
- >20% claim dei notai che ricevono una prima richiesta;
- <10% richieste segnalate come non pertinenti/spam.

---

# 41. Priorità strategica

La vera difendibilità del progetto non è il form di preventivo.

È la combinazione:

```text
DB nazionale dei notai
+ SEO
+ dati strutturati sulla domanda
+ lead qualification
+ matching
+ fascicolo utente
+ workflow studio
+ storico delle interazioni
```

Nel tempo produce un **data network effect**:

- più richieste → più dati su ciò che rende una richiesta utile;
- più notai → più copertura e risposta;
- più risposte → matching migliore;
- matching migliore → maggiore conversione;
- maggiore conversione → più utenti e più notai.

---

# 42. Prompt operativo per Codex

Usare questo documento come specifica di prodotto.

## Istruzioni

1. Inizializza un monorepo/app con:
   - Next.js;
   - TypeScript strict;
   - PostgreSQL;
   - Prisma;
   - Tailwind;
   - shadcn/ui;
   - Zod;
   - Playwright.

2. Implementa prima l'MVP descritto nella sezione 24.

3. Crea:
   - schema DB;
   - migrations;
   - seed;
   - auth;
   - RBAC;
   - directory notai;
   - claim flow;
   - request wizard configurabile;
   - matching engine;
   - dashboard utente;
   - dashboard notaio;
   - quote builder;
   - quote comparison;
   - consent/document permissions;
   - admin.

4. Non implementare funzioni future senza feature flag.

5. Non inventare API pubbliche catastali.

6. Non consentire all'AI di determinare automaticamente il compenso.

7. Scrivi test per ogni permission boundary.

8. Ogni mutazione importante deve generare un `AuditLog`.

9. Ogni pagina SEO deve avere:
   - title;
   - description;
   - canonical;
   - breadcrumb;
   - structured data quando appropriato.

10. Implementa gli eventi analytics definiti nei funnel.

---

# 43. Primo piano di lavoro per Codex

## Sprint 1 — Foundation

- project bootstrap;
- auth;
- DB;
- import DB notai;
- directory;
- search;
- notary pages;
- admin base.

## Sprint 2 — Demand

- practice types;
- request wizard;
- completeness;
- user dashboard;
- matching;
- selection 3 notaries;
- notifications.

## Sprint 3 — Supply

- claim;
- notary dashboard;
- inbox;
- request detail;
- accept/decline/question;
- quote builder.

## Sprint 4 — Transaction

- quote receipt;
- quote normalisation;
- comparison;
- messaging;
- choose notary;
- status machine.

## Sprint 5 — Trust & hardening

- audit;
- permissions;
- consent;
- security;
- analytics;
- E2E;
- SEO technical;
- performance.

## Sprint 6 — Beta

- onboarding;
- email lifecycle;
- admin moderation;
- KPI dashboard;
- feedback loops;
- bug fixing.

---

# 44. Domanda di prodotto da validare subito

Prima di aggiungere funzionalità avanzate, misurare:

> **Il notaio percepisce maggior valore da "più lead" oppure da "meno lead, ma completi e realmente lavorabili"?**

L'ipotesi di questo progetto è la seconda.

Se confermata, il marketplace deve ottimizzare la **qualità dell'interazione**, non il volume.

---

# 45. Fonti e assunzioni di partenza

La specifica è stata costruita tenendo conto di:

- principi di piattaforma: core interaction, value unit, filter, pull/facilitate/match, network effects e curation;
- caratteristiche pubblicamente visibili dei principali portali italiani di preventivi notarili;
- necessità di evitare richieste di preventivo incomplete;
- opportunità di strutturare i preventivi senza trasformare il marketplace in un'asta al ribasso;
- uso prudente dell'AI come supporto a estrazione, controllo e redazione;
- DB preesistente di tutti i notai come vantaggio di cold start.

Le scelte deontologiche, fiscali, privacy e di accesso a banche dati ufficiali devono essere validate da professionisti competenti prima della produzione.

---

# 46. Success criterion

Il marketplace vince se riesce a far dire:

### all'utente
> "Non mi ha solo trovato tre prezzi: mi ha aiutato a capire cosa mi serve e ad arrivare preparato dal notaio."

### al notaio
> "Non mi manda nominativi: mi manda pratiche che posso davvero valutare."
