import type { SoaClientDnaView } from './soaClientDnaTypes';
import type { LayerFormValues } from './soaLayerFormTypes';

type RiskSentence = { sentence_key: string; sentence: string };

/** Appends DNA risk summary to Layer 1 and composes Layer 7 from DNA risk lists + adviser sentence picks. */
export function buildApprovalLayersWithDna(
  values: LayerFormValues,
  dna: SoaClientDnaView | null | undefined,
  riskKeys: string[],
  riskSentences: RiskSentence[],
): LayerFormValues {
  const layer1 =
    dna != null
      ? `${values.layer1}\n\nRisk Assessment: ${String(dna.risk_tier ?? '').toUpperCase()} risk profile. ${dna.underwriting_summary ?? ''}${
          dna.strengths?.length
            ? ` Key strengths: ${dna.strengths.filter(Boolean).join('; ')}.`
            : ''
        }`
      : values.layer1;

  const adviserLines = riskKeys
    .map((k) => riskSentences.find((s) => s.sentence_key === k)?.sentence)
    .filter((t): t is string => Boolean(t));

  const leverageRisks = Array.isArray(dna?.leverage_risks)
    ? (dna.leverage_risks as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  const layer7Parts = [
    ...(dna?.key_risks_top5 ?? []),
    ...(dna?.property_risks ?? []),
    ...leverageRisks,
    ...adviserLines,
  ];

  const layer7 = layer7Parts.length > 0 ? layer7Parts.join('\n\n') : values.layer7;

  return { ...values, layer1, layer7 };
}
