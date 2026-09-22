// Zentrale Housekeeping-Terminologie-Schicht (Briefing "automatische Uebersetzung frei
// eingegebener operativer Texte", Punkt 7) - aktuell bewusst NUR die Architektur: eine Liste
// bekannter Fachbegriffe mit (noch) leeren Fixuebersetzungen je Zielsprache. Sobald fuer einen
// Begriff eine verbindliche Uebersetzung feststeht, wird sie hier eingetragen - buildGlossaryHint()
// nimmt sie dann automatisch in den Uebersetzungs-Prompt auf, ohne dass api/_translate.js
// angefasst werden muss. Es werden bewusst KEINE Uebersetzungen erfunden/vorbelegt (Briefing:
// "nicht jetzt schon alle Uebersetzungen manuell erfinden - Ziel ist zunaechst nur eine
// Architektur, in der spaeter feste Terminologie ergaenzt werden kann").
const GLOSSARY_TERMS = [
  { de: 'Babybett', en: null, pl: null, ro: null },
  { de: 'Schlafsofa', en: null, pl: null, ro: null },
  { de: 'Hund', en: null, pl: null, ro: null },
  { de: 'Zwischenreinigung', en: null, pl: null, ro: null },
  { de: 'Abreise', en: null, pl: null, ro: null },
  { de: 'Anreise', en: null, pl: null, ro: null },
  { de: 'Early Check-in', en: null, pl: null, ro: null },
  { de: 'Late Check-out', en: null, pl: null, ro: null },
  { de: 'Apartment', en: null, pl: null, ro: null },
  { de: 'Reinigung', en: null, pl: null, ro: null },
  { de: 'Housekeeping', en: null, pl: null, ro: null },
  { de: 'wichtiger Hinweis', en: null, pl: null, ro: null },
  { de: 'Schlüsselbox', en: null, pl: null, ro: null },
  { de: 'Bettwäsche', en: null, pl: null, ro: null },
  { de: 'Handtücher', en: null, pl: null, ro: null },
];

// Liefert einen Prompt-Zusatz nur fuer Begriffe, die fuer MINDESTENS eine der angefragten
// Zielsprachen bereits eine Fixuebersetzung tragen - aktuell also immer '' (kein Hinweis), bis die
// Liste oben tatsaechlich befuellt wird. Absichtlich ein No-op-Platzhalter fuer spaeter, keine
// aktive Logik, die heute schon etwas uebersetzt.
function buildGlossaryHint(targetLanguages) {
  const lines = [];
  for (const term of GLOSSARY_TERMS) {
    const fixed = (targetLanguages || [])
      .filter((lang) => term[lang])
      .map((lang) => `${lang}: "${term[lang]}"`);
    if (fixed.length > 0) lines.push(`"${term.de}" -> ${fixed.join(', ')}`);
  }
  return lines.length > 0 ? lines.join('\n') : '';
}

module.exports = { GLOSSARY_TERMS, buildGlossaryHint };
