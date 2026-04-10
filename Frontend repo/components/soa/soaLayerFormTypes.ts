import type { SOAPreviewRow } from './soaAgentTypes';
import { layerText } from './soaAgentUtils';

export type LayerFormValues = {
  layer1: string;
  layer2: string;
  layer3: string;
  layer4: string;
  layer5: string;
  layer6: string;
  layer7: string;
  layer8: string;
};

export const EMPTY_LAYERS: LayerFormValues = {
  layer1: '',
  layer2: '',
  layer3: '',
  layer4: '',
  layer5: '',
  layer6: '',
  layer7: '',
  layer8: '',
};

export const LAYER_SAVE_MAP: Partial<Record<keyof LayerFormValues, string>> = {
  layer1: 'layer_client_situation',
  layer2: 'layer_regulatory_gate',
  layer3: 'layer_market_scan',
  layer4: 'layer_quant_matrix',
  layer5: 'layer_recommendation',
  layer6: 'layer_sensitivity',
  layer7: 'layer_risks',
  layer8: 'layer_commission',
};

export type SentencePick = { sentence_key: string; sentence: string };

/** Builds form defaults from step 4 `output_json` with SOA jsonb fallbacks. */
export function buildLayerDefaults(L: Record<string, unknown>, soa: SOAPreviewRow | null | undefined): LayerFormValues {
  return {
    layer1: layerText(L.layer1_client_situation) || layerText(soa?.layer_client_situation),
    layer2: layerText(L.layer2_regulatory_gate) || layerText(soa?.layer_regulatory_gate),
    layer3: layerText(L.layer3_market_scan) || layerText(soa?.layer_market_scan),
    layer4: layerText(L.layer4_quantitative) || layerText(soa?.layer_quant_matrix),
    layer5: layerText(L.layer5_recommendation) || layerText(soa?.layer_recommendation),
    layer6: layerText(L.layer6_sensitivity) || layerText(soa?.layer_sensitivity),
    layer7: layerText(L.layer7_risks) || layerText(soa?.layer_risks),
    layer8: layerText(L.layer8_commission) || layerText(soa?.layer_commission),
  };
}
