// Server-seitige Uebersetzungs-Abstraktion (Briefing "automatische Uebersetzung frei eingegebener
// operativer Texte") - der Rest der App kennt ausschliesslich translateText()/translateTextBatch()/
// buildFreeTextTranslation(), nie den dahinterliegenden Provider (Punkt 5 "Provider abstrahieren").
//
// Provider: Anthropic Messages API per rohem fetch - keine neue Abhaengigkeit, analog zum
// bestehenden "kein SDK, rohes fetch"-Muster (siehe api/_apaleo.js, api/_slack.js). Der API-Key
// wird AUSSCHLIESSLICH hier per process.env.ANTHROPIC_API_KEY gelesen - nie im Client, nie in
// NEXT_PUBLIC_*, nie geloggt (Punkt 6).
//
// Wirft NIE: jeder Call liefert ein Ergebnisobjekt mit Status pro Zielsprache. Ein Fehlschlag
// einer einzelnen Zielsprache blockiert nie die anderen Zielsprachen oder das primaere Speichern
// des Aufrufers (Punkt 12 "Original erfolgreich gespeichert / Uebersetzung RO fehlgeschlagen") -
// analog zu _slack.js#sendIncidentToSlack, das ebenfalls nie wirft und einen strukturierten
// { delivered, error }-artigen Rueckgabewert liefert.
const { buildGlossaryHint } = require('./_translation-glossary');

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const ALL_TARGET_LANGUAGES = ['de', 'en', 'pl', 'ro'];

// Punkt 13: striktes Anti-Halluzinations-System-Prompt woertlich aus dem Briefing uebernommen,
// nur um die Ausgabeform (JSON-Objekt je Sprachcode) ergaenzt.
const SYSTEM_PROMPT = `Du bist ein praeziser Uebersetzer fuer Housekeeping-Texte einer Apartmentvermietung.
Übersetze ausschließlich den bereitgestellten Housekeeping-Text.
Füge keine Informationen, Erklärungen oder Anweisungen hinzu.
Entferne keine Informationen.
Erhalte Zahlen, Uhrzeiten, Apartmentnamen, Eigennamen und Codes unverändert.
Gib ausschließlich ein JSON-Objekt zurück, dessen Schlüssel die angeforderten Sprachcodes sind und
dessen Werte jeweils NUR die Übersetzung sind - kein zusätzlicher Text, keine Markdown-Codeblöcke,
keine Erklärungen.`;

function stripCodeFence(raw) {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

// Batch-Variante (Punkt 5) - ein einzelner Anfrage/Antwort-Zyklus fuer beliebig viele
// Zielsprachen gleichzeitig statt eines Calls pro Sprache.
async function translateTextBatch({ text, sourceLanguage, targetLanguages }) {
  const translations = {};
  const translationStatus = {};
  const targets = Array.from(new Set((targetLanguages || []).filter((l) => l && l !== sourceLanguage)));
  if (!text || !text.trim() || targets.length === 0) {
    return { translations, translationStatus };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    for (const lang of targets) translationStatus[lang] = 'failed';
    return { translations, translationStatus };
  }

  try {
    const glossaryHint = buildGlossaryHint(targets);
    const userPrompt = [
      `Quellsprache: ${sourceLanguage}`,
      `Zielsprachen (JSON-Schlüssel in der Antwort): ${targets.join(', ')}`,
      glossaryHint ? `Feste Terminologie (falls im Text enthalten, exakt so übersetzen):\n${glossaryHint}` : null,
      `Zu übersetzender Housekeeping-Text:\n${text}`,
    ].filter(Boolean).join('\n\n');

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[api/_translate] Anthropic antwortete mit', res.status, body.slice(0, 300));
      for (const lang of targets) translationStatus[lang] = 'failed';
      return { translations, translationStatus };
    }

    const data = await res.json();
    const raw = (data.content || []).map((block) => block.text || '').join('').trim();
    let parsed;
    try {
      parsed = JSON.parse(stripCodeFence(raw));
    } catch {
      console.error('[api/_translate] Antwort war kein gueltiges JSON:', raw.slice(0, 300));
      for (const lang of targets) translationStatus[lang] = 'failed';
      return { translations, translationStatus };
    }

    for (const lang of targets) {
      const value = parsed && typeof parsed === 'object' ? parsed[lang] : null;
      if (typeof value === 'string' && value.trim()) {
        translations[lang] = value.trim();
        translationStatus[lang] = 'ready';
      } else {
        translationStatus[lang] = 'failed';
      }
    }
    return { translations, translationStatus };
  } catch (err) {
    console.error('[api/_translate]', err.message || err);
    for (const lang of targets) translationStatus[lang] = 'failed';
    return { translations, translationStatus };
  }
}

// Einzelsprachen-Bequemlichkeitsfunktion ueber translateTextBatch() (Punkt 5, optionale Variante).
async function translateText({ text, sourceLanguage, targetLanguage }) {
  const { translations, translationStatus } = await translateTextBatch({
    text, sourceLanguage, targetLanguages: [targetLanguage],
  });
  return {
    translation: translations[targetLanguage] || null,
    status: translationStatus[targetLanguage] || 'failed',
  };
}

// Baut das vollstaendige FreeTextTranslation-Objekt (siehe types.ts) fuer EINEN Quelltext - von
// api/task-notices.js und api/manual-tasks.js genutzt, damit beide denselben Datensatz-Aufbau
// erzeugen (Punkt 2: sourceText bleibt unveraendert, hoechstens 3 Uebersetzungen je Text).
async function buildFreeTextTranslation(text, sourceLanguage) {
  const targets = ALL_TARGET_LANGUAGES.filter((l) => l !== sourceLanguage);
  const { translations, translationStatus } = await translateTextBatch({ text, sourceLanguage, targetLanguages: targets });
  return {
    sourceLanguage,
    sourceText: text,
    translations,
    translationStatus,
    translatedAt: Date.now(),
  };
}

module.exports = { translateText, translateTextBatch, buildFreeTextTranslation, ALL_TARGET_LANGUAGES };
