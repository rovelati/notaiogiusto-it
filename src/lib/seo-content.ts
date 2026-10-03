/** Copy SEO riusabile per listing città e pagine servizio pilota. */

export type SeoFaq = { question: string; answer: string };

/** Meta + FAQ orientati a preventivo/costi per listing `/notai/{prov}/{città}`. */
export function cityListingSeo(locationLabel: string, province: string, totalStudios: number) {
  const title = `Preventivo notaio a ${locationLabel}: studi, costi e contatti | NotaioGiusto.it`;
  const description = `Confronta notai a ${locationLabel} (${province}), stima i costi e richiedi un preventivo a più studi. ${totalStudios} studi in zona, con mappa e schede.`;
  const h1 = `Notai e preventivo a ${locationLabel}`;
  const lead =
    totalStudios > 0
      ? `${totalStudios} studi a ${locationLabel} e dintorni: confronta contatti, mappa e chiedi un preventivo chiaro sulla pratica.`
      : `Trova studi a ${locationLabel}, stima i costi della pratica e invia una richiesta di preventivo a più notai.`;

  const faqs: SeoFaq[] = [
    {
      question: `Quanto costa l'onorario di un notaio a ${locationLabel}?`,
      answer: `Dipende dalla pratica (compravendita, mutuo, successione, procura, ecc.), dal valore dell'atto e dalle imposte. Su NotaioGiusto vedi range indicativi per servizio e puoi chiedere preventivi confrontabili agli studi di ${locationLabel}.`,
    },
    {
      question: 'Come si calcola il preventivo del notaio?',
      answer:
        'Un preventivo serio distingue compenso professionale, imposte, tasse, marche e spese vive. Più dettagli dai sulla pratica (valore, parti, documenti, urgenza), più le risposte sono confrontabili.',
    },
    {
      question: 'Chi deve pagare il notaio, chi vende o chi compra?',
      answer:
        'Nella compravendita di solito il notaio è scelto e pagato dall\'acquirente, ma le parti possono accordarsi diversamente. Imposte e anticipazioni seguono regole specifiche dell\'atto: chiedile sempre separate nel preventivo.',
    },
    {
      question: `Come chiedere un preventivo a un notaio a ${locationLabel}?`,
      answer: `Scegli uno o più studi dall'elenco, indica il servizio e i dati della pratica nel funnel guidato. Puoi inviare la stessa richiesta fino a 10 studi della zona di ${locationLabel}.`,
    },
    {
      question: 'Come scegliere il notaio giusto?',
      answer:
        'Guarda sede e distanza, servizi dichiarati, chiarezza del preventivo (compenso vs imposte) e tempi di risposta. Confrontare più studi sulla stessa pratica riduce sorprese al rogito.',
    },
  ];

  return { title, description, h1, lead, faqs };
}

export function cityFaqJsonLd(faqs: SeoFaq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

/** Contenuti rafforzati per la pagina pilota “acquisto prima casa”. */
export const FIRST_HOME_SEO = {
  intro:
    'Serve quando compri la tua prima abitazione e vuoi capire costi notarili, agevolazioni e documenti prima del rogito.',
  practicalDescription:
    'L’acquisto della prima casa è una delle pratiche notarili più richieste: il notaio cura il rogito, le verifiche sull’immobile e gli adempimenti fiscali. Il costo dipende dal prezzo dell’immobile, dall’eventuale mutuo, dalle agevolazioni prima casa e dalle visure necessarie. Un preventivo chiaro separa onorario, imposte e spese vive.',
  documents: [
    'Documento di identità e codice fiscale di acquirente e venditore',
    'Proposta/contratto preliminare o compromesso, se già firmato',
    'Planimetria, visure e dati catastali dell’immobile',
    'Eventuale bozza di mutuo / delibera banca',
    'Documentazione su eventuali detrazioni o agevolazioni prima casa',
  ],
  priceFactors: [
    'Prezzo dell’immobile e base imponibile',
    'Presenza di mutuo ipotecario',
    'Agevolazioni prima casa applicabili',
    'Visure, ispezioni ipotecarie e adempimenti post-rogito',
  ],
  faqs: [
    {
      question: 'Quanto costa il notaio per l’acquisto della prima casa?',
      answer:
        'L’onorario varia con il valore dell’immobile e la complessità (mutuo, agevolazioni, più parti). Alle imposte e alle spese vive va aggiunto il compenso professionale: chiedi sempre la distinzione nel preventivo.',
    },
    {
      question: 'Il preventivo include anche tasse e imposte?',
      answer:
        'Dipende da come lo studio lo presenta. Conviene chiedere uno schema con: compenso notaio, imposte di registro/IVA o altre, imposte ipotecarie/catastali, marche e anticipazioni.',
    },
    {
      question: 'Posso confrontare più notai sullo stesso acquisto?',
      answer:
        'Sì. Con gli stessi dati (prezzo, comune immobile, mutuo sì/no, agevolazione prima casa) puoi inviare la richiesta a più studi e confrontare risposte omogenee.',
    },
    {
      question: 'Quando devo andare dal notaio?',
      answer:
        'Di norma la presenza è necessaria al rogito. Prima puoi scambiare documenti e chiarimenti a distanza; i tempi dipendono da mutuo, documentazione e disponibilità delle parti.',
    },
    {
      question: 'Come richiedere un preventivo per acquisto prima casa?',
      answer:
        'Indica città, prezzo indicativo, se c’è mutuo e se chiedi le agevolazioni prima casa. Su NotaioGiusto parti dalla guida nazionale o dalla pagina locale e apri il funnel preventivo.',
    },
  ] as SeoFaq[],
};
