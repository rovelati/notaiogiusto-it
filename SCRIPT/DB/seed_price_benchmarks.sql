create extension if not exists pgcrypto;
create schema if not exists notai;

-- Benchmark iniziali nazionali.
-- Sono range indicativi per orientare l'utente e alimentare il funnel preventivi.
-- Non sono tariffe ufficiali: le tariffe professionali sono liberalizzate e imposte/tasse dipendono dal caso.
with seed(slug, min_eur, avg_eur, max_eur, confidence, evidence, notes) as (
    values
        ('compravendita-immobiliare', 1500, 2250, 3000, 0.620, 'Range pubblico ricorrente per acquisto casa: MutuiOnline indica spesso 1.500-2.000 euro piu imposte; Euroansa riporta 1.500-3.000 euro per prima casa; NotaioFacile pubblica range cittadini piu ampi.', 'Spese complessive indicative per rogito semplice; imposte, valore immobile, prima/seconda casa e mutuo possono cambiare molto il totale.'),
        ('mutuo-ipotecario', 700, 1200, 2000, 0.560, 'Fonti mutui indicano forte variabilita per atto di mutuo in base a banca, importo ipoteca e imposte sostitutive; spesso da sommare alla compravendita.', 'Solo atto di mutuo/stipula finanziamento; se insieme ad acquisto casa il totale va calcolato come pratica combinata.'),
        ('mutuo', 700, 1200, 2000, 0.560, 'Stima coerente con atto di mutuo ipotecario; da validare con preventivi reali.', 'Alias operativo di Mutuo Ipotecario.'),
        ('divisione-immobiliare', 1200, 2200, 4500, 0.480, 'Atto immobiliare complesso con costi dipendenti da numero beni, quote, conguagli e adempimenti fiscali.', 'Range prudente; richiede dati su immobili e parti.'),
        ('permuta-immobiliare', 1400, 2400, 5000, 0.470, 'Atto assimilabile a doppio trasferimento immobiliare, molto variabile in base ai beni scambiati e a eventuale conguaglio.', 'Imposte escluse/variabili.'),
        ('costituzione-servitu', 800, 1400, 2800, 0.460, 'Atto immobiliare specifico; prezzo dipende da complessita tecnica e beni coinvolti.', 'Può richiedere planimetrie, visure e accordi tra fondi.'),
        ('usufrutto-e-nuda-proprieta', 1200, 2200, 4500, 0.500, 'Atto con valore fiscale legato a eta usufruttuario e valore del bene; simile a trasferimenti immobiliari.', 'Imposte molto dipendenti dal caso.'),

        ('atto-di-donazione', 1200, 2100, 3000, 0.590, 'AI overview e fonti pubbliche riportano donazione spesso nellordine 1.200-3.000 euro, variabile per valore beni e grado parentela.', 'Imposte e franchigie dipendono da valore e rapporto tra donante/donatario.'),
        ('donazione', 1200, 2100, 3000, 0.590, 'Alias del benchmark Atto di donazione.', 'Usare come servizio consumer-friendly.'),
        ('successione-ereditaria', 700, 1500, 3000, 0.520, 'Pratiche successorie variabili per numero eredi, immobili, testamento, volture e dichiarazioni.', 'Stima per assistenza notarile; imposte e tributi successori esclusi/variabili.'),
        ('pratica-di-successione', 700, 1500, 3000, 0.520, 'Alias operativo di Successione Ereditaria.', 'Range da validare con preventivi.'),
        ('eredita', 700, 1600, 3200, 0.450, 'Categoria ampia: può includere successione, accettazione, rinuncia o divisione ereditaria.', 'Servizio troppo generico: nel funnel va raffinato.'),
        ('testamento-pubblico', 500, 900, 1600, 0.500, 'Atto personale con complessita variabile; costo spesso inferiore agli atti immobiliari.', 'Richiede presenza e valutazione volontà/testimoni.'),
        ('testamento-segreto', 400, 800, 1500, 0.430, 'Deposito/ricezione testamento con variabilita minore rispetto agli atti immobiliari.', 'Stima prudente.'),
        ('testamento', 400, 850, 1600, 0.500, 'Alias generale dei servizi testamentari.', 'Nel funnel distinguere pubblico, segreto, deposito o pubblicazione.'),
        ('convenzioni-matrimoniali', 600, 1000, 1800, 0.480, 'Separazione beni, fondo patrimoniale e convenzioni hanno costi mediamente inferiori agli atti immobiliari ma dipendono dai beni coinvolti.', 'Da dettagliare in fase preventivo.'),
        ('separazione-dei-beni', 500, 850, 1500, 0.480, 'Servizio standard frequente tra convenzioni matrimoniali.', 'Può costare di più se collegato a trasferimenti patrimoniali.'),
        ('atti-di-famiglia', 600, 1200, 2500, 0.420, 'Macro-categoria da schede; include convenzioni, fondo patrimoniale, patti di famiglia.', 'Nel funnel va trasformata in servizio specifico.'),
        ('amministrazione-di-sostegno', 500, 1000, 2000, 0.390, 'Attività di supporto documentale/atti collegati a persone fragili; variabile in base a provvedimenti e beni.', 'Range preliminare.'),
        ('diritto-di-famiglia', 500, 1200, 2500, 0.350, 'Categoria ampia non idonea a prezzo puntuale.', 'Usare solo come categoria, non come preventivo diretto se possibile.'),

        ('costituzione-srl', 1200, 1800, 2500, 0.560, 'AI overview riporta costituzione SRL spesso 1.500-2.500 euro tra onorario e diritti; fonti pubbliche confermano forte variabilita.', 'Include stima indicativa; diritti, imposte e camera commercio possono variare.'),
        ('costituzione-spa', 1800, 3000, 6000, 0.420, 'Atto societario piu complesso della SRL, con capitale e organi sociali.', 'Range prudente.'),
        ('startup-innovativa', 700, 1300, 2500, 0.400, 'Costituzione societaria con possibili procedure agevolate ma consulenza variabile.', 'Dipende dal tipo societario e dalla procedura.'),
        ('modifiche-statutarie', 900, 1600, 3500, 0.460, 'Variazioni statuto, capitale, sede o oggetto sociale: costi variabili per complessita e adempimenti.', 'Richiede dati societari.'),
        ('cessione-quote', 700, 1200, 2500, 0.470, 'Cessione quote SRL/atti societari spesso standardizzabili, ma dipendono da valore, parti e clausole.', 'Imposte e bolli esclusi/variabili.'),
        ('fusioni-e-scissioni', 2500, 6000, 15000, 0.340, 'Operazioni straordinarie complesse, poco standardizzabili.', 'Richiede preventivo personalizzato.'),
        ('diritto-societario', 900, 1800, 5000, 0.350, 'Categoria ampia, utile per orientamento ma non per prezzo puntuale.', 'Nel funnel va raffinata in costituzione, modifica, cessione quote o operazione straordinaria.'),
        ('societa-e-imprese', 900, 1800, 5000, 0.350, 'Macro-servizio da scheda; stima allineata a diritto societario.', 'Da trasformare in servizio specifico.'),

        ('procura-generale-speciale', 150, 350, 800, 0.520, 'Fonti di studi notarili indicano procure come atti relativamente standard, variabili per complessita, luogo e imposte.', 'Distinguere procura speciale/generale e uso estero.'),
        ('procura', 150, 350, 800, 0.520, 'Alias operativo di Procura Generale/Speciale.', 'Servizio standardizzabile.'),
        ('autenticazione-firme', 50, 120, 300, 0.430, 'Attivita notarile semplice; range prudente nazionale per autentiche non complesse.', 'Può variare per numero firme/documenti.'),
        ('atto-di-notorieta', 100, 250, 600, 0.430, 'Atto dichiarativo spesso standard, variabile per uso e complessita.', 'Richiede testimoni/documentazione.'),
        ('apostille-e-legalizzazioni', 80, 200, 500, 0.380, 'Servizi documentali per uso estero; costo dipende da documento, traduzioni e iter.', 'Traduzioni giurate escluse se non comprese.'),
        ('deposito-atti', 150, 350, 800, 0.380, 'Deposito e conservazione documenti/atti con complessita limitata.', 'Range preliminare.'),
        ('protesto-cambiari', 80, 180, 500, 0.320, 'Servizio specifico e meno frequente; stima iniziale prudente.', 'Da validare con fonte specialistica.'),
        ('consulenza-notarile', 100, 250, 600, 0.420, 'Consulenza preliminare variabile; spesso assorbita nellatto se conferito incarico.', 'Può essere gratuita o a pagamento secondo studio e caso.')
)
insert into notai.service_price_benchmarks (
    service_id,
    location_scope,
    price_min_cents,
    price_avg_cents,
    price_max_cents,
    currency,
    sample_size,
    source,
    confidence,
    evidence,
    payload,
    valid_from
)
select
    st.id,
    'national',
    seed.min_eur * 100,
    seed.avg_eur * 100,
    seed.max_eur * 100,
    'EUR',
    0,
    'public_web_seed_2026',
    seed.confidence,
    seed.evidence,
    jsonb_build_object(
        'notes', seed.notes,
        'includes_taxes', false,
        'includes_professional_fee', true,
        'is_official_tariff', false,
        'needs_case_specific_quote', true,
        'source_urls', jsonb_build_array(
            'https://www.mutuionline.it/guide-mutui/domande-frequenti/quali-sono-i-costi-del-notaio-quando-si-compra-casa.asp',
            'https://www.notaiofacile.it/contenuti/tariffe-notarili-aggiornate.html',
            'https://www.notaiofacile.it/blog/esistono-tariffe-notarili-scopriamo-i-costi-del-notaio.html',
            'https://www.euroansa.it/guide/domande-frequenti/quanto-costa-il-notaio-per-acquisto-casa-con-mutuo',
            'https://www.bancobpm.it/magazine/privati/realizza-i-tuoi-progetti/acquisto-prima-casa-come-calcolare-il-preventivo-del-notaio/'
        )
    ),
    date '2026-08-13'
from seed
join notai.services_taxonomy st on st.slug = seed.slug
on conflict (service_id, location_scope, coalesce(comune, ''), coalesce(province, ''), coalesce(region, ''), source, valid_from)
do update set
    price_min_cents = excluded.price_min_cents,
    price_avg_cents = excluded.price_avg_cents,
    price_max_cents = excluded.price_max_cents,
    confidence = excluded.confidence,
    evidence = excluded.evidence,
    payload = excluded.payload,
    updated_at = now();
