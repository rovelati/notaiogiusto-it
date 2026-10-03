import { describe, expect, it } from 'vitest';
import { rankServices, type SearchableService, type ServiceSearchTerm } from './service-search';

function service(slug: string, name: string, terms: Array<[string, ServiceSearchTerm['term_type']]>) {
  return {
    id: slug,
    slug,
    name,
    plain_language_name: name,
    search_terms: terms.map(([term, term_type]) => ({ term, term_type })),
  } satisfies SearchableService;
}

const services = [
  service('donazione', 'Donazione', [
    ['donare casa', 'alias'],
    ['regalare casa a un figlio', 'intent'],
    ['intestare casa ai figli', 'intent'],
    ['passare casa ai figli', 'intent'],
    ['donazione con riserva di usufrutto', 'alias'],
    ['dare la casa ai figli mantenendo usufrutto', 'intent'],
  ]),
  service('usufrutto-e-nuda-proprieta', 'Usufrutto e nuda proprietà', [
    ['usufrutto', 'alias'],
    ['nuda proprieta', 'alias'],
    ['vendere nuda proprietà', 'intent'],
    ['rinunciare usufrutto', 'intent'],
    ['dare casa ai figli mantenendo usufrutto', 'intent'],
    ['continuare a vivere nella casa', 'intent'],
  ]),
  service('compravendita-immobiliare', 'Compravendita immobiliare', [
    ['rogito', 'alias'],
    ['comprare casa', 'intent'],
  ]),
  service('preliminare-compravendita', 'Preliminare compravendita', [
    ['compromesso', 'alias'],
    ['preliminare', 'alias'],
  ]),
  service('successione-ereditaria', 'Successione ereditaria', [['eredità', 'alias']]),
  service('rinuncia-eredita', 'Rinuncia eredità', [['rinunciare all eredità', 'intent']]),
  service('divisione-ereditaria', 'Divisione ereditaria', [['dividere eredità', 'intent']]),
  service('testamento', 'Testamento', [['ultime volontà', 'alias']]),
  service('procura', 'Procura', [
    ['delega notarile', 'alias'],
    ['procura a vendere', 'alias'],
  ]),
  service('autenticazione-firme', 'Autenticazione firme', [['autentica firma', 'alias']]),
  service('autentica-copia', 'Autentica copia', [['copia autenticata', 'alias']]),
  service('copia-conforme', 'Copia conforme', [['copia autenticata', 'alias']]),
  service('costituzione-srl', 'Costituzione SRL', [['aprire srl', 'alias']]),
  service('cessione-quote', 'Cessione quote', [['vendere quote srl', 'intent']]),
  service('modifiche-statutarie', 'Modifiche statutarie', [['cambiare statuto srl', 'intent']]),
  service('cessione-azienda', 'Cessione azienda', [['vendere azienda', 'intent']]),
  service('costituzione-servitu', 'Costituzione servitù', [['diritto di passaggio', 'intent']]),
];

const firstSlug = (query: string) => rankServices(query, services, 5)[0]?.service.slug;

describe('service semantic search', () => {
  it.each([
    ['donazione', 'donazione'],
    ['donare casa', 'donazione'],
    ['regalare casa a mio figlio', 'donazione'],
    ['intestare casa ai figli', 'donazione'],
    ['passare casa ai figli', 'donazione'],
    ['usufrutto', 'usufrutto-e-nuda-proprieta'],
    ['nuda proprieta', 'usufrutto-e-nuda-proprieta'],
    ['vendere nuda proprietà', 'usufrutto-e-nuda-proprieta'],
    ['rinunciare usufrutto', 'usufrutto-e-nuda-proprieta'],
    ['rogito', 'compravendita-immobiliare'],
    ['comprare casa', 'compravendita-immobiliare'],
    ['compromesso', 'preliminare-compravendita'],
    ['preliminare', 'preliminare-compravendita'],
    ['eredità', 'successione-ereditaria'],
    ['rinunciare all eredità', 'rinuncia-eredita'],
    ['dividere eredità', 'divisione-ereditaria'],
    ['ultime volontà', 'testamento'],
    ['delega notarile', 'procura'],
    ['procura a vendere', 'procura'],
    ['autentica firma', 'autenticazione-firme'],
    ['aprire srl', 'costituzione-srl'],
    ['vendere quote srl', 'cessione-quote'],
    ['cambiare statuto srl', 'modifiche-statutarie'],
    ['vendere azienda', 'cessione-azienda'],
    ['diritto di passaggio', 'costituzione-servitu'],
  ])('maps “%s” to %s', (query, expected) => {
    expect(firstSlug(query)).toBe(expected);
  });

  it.each([
    ['succesisone', 'successione-ereditaria'],
    ['donazzione', 'donazione'],
    ['usofrutto', 'usufrutto-e-nuda-proprieta'],
    ['compravendtia', 'compravendita-immobiliare'],
    ['proccura', 'procura'],
    ['testamneto', 'testamento'],
  ])('tolerates typo “%s”', (query, expected) => {
    expect(firstSlug(query)).toBe(expected);
  });

  it('returns donation and usufruct for the guiding natural-language case', () => {
    const slugs = rankServices(
      'voglio dare la casa a mio figlio ma continuare a viverci',
      services,
      3,
    ).map((result) => result.service.slug);
    expect(slugs[0]).toBe('donazione');
    expect(slugs).toContain('usufrutto-e-nuda-proprieta');
  });

  it('keeps both copy services for an ambiguous query', () => {
    const slugs = rankServices('copia autenticata', services, 3).map(
      (result) => result.service.slug,
    );
    expect(slugs).toContain('autentica-copia');
    expect(slugs).toContain('copia-conforme');
  });
});
