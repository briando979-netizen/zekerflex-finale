// GEMAAKT door scripts/esco-beroepen.mjs op 2026-11-16 — niet met de hand aanpassen; pas ZOEK/NIET in het script aan.
// Bron: ESCO, de Europese beroepenlijst (https://esco.ec.europa.eu, gratis, hergebruik toegestaan met bronvermelding).
// Per vaste functie (lib/shifts/catalogus.ts) het ESCO-beroep met de naam in de talen van de werker-app. Een taal die ESCO
// (nog) niet heeft, ontbreekt; dan toont de app niets extra.

export interface EscoBeroep {
  /** het nummer van het beroep bij ESCO (het adres is data.europa.eu/esco/occupation/<id>) */
  id: string;
  nl: string;
  en?: string;
  pl?: string;
  ro?: string;
  uk?: string;
}

export const ESCO_BEROEPEN: Record<string, EscoBeroep> = {
  vakkenvuller: { id: "d35f9e79-5778-43b4-8667-0e3ba1fcb19a", nl: "schappenvuller", en: "shelf filler", pl: "pracownik rozkładający towar na półkach", ro: "manipulant marfă la raft", uk: "укладальник товару/укладальниця товару" },
  kassa: { id: "2b871272-bd61-4206-bd1a-0b96d7023098", nl: "kassamedewerker", en: "cashier", pl: "kasjer/kasjerka", ro: "casier/casieră", uk: "касир/касирка" },
  verkoop: { id: "9ba74e8a-c40c-4228-9998-eb3c7a5c11df", nl: "verkoopmedewerker", en: "sales assistant", pl: "sprzedawca/sprzedawczyni", ro: "asistent vânzări", uk: "асистент із продажу/асистентка із продажу" },
  "bakkerij-verkoop": { id: "2e9c9404-0d86-453c-9001-3a0cd1d1323b", nl: "verkoopspecialist brood en banket", en: "bakery specialised seller", pl: "sprzedawca produktów cukierniczych i pieczywa", ro: "vânzător specializat magazin panificație", uk: "продавець хлібобулочних виробів/продавчиня хлібобулочних виробів" },
  horeca: { id: "d5db9d5c-2ebf-4a54-a79a-1b7e7ff70471", nl: "ober/serveerster", en: "waiter/waitress", pl: "kelner/kelnerka", ro: "ospătar/ospătăriță", uk: "офіціант/офіціантка" },
  barista: { id: "bf7d8b16-4e2c-48ef-b44e-dc25b2d0ab61", nl: "barista", en: "barista", pl: "barista", ro: "barista", uk: "бариста" },
  afwas: { id: "f756fdab-7726-4c48-bfcc-94ff8810fc08", nl: "medewerker keuken", en: "kitchen porter", pl: "pomocnik kuchenny", ro: "lucrător în bucătărie/lucrătoare în bucătărie", uk: "прибиральник кухні/прибиральниця кухні" },
  keukenhulp: { id: "e1cf6897-158d-4b48-a39e-2a3a8cac216c", nl: "keukenhulp", en: "kitchen assistant", pl: "asystent kuchenny", ro: "ajutor de bucătar/ajutoare de bucătar", uk: "помічник на кухні/помічниця на кухні" },
  kok: { id: "90f75f67-495d-49fa-ab57-2f320e251d7e", nl: "kok", en: "cook", pl: "kucharz/kucharka", ro: "bucătar/bucătăreasă", uk: "кухар/кухарка" },
  magazijn: { id: "bea705fe-06ac-4147-b8e0-6e8ac1208d8f", nl: "magazijnmedewerker", en: "warehouse worker", pl: "pracownik magazynu", ro: "lucrător depozit", uk: "складський працівник/складська працівниця" },
  orderpicker: { id: "cd94def5-3442-4c2e-ae3d-0761a3008bcb", nl: "orderpicker", en: "warehouse order picker", pl: "pracownik magazynu kompletujący zamówienia", ro: "lucrător comenzi depozit", uk: "комплектувальник замовлень на складі/комплектувальниця замовлень на складі" },
  heftruck: { id: "eeac6251-1974-42f5-91ed-513c6c883755", nl: "heftruckchauffeur", en: "forklift operator", pl: "operator wózka widłowego", ro: "operator stivuitor", uk: "машиніст-оператор навантажувальних машин/машиністка-операторка навантажувальних машин" },
  inpakker: { id: "f5cb9901-86fc-48d0-9cde-667fbe8cef3a", nl: "inpakker met de hand", en: "hand packer", pl: "pakowacz ręczny/pakowaczka ręczna", ro: "ambalator manual", uk: "ручний пакувальник/ручна пакувальниця" },
  "chauffeur-c": { id: "45037d43-a8f5-4f46-b332-b2935bc305f4", nl: "vrachtwagenchauffeur", en: "cargo vehicle driver", pl: "kierowca samochodu ciężarowego", ro: "șofer autocamion", uk: "водій вантажівки/водійка вантажівки" },
  voedingsmiddelen: { id: "e3dc66de-99c7-4607-a82b-7244036d316d", nl: "medewerker voedselproductie", en: "food production operator", pl: "operator produkcji żywności", ro: "operator la fabricarea produselor alimentare/operatoare la fabricarea produselor alimentare", uk: "оператор виробництва харчових продуктів/операторка виробництва харчових продуктів" },
  schoonmaak: { id: "303a1e34-cb16-4054-b323-81e5eec17397", nl: "schoonmaker gebouwen", en: "building cleaner", pl: "sprzątacz budynków/sprzątaczka budynków", ro: "lucrător curățenie clădiri", uk: "прибиральник будівель/прибиральниця будівель" },
  housekeeping: { id: "731ecac4-06e8-4ec2-a559-101fecbd9183", nl: "medewerker huishoudelijke dienst", en: "room attendant", pl: "pokojowy/pokojowa", ro: "lucrător curățenie camere", uk: "покоївка готельного закладу" },
  glazenwasser: { id: "92cba6b4-8fca-49bb-b68c-45c5096fedc9", nl: "glazenwasser", en: "window cleaner", pl: "zmywacz okien", ro: "lucrător curățenie vitrine si geamuri", uk: "мийник вікон/мийниця вікон" },
  oplevering: { id: "303a1e34-cb16-4054-b323-81e5eec17397", nl: "schoonmaker gebouwen", en: "building cleaner", pl: "sprzątacz budynków/sprzątaczka budynków", ro: "lucrător curățenie clădiri", uk: "прибиральник будівель/прибиральниця будівель" },
  festivalbar: { id: "2f5e38a0-6578-4665-bdbd-e2ab505be140", nl: "barman/barvrouw", en: "bartender", pl: "barman/barmanka", ro: "barman", uk: "бармен/барменка" },
  garderobe: { id: "26087cc4-6226-41b0-9f97-9564ebe90dce", nl: "garderobemedewerker", en: "cloak room attendant", pl: "szatniarz/szatniarka", ro: "garderobier/garderobieră", uk: "гардеробник/гардеробниця" },
  promotie: { id: "056f1849-7ff8-4d6f-9b8a-176a610bba44", nl: "promotiemedewerker", en: "promotions demonstrator", pl: "demonstrator wyrobów", ro: "promoter", uk: "демонстратор рекламних акцій/демонстраторка рекламних акцій" },
  sampling: { id: "056f1849-7ff8-4d6f-9b8a-176a610bba44", nl: "promotiemedewerker", en: "promotions demonstrator", pl: "demonstrator wyrobów", ro: "promoter", uk: "демонстратор рекламних акцій/демонстраторка рекламних акцій" },
  beurspromotor: { id: "056f1849-7ff8-4d6f-9b8a-176a610bba44", nl: "promotiemedewerker", en: "promotions demonstrator", pl: "demonstrator wyrobów", ro: "promoter", uk: "демонстратор рекламних акцій/демонстраторка рекламних акцій" },
  beveiliger: { id: "31808988-fc0a-4bc3-9e47-27216d6759f5", nl: "beveiliger", en: "security guard", pl: "pracownik ochrony osób i mienia", ro: "agent securitate", uk: "охоронник/охоронниця" },
  evenementenbeveiliger: { id: "8fc3d559-d61c-418c-ad4a-bf4c6b2909e3", nl: "evenementenbeveiliger", en: "crowd controller", pl: "porządkowy/porządkowa", ro: "agent intervenție pază și ordine", uk: "контролер масових заходів/контролерка масових заходів" },
  "huishoudelijke-hulp": { id: "cbad55a4-c7cf-4ab6-9540-eac72b26729b", nl: "interieurverzorger", en: "domestic cleaner", pl: "sprzątacz domowy/sprzątaczka domowa", ro: "lucrător curățenie casnica", uk: "прибиральник помешкань/прибиральниця помешкань" },
  pedagogisch: { id: "3f74aad8-2d60-4be2-b059-8dba5568d530", nl: "medewerker kinderdagverblijf", en: "child day care worker", pl: "dzienny opiekun małego dziecka / dzienna opiekunka małego dziecka", ro: "lucrător îngrijirea de zi a copilului", uk: "працівник із денного догляду за дітьми/працівниця із денного догляду за дітьми" },
  receptie: { id: "f7b04542-d8c7-42db-8475-e63b507cce82", nl: "receptionist", en: "receptionist", pl: "recepcjonista/recepcjonistka", ro: "recepționer/recepționeră", uk: "секретар приймальні/секретарка приймальні" },
  administratie: { id: "044d78cc-f62f-4532-83a5-8e04f2889652", nl: "administratief medewerker", en: "administrative assistant", pl: "technik administracji", ro: "asistent administrativ/asistentă administrativă", uk: "помічник з адміністративних питань/помічниця з адміністративних питань" },
  "data-entry": { id: "6353b3e8-e8f2-4ecb-b230-186927139892", nl: "datatypist", en: "data entry clerk", pl: "specjalista ds. wprowadzania danych", ro: "funcționar introducere date", uk: "оператор з уведення даних/операторка з уведення даних" },
  bouwplaats: { id: "fb7e2f4f-1545-42f1-972e-94082e49c6dc", nl: "opperman bouw", en: "building construction worker", pl: "pomocniczy robotnik budowlany", ro: "muncitor construcții clădiri", uk: "робітник-будівельник/робітниця-будівельниця" },
  schilder: { id: "15620506-fb5d-49cd-87a2-1c9047fb406a", nl: "schilder bouw", en: "construction painter", pl: "malarz", ro: "zugrav/zugrăviță", uk: "будівельний маляр/будівельна малярка" },
  elektromonteur: { id: "4910419f-b4af-4f59-b544-9dbebc8a74f0", nl: "monteur elektrische installaties", en: "electrician", pl: "elektryk", ro: "electrician/electriciană", uk: "електрик/електрикиня" },
  wasstraat: { id: "7cb71c5f-c310-481c-b46b-d0044328758c", nl: "autopoetser", en: "vehicle cleaner", pl: "sprzątacz pojazdów/sprzątaczka pojazdów", ro: "lucrător curățenie vehicule", uk: "мийник транспортних засобів/мийниця транспортних засобів" },
  autopoetser: { id: "7cb71c5f-c310-481c-b46b-d0044328758c", nl: "autopoetser", en: "vehicle cleaner", pl: "sprzątacz pojazdów/sprzątaczka pojazdów", ro: "lucrător curățenie vehicule", uk: "мийник транспортних засобів/мийниця транспортних засобів" },
  bandenwissel: { id: "98c429ad-128e-467e-803a-9a6dc1ceed72", nl: "bandenmonteur", en: "tyre fitter", pl: "mechanik oponiarz", ro: "montator pneuri/montatoare pneuri", uk: "працівник шиномонтажу/працівниця шиномонтажу" },
  automonteur: { id: "4ad4024e-d1d3-4dea-b6d1-2c7948111dce", nl: "automonteur", en: "vehicle technician", pl: "mechanik pojazdów samochodowych", ro: "mecanic calificat autovehicule", uk: "автомеханік" },
  fietsenmaker: { id: "336cf331-8082-4a0c-bf5f-e7c54706211c", nl: "fietsenmaker", en: "bicycle mechanic", pl: "mechanik rowerowy", ro: "reparator de biciclete/reparatoare de biciclete", uk: "механік велосипедів" },
  oogst: { id: "373db468-bd25-4b67-a6e0-4ac79d9a9e85", nl: "plukker", en: "fruit and vegetable picker", pl: "zbieracz owoców i warzyw", ro: "culegator fructe și legume", uk: "збирач фруктів і овочів/збирачка фруктів і овочів" },
  kaswerk: { id: "1a9d99ba-4c08-4864-8f6a-1b0f2b4cf883", nl: "tuinbouwmedewerker", en: "horticulture worker", pl: "pracownik gospodarstwa ogrodniczego", ro: "lucrător horticol/lucrătoare horticolă", uk: "садівник/садівниця" },
  hovenier: { id: "e7970c7a-7769-4002-87d3-0a8ea94fdd6f", nl: "hovenier", en: "landscape gardener", pl: "ogrodnik/ogrodniczka", ro: "peisagist grădini", uk: "садівник/садівниця" },
};
