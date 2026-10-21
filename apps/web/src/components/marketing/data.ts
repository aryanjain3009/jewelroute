// Illustrative product data for the landing page. Prices are computed with the same shared
// pricing code the API uses, so every rupee shown here is arithmetically real.
import { priceDesign } from "@jewelroute/shared";

export const RATE_22K = 1052500; // paise per gram — ₹10,525/g
export const PIECE = {
  tag: "AJ-S-000123",
  name: "Rajwada bangle",
  purity: "K22",
  netWeightMg: 24500,
  grossWeightMg: 25100,
  makingPerGramPaise: 65000,
};
export const PIECE_PRICE = priceDesign({ netWeightMg: PIECE.netWeightMg, ratePaisePerGram: RATE_22K, makingChargeType: "PER_GRAM", makingChargeValue: PIECE.makingPerGramPaise, stoneValuePaise: 0 });

export const JHUMKA = { tag: "AJ-S-000131", name: "Noor jhumka pair", purity: "K22", netWeightMg: 11200, makingPerGramPaise: 80000 };
export const JHUMKA_PRICE = priceDesign({ netWeightMg: JHUMKA.netWeightMg, ratePaisePerGram: RATE_22K, makingChargeType: "PER_GRAM", makingChargeValue: JHUMKA.makingPerGramPaise, stoneValuePaise: 0 });
