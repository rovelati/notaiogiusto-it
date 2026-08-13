export type IntakeField = {
  name: string;
  label: string;
  type: 'text' | 'select' | 'textarea' | 'number';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  required?: boolean;
  help?: string;
};

export type ServiceIntake = {
  profile: string;
  title: string;
  intro: string;
  fields: IntakeField[];
  documentHints: string[];
};

type ServiceLike = {
  slug?: string | null;
  category?: string | null;
  name?: string | null;
  plain_language_name?: string | null;
  user_intent?: string | null;
  required_documents?: unknown[] | null;
};

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function resolveIntakeProfile(service: ServiceLike) {
  const blob = `${service.slug || ''} ${service.category || ''} ${service.name || ''} ${service.plain_language_name || ''}`.toLowerCase();
  if (includesAny(blob, ['successione', 'eredita', 'testamento'])) return 'successione';
  if (includesAny(blob, ['donazione'])) return 'donazione';
  if (includesAny(blob, ['mutuo', 'ipoteca', 'surroga'])) return 'mutuo';
  if (includesAny(blob, ['srl', 'societ', 'start-up', 'startup', 'costituzione'])) return 'societa';
  if (includesAny(blob, ['procura', 'delega'])) return 'procura';
  if (includesAny(blob, ['autentica', 'copia', 'traduzione', 'dichiarazione-sostitutiva'])) return 'autentica';
  if (includesAny(blob, ['acquisto', 'compravendita', 'preliminare', 'casa', 'immobile', 'vendita'])) return 'acquisto';
  return 'generico';
}

export function getServiceIntake(service: ServiceLike): ServiceIntake {
  const profile = resolveIntakeProfile(service);
  const serviceName = service.plain_language_name || service.name || 'pratica notarile';
  const docs = Array.isArray(service.required_documents)
    ? service.required_documents.map((item) => String(item)).filter(Boolean)
    : [];

  const common: IntakeField[] = [
    {
      name: 'timing_preference',
      label: 'Quando vorresti concludere?',
      type: 'select',
      options: [
        { value: '', label: 'Non indicato' },
        { value: 'flessibile', label: 'Tempi flessibili' },
        { value: 'entro_30_giorni', label: 'Entro 30 giorni' },
        { value: 'entro_7_giorni', label: 'Entro 7 giorni' },
        { value: 'urgente', label: 'Urgente' },
      ],
    },
  ];

  const byProfile: Record<string, ServiceIntake> = {
    acquisto: {
      profile: 'acquisto',
      title: `Dettagli per ${serviceName}`,
      intro:
        service.user_intent ||
        'Per un preventivo confrontabile indica tipo immobile, valore, mutuo e se è prima casa. Questi dati aiutano lo studio a distinguere compenso, imposte e verifiche.',
      documentHints: docs.length
        ? docs
        : [
            'Documento di identità e codice fiscale delle parti',
            'Proposta/compromesso o bozza accordo',
            'Visura catastale / planimetria se disponibile',
            'Eventuale delibera mutuo',
          ],
      fields: [
        {
          name: 'property_type',
          label: 'Tipo immobile',
          type: 'select',
          options: [
            { value: '', label: 'Seleziona' },
            { value: 'appartamento', label: 'Appartamento' },
            { value: 'villa', label: 'Villa / indipendente' },
            { value: 'box', label: 'Box / posto auto' },
            { value: 'terreno', label: 'Terreno' },
            { value: 'altro', label: 'Altro' },
          ],
        },
        {
          name: 'first_home',
          label: 'Agevolazione prima casa?',
          type: 'select',
          options: [
            { value: '', label: 'Non so / non indicato' },
            { value: 'si', label: 'Sì' },
            { value: 'no', label: 'No' },
          ],
        },
        {
          name: 'deal_value',
          label: 'Prezzo / valore indicativo (€)',
          type: 'number',
          placeholder: 'Es. 250000',
        },
        {
          name: 'has_mortgage',
          label: 'C’è un mutuo collegato?',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'si', label: 'Sì' },
            { value: 'no', label: 'No' },
            { value: 'in_corso', label: 'In istruttoria' },
          ],
        },
        {
          name: 'seller_buyer_roles',
          label: 'Ruolo nella pratica',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'acquirente', label: 'Acquirente' },
            { value: 'venditore', label: 'Venditore' },
            { value: 'entrambi_assistiti', label: 'Rappresento entrambe le parti / intermediazione' },
          ],
        },
        ...common,
      ],
    },
    mutuo: {
      profile: 'mutuo',
      title: `Dettagli per ${serviceName}`,
      intro: 'Per il mutuo servono importo, banca e se l’atto è contestuale all’acquisto o autonomo.',
      documentHints: docs.length ? docs : ['Delibera / bozza contratto banca', 'Dati immobile se ipotecato', 'Documenti identità'],
      fields: [
        { name: 'loan_amount', label: 'Importo mutuo (€)', type: 'number', placeholder: 'Es. 180000' },
        { name: 'bank_name', label: 'Banca / intermediario', type: 'text', placeholder: 'Es. banca XYZ' },
        {
          name: 'mortgage_context',
          label: 'Contesto',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'con_acquisto', label: 'Contestuale all’acquisto' },
            { value: 'surroga', label: 'Surroga' },
            { value: 'solo_mutuo', label: 'Solo mutuo / ipoteca' },
          ],
        },
        ...common,
      ],
    },
    successione: {
      profile: 'successione',
      title: `Dettagli per ${serviceName}`,
      intro: 'Indica eredità, immobili coinvolti e se serve solo dichiarazione o anche atti successivi.',
      documentHints: docs.length
        ? docs
        : ['Certificato di morte', 'Stato di famiglia / eredi', 'Visure immobili se noti', 'Eventuale testamento'],
      fields: [
        {
          name: 'heirs_count',
          label: 'Numero eredi coinvolti',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3_plus', label: '3 o più' },
          ],
        },
        {
          name: 'has_will',
          label: 'C’è un testamento?',
          type: 'select',
          options: [
            { value: '', label: 'Non so' },
            { value: 'si', label: 'Sì' },
            { value: 'no', label: 'No' },
          ],
        },
        {
          name: 'includes_real_estate',
          label: 'Ci sono immobili in successione?',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'si', label: 'Sì' },
            { value: 'no', label: 'No' },
            { value: 'da_verificare', label: 'Da verificare' },
          ],
        },
        {
          name: 'succession_goal',
          label: 'Cosa ti serve ora?',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'dichiarazione', label: 'Dichiarazione di successione' },
            { value: 'accettazione', label: 'Accettazione / trascrizione' },
            { value: 'divisione', label: 'Divisione tra eredi' },
            { value: 'orientamento', label: 'Orientamento iniziale' },
          ],
        },
        ...common,
      ],
    },
    donazione: {
      profile: 'donazione',
      title: `Dettagli per ${serviceName}`,
      intro: 'Per la donazione servono bene donato, rapporto tra le parti e valore indicativo.',
      documentHints: docs.length ? docs : ['Documenti identità', 'Titolo di provenienza', 'Visura catastale se immobile'],
      fields: [
        {
          name: 'donation_asset',
          label: 'Cosa si dona?',
          type: 'select',
          options: [
            { value: '', label: 'Seleziona' },
            { value: 'immobile', label: 'Immobile' },
            { value: 'denaro', label: 'Denaro' },
            { value: 'quote', label: 'Quote societarie' },
            { value: 'altro', label: 'Altro' },
          ],
        },
        {
          name: 'relationship',
          label: 'Rapporto donante / donatario',
          type: 'text',
          placeholder: 'Es. genitore-figlio',
        },
        { name: 'deal_value', label: 'Valore indicativo (€)', type: 'number', placeholder: 'Es. 100000' },
        ...common,
      ],
    },
    societa: {
      profile: 'societa',
      title: `Dettagli per ${serviceName}`,
      intro: 'Descrivi forma societaria, oggetto e se hai già bozza di statuto o soci definiti.',
      documentHints: docs.length ? docs : ['Documenti identità soci', 'Bozza atto / statuto', 'Codici ATECO / oggetto sociale'],
      fields: [
        {
          name: 'company_type',
          label: 'Tipo società',
          type: 'select',
          options: [
            { value: '', label: 'Seleziona' },
            { value: 'srl', label: 'SRL' },
            { value: 'srl_s', label: 'SRL semplificata' },
            { value: 'sas_snc', label: 'SAS / SNC' },
            { value: 'altro', label: 'Altro' },
          ],
        },
        { name: 'partners_count', label: 'Numero soci', type: 'text', placeholder: 'Es. 2' },
        {
          name: 'has_draft_statute',
          label: 'Hai già una bozza di atto/statuto?',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'si', label: 'Sì' },
            { value: 'no', label: 'No' },
          ],
        },
        { name: 'business_purpose', label: 'Oggetto sociale (sintesi)', type: 'textarea', placeholder: 'Attività principale...' },
        ...common,
      ],
    },
    procura: {
      profile: 'procura',
      title: `Dettagli per ${serviceName}`,
      intro: 'Specifica se è procura speciale o generale e per quale atto serve.',
      documentHints: docs.length ? docs : ['Documento identità', 'Dati del procuratore', 'Atto per cui serve la procura'],
      fields: [
        {
          name: 'power_type',
          label: 'Tipo procura',
          type: 'select',
          options: [
            { value: '', label: 'Seleziona' },
            { value: 'speciale', label: 'Speciale' },
            { value: 'generale', label: 'Generale' },
          ],
        },
        { name: 'power_purpose', label: 'Per quale atto / finalità?', type: 'text', placeholder: 'Es. vendita immobile, rappresentanza...' },
        {
          name: 'remote_preference',
          label: 'Preferenza di svolgimento',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'in_studio', label: 'In studio' },
            { value: 'da_verificare', label: 'Da verificare se possibile a distanza' },
          ],
        },
        ...common,
      ],
    },
    autentica: {
      profile: 'autentica',
      title: `Dettagli per ${serviceName}`,
      intro: 'Per autentiche e copie indica numero documenti/pagine e urgenza: il costo cambia spesso su questi elementi.',
      documentHints: docs.length
        ? docs
        : ['Documento originale', 'Copia da autenticare se già pronta', 'Documento di identità'],
      fields: [
        { name: 'pages_or_copies', label: 'Pagine / copie richieste', type: 'text', placeholder: 'Es. 2 copie da 4 pagine' },
        {
          name: 'document_kind',
          label: 'Tipo documento',
          type: 'text',
          placeholder: 'Es. contratto, certificato, traduzione...',
        },
        {
          name: 'has_original',
          label: 'Hai l’originale?',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'si', label: 'Sì' },
            { value: 'no', label: 'No' },
            { value: 'solo_scan', label: 'Solo scansione' },
          ],
        },
        ...common,
      ],
    },
    generico: {
      profile: 'generico',
      title: `Dettagli per ${serviceName}`,
      intro:
        service.user_intent ||
        'Descrivi la pratica in modo concreto: oggetto, valore se rilevante, parti e tempistiche. Più dettagli = preventivo più confrontabile.',
      documentHints: docs.length ? docs : ['Documento di identità', 'Documenti relativi alla pratica', 'Bozze o comunicazioni già ricevute'],
      fields: [
        { name: 'deal_value', label: 'Valore economico indicativo (€)', type: 'number', placeholder: 'Se rilevante' },
        {
          name: 'practice_stage',
          label: 'A che punto sei?',
          type: 'select',
          options: [
            { value: '', label: 'Non indicato' },
            { value: 'orientamento', label: 'Orientamento iniziale' },
            { value: 'documenti_parziali', label: 'Ho già alcuni documenti' },
            { value: 'pronta', label: 'Pratica quasi pronta' },
          ],
        },
        ...common,
      ],
    },
  };

  return byProfile[profile];
}

export function collectIntakeValues(form: FormData, fields: IntakeField[]) {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = String(form.get(`intake_${field.name}`) || '').trim();
    if (raw) values[field.name] = raw;
  }
  return values;
}

export function intakeFromSearchParams(params: URLSearchParams, fields: IntakeField[]) {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = (params.get(`intake_${field.name}`) || '').trim();
    if (raw) values[field.name] = raw;
  }
  return values;
}
