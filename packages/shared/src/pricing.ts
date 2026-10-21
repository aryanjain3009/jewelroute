/** Pricing math shared by API (authoritative) and web (display only). Money = integer paise, weight = integer milligrams. */
export type MakingChargeType = 'PER_GRAM' | 'PERCENT';
export const GST_BPS = 300; // 3% GST on jewellery

export interface PriceInput {
  netWeightMg: number;
  ratePaisePerGram: number;
  makingChargeType: MakingChargeType;
  /** PER_GRAM: paise per gram of net weight. PERCENT: basis points of gold value (1200 = 12%). */
  makingChargeValue: number;
  stoneValuePaise: number;
  otherComponents?: { label: string; valuePaise: number }[];
}

export interface PriceResult {
  goldValuePaise: number; makingPaise: number; stonePaise: number; otherPaise: number;
  unitPricePaise: number; gstPaise: number; totalWithGstPaise: number;
}

/** Round half-up to integer paise. All intermediate maths in integers (mg * paise/g / 1000). */
const div = (a: number, b: number) => Math.floor((a * 2 + b) / (2 * b));

export function priceDesign(i: PriceInput): PriceResult {
  const goldValuePaise = div(i.netWeightMg * i.ratePaisePerGram, 1000);
  const makingPaise = i.makingChargeType === 'PER_GRAM'
    ? div(i.netWeightMg * i.makingChargeValue, 1000)
    : div(goldValuePaise * i.makingChargeValue, 10000);
  const stonePaise = i.stoneValuePaise || 0;
  const otherPaise = (i.otherComponents ?? []).reduce((s, c) => s + (c.valuePaise || 0), 0);
  const unitPricePaise = goldValuePaise + makingPaise + stonePaise + otherPaise;
  const gstPaise = div(unitPricePaise * GST_BPS, 10000);
  return { goldValuePaise, makingPaise, stonePaise, otherPaise, unitPricePaise, gstPaise, totalWithGstPaise: unitPricePaise + gstPaise };
}

/** Order totals: GST computed on the subtotal once (not per line) to avoid rounding drift. */
export function orderTotals(lineTotalsPaise: number[]) {
  const subtotalPaise = lineTotalsPaise.reduce((a, b) => a + b, 0);
  const gstPaise = div(subtotalPaise * GST_BPS, 10000);
  return { subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise };
}
