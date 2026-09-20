'use client';

import { useEffect, useState } from 'react';
import type { ApaleoUnit } from '@/lib/housekeeping/types';
import { getPropertyDisplayName } from '@/lib/housekeeping/api';
import type { HousekeepingApp } from '@/lib/housekeeping/useHousekeepingApp';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconNfc } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export interface NfcSettingsScreenProps {
  app: HousekeepingApp;
}

function nfcUnitKey(propertyCode: string, unitId: string): string {
  return `${propertyCode}|${unitId}`;
}

interface NfcUnitRowProps {
  app: HousekeepingApp;
  propertyCode: string;
  unitId: string;
  unitName: string;
}

/**
 * Eine Zeile pro Apartment (Punkt "Pro Apartment") - haelt ihr eigenes, kleines UI-Zwischenstadium
 * (geoeffnete Inhalts-Box mit der zuletzt abgefragten/erzeugten URL) lokal, damit ein Reveal einer
 * Zeile nicht alle anderen Zeilen mit-rendert. Ruft fuer alle eigentlichen Aktionen ausschliesslich
 * die bereits im Hook vorhandenen NFC-Aktionen auf (keine eigene Fetch-/Redis-Logik hier).
 */
function NfcUnitRow({ app, propertyCode, unitId, unitName }: NfcUnitRowProps) {
  const { state, t, showToast, createNfcTag, revealNfcTag, deactivateNfcTag, replaceNfcTag } = app;
  const status = state.nfcTags[nfcUnitKey(propertyCode, unitId)];
  const active = !!status?.active;
  const [busy, setBusy] = useState(false);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function copyToClipboard(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('nfc_copied'));
    } catch {
      showToast(url);
    }
  }

  async function handleSetup() {
    setBusy(true);
    const url = await createNfcTag(propertyCode, unitId, unitName);
    setBusy(false);
    if (url) {
      setRevealedUrl(url);
      setExpanded(true);
    }
  }

  async function ensureRevealed(): Promise<string | null> {
    if (revealedUrl) return revealedUrl;
    setBusy(true);
    const url = await revealNfcTag(propertyCode, unitId);
    setBusy(false);
    if (url) setRevealedUrl(url);
    return url;
  }

  async function handleToggleShow() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    const url = await ensureRevealed();
    if (url) setExpanded(true);
  }

  async function handleCopy() {
    const url = await ensureRevealed();
    if (url) await copyToClipboard(url);
  }

  async function handleTest() {
    const url = await ensureRevealed();
    if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleDeactivate() {
    if (typeof window !== 'undefined' && !window.confirm(t('nfc_deactivate_confirm'))) return;
    const ok = await deactivateNfcTag(propertyCode, unitId);
    if (ok) {
      setRevealedUrl(null);
      setExpanded(false);
    }
  }

  async function handleReplace() {
    if (typeof window !== 'undefined' && !window.confirm(t('nfc_replace_confirm'))) return;
    setBusy(true);
    const url = await replaceNfcTag(propertyCode, unitId, unitName);
    setBusy(false);
    if (url) {
      setRevealedUrl(url);
      setExpanded(true);
    }
  }

  return (
    <div className="rounded-control border border-line bg-warm-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-ink">{unitName}</span>
        {active ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-sage">
            <IconCheck width={14} height={14} aria-hidden="true" />
            {t('nfc_active')}
          </span>
        ) : (
          <span className="text-[12.5px] text-muted">{t('nfc_not_configured')}</span>
        )}
      </div>

      {!active ? (
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={handleSetup} disabled={busy}>
          {t('nfc_setup_button')}
        </Button>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleToggleShow} disabled={busy}>
              {expanded ? t('close') : t('nfc_show_url')}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleTest} disabled={busy}>
              {t('nfc_test_button')}
            </Button>
          </div>

          {expanded && revealedUrl ? (
            <div className="mt-3 rounded-control border border-line bg-surface p-3">
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-muted">{t('nfc_tag_content_title')}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                <span className="text-muted">{t('nfc_tag_type_label')}</span>
                <span className="font-medium text-ink">{t('nfc_tag_type_value')}</span>
              </div>
              <p className="mt-2 text-[12px] text-muted">{t('nfc_tag_content_label')}</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-warm-white px-2.5 py-1.5 text-[12.5px] text-ink">
                  {revealedUrl}
                </code>
                <Button variant="ghost" size="sm" onClick={handleCopy}>{t('nfc_copy')}</Button>
              </div>
              <p className="mt-2.5 text-[12px] text-muted">{t('nfc_instructions')}</p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-[12.5px]">
            <button type="button" onClick={handleReplace} disabled={busy} className="font-medium text-muted hover:text-ink">
              {t('nfc_replace_button')}
            </button>
            <button type="button" onClick={handleDeactivate} disabled={busy} className="font-medium text-muted hover:text-ink">
              {t('nfc_deactivate_button')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * NFC-Tag-Verwaltung (Admin-Einstellungen) - Standorte/Apartments kommen ausschliesslich aus den
 * bereits geladenen Apaleo-Planungsdaten (state.planningUnits, dieselbe Quelle wie die
 * Aufgabenplanung) - keine hartcodierten Apartmentnamen. Wird erst bei Bedarf sichtbar (in
 * SettingsSheet nur fuer role==='admin' eingebunden) und laedt den NFC-Status dann lazy nach.
 */
export function NfcSettingsScreen({ app }: NfcSettingsScreenProps) {
  const { state, t, loadNfcTags } = app;

  useEffect(() => {
    loadNfcTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unitsByProperty = new Map<string, ApaleoUnit[]>();
  for (const unit of state.planningUnits) {
    const code = unit.property?.code || unit.property?.id;
    if (!code) continue;
    if (!unitsByProperty.has(code)) unitsByProperty.set(code, []);
    unitsByProperty.get(code)!.push(unit);
  }

  const groups = state.properties
    .filter((p) => unitsByProperty.has(p.code))
    .map((p) => ({
      property: p,
      units: (unitsByProperty.get(p.code) || []).slice().sort((a, b) =>
        String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { numeric: true })),
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconNfc width={18} height={18} className="text-muted" aria-hidden="true" />
        <h4 className="italic text-lg text-[#17160f]">{t('nfc_settings_title')}</h4>
      </div>
      <p className="text-[13px] text-muted">{t('nfc_settings_description')}</p>

      {state.nfcTagsLoading && groups.length === 0 ? (
        <p className="text-[13px] text-muted">{t('loading')}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ property, units }) => (
            <div key={property.code}>
              <h5 className={cn('mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted')}>
                {getPropertyDisplayName(property)}
              </h5>
              <div className="flex flex-col gap-2">
                {units.map((unit) => (
                  <NfcUnitRow
                    key={unit.id}
                    app={app}
                    propertyCode={property.code}
                    unitId={unit.id}
                    unitName={String(unit.name || unit.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
