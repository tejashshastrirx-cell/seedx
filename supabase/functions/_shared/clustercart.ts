/**
 * SEED X - ClusterCart engine (deterministic, explainable; NOT machine learning).
 *
 * Shared by the browser (preview) and the `run-clustercart` Edge Function (authoritative,
 * persisted run). Pure TypeScript, no imports, so it runs unchanged in Vite and Deno.
 *
 * Money is handled in integer paise. Quantities are converted through explicit unit
 * factors only. Distances are straight-line (haversine) x a documented road factor and
 * are ALWAYS labelled as estimates - this is not a road route.
 */

export const ALGORITHM_VERSION = 'clustercart-1.0.0';

export type Unit = 'kg' | 'quintal' | 'tonne';
export type Grade = 'A' | 'B' | 'C' | 'ungraded';

export const UNIT_TO_KG: Record<Unit, number> = { kg: 1, quintal: 100, tonne: 1000 };
const GRADE_RANK: Record<Grade, number> = { A: 3, B: 2, C: 1, ungraded: 0 };

export function isUnit(u: unknown): u is Unit {
  return u === 'kg' || u === 'quintal' || u === 'tonne';
}

/** Convert a quantity between units. Rounded to 3 decimals (gram precision for kg). */
export function convertQuantity(qty: number, from: Unit, to: Unit): number {
  if (!isUnit(from) || !isUnit(to)) throw new Error(`Unknown unit conversion ${from} -> ${to}`);
  return roundTo((qty * UNIT_TO_KG[from]) / UNIT_TO_KG[to], 3);
}

/** Convert a price per unit (paise) between units, e.g. Rs/quintal -> Rs/kg. */
export function convertPricePerUnit(paisePerUnit: number, from: Unit, to: Unit): number {
  if (!isUnit(from) || !isUnit(to)) throw new Error(`Unknown unit conversion ${from} -> ${to}`);
  return (paisePerUnit / UNIT_TO_KG[from]) * UNIT_TO_KG[to];
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Floor to 3 decimals so an allocation can never exceed available stock through rounding. */
function floor3(n: number): number {
  return Math.floor(n * 1000 + 1e-9) / 1000;
}

/** Gross value in integer paise for quantity x price-per-unit, computed on milli-units. */
export function grossPaise(quantity: number, pricePaisePerUnit: number): number {
  const milli = Math.round(quantity * 1000);
  return Math.round((milli * pricePaisePerUnit) / 1000);
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------------------------------------------------------------------------------- inputs
export interface SupplyCandidate {
  listingId: string;
  farmerId: string;
  title: string;
  commodityId: number;
  varietyId: number | null;
  grade: Grade;
  unit: Unit;
  availableQuantity: number;
  minPricePaisePerUnit: number | null;
  askingPricePaisePerUnit: number | null;
  sellerHandlingPaisePerUnit: number;
  availableFrom: string; // ISO date
  availableUntil: string; // ISO date
  harvestDate: string | null;
  shelfLifeDays: number;
  lat: number | null;
  lng: number | null;
  area: string;
}

export interface DemandInput {
  demandId: string | null;
  commodityId: number;
  varietyId: number | null;
  minGrade: Grade;
  unit: Unit;
  remainingQuantity: number;
  maxPricePaisePerUnit: number | null;
  deliveryFrom: string;
  deliveryUntil: string;
  lat: number | null;
  lng: number | null;
  maxTransitHours: number | null;
  area: string;
}

export interface Vehicle {
  name: string;
  capacityKg: number;
  baseFeePaise: number;
  perKmPaise: number;
  avgSpeedKmph: number;
}

export interface TransportModel {
  vehicles: Vehicle[];
  roadFactor: number;
  loadingMinutesPerStop: number;
  source: string;
}

/** Default, clearly-labelled estimate rate card. Replace with real carrier quotes when available. */
export const DEFAULT_TRANSPORT: TransportModel = {
  vehicles: [
    { name: 'Pickup (1.5 t)', capacityKg: 1500, baseFeePaise: 80000, perKmPaise: 2200, avgSpeedKmph: 35 },
    { name: 'Light truck (4 t)', capacityKg: 4000, baseFeePaise: 150000, perKmPaise: 3200, avgSpeedKmph: 32 },
    { name: 'Truck (9 t)', capacityKg: 9000, baseFeePaise: 250000, perKmPaise: 4500, avgSpeedKmph: 30 },
  ],
  roadFactor: 1.3,
  loadingMinutesPerStop: 30,
  source: 'SEED X estimate: straight-line distance x 1.3 road factor and a default rate card - not a carrier quote or a road route',
};

export interface RunOptions {
  /** Pooling must save at least this fraction versus separate trips to be recommended. */
  minPoolingSaving: number;
  /** Allocations below this size (kg) are skipped to avoid uneconomic micro-trips. */
  minAllocationKg: number;
  today: string; // ISO date, injected for determinism
}

export const DEFAULT_OPTIONS: Omit<RunOptions, 'today'> = { minPoolingSaving: 0.05, minAllocationKg: 50 };

// ---------------------------------------------------------------------------------- outputs
export type ExclusionCode =
  | 'INVALID_QUANTITY'
  | 'MISSING_LOCATION'
  | 'COMMODITY_MISMATCH'
  | 'VARIETY_MISMATCH'
  | 'GRADE_BELOW_MINIMUM'
  | 'PRICE_FLOOR_ABOVE_BUYER_MAX'
  | 'NO_PRICE_BASIS'
  | 'WINDOW_NO_OVERLAP'
  | 'FRESHNESS_WINDOW'
  | 'TRANSIT_TOO_LONG'
  | 'BELOW_MIN_ALLOCATION'
  | 'DEMAND_ALREADY_FILLED';

export interface Exclusion {
  listingId: string;
  title: string;
  code: ExclusionCode;
  detail: string;
}

export interface Allocation {
  listingId: string;
  farmerId: string;
  title: string;
  area: string;
  quantity: number; // in the listing unit
  unit: Unit;
  quantityKg: number;
  pricePaisePerUnit: number; // proposed, in the listing unit
  priceBasis: 'asking_price' | 'buyer_max_price' | 'minimum_price';
  directDistanceKm: number;
  lat: number; // approximate public coordinates (never exact pickup)
  lng: number;
  grossPaise: number;
  sellerHandlingPaise: number;
  farmerNetPaise: number; // gross - seller-paid costs (transport is buyer-paid by default)
  separateTransportPaise: number;
  pooledTransportSharePaise: number;
  reasons: string[];
}

export interface TripPlan {
  vehicle: string;
  trips: number;
  distanceKm: number;
  durationHours: number;
  costPaise: number;
  stops: string[];
}

export interface RunResult {
  algorithmVersion: string;
  status: 'completed' | 'no_feasible_supply';
  recommendation: 'pooled' | 'separate' | 'none';
  demandQuantityKg: number;
  buyer: { lat: number | null; lng: number | null; area: string };
  allocatedKg: number;
  unmatchedKg: number;
  allocations: Allocation[];
  exclusions: Exclusion[];
  separate: { totalPaise: number; perKgPaise: number; trips: TripPlan[] };
  pooled: (TripPlan & { perKgPaise: number; withinTransitLimit: boolean }) | null;
  produceCostPaise: number;
  buyerLandedPerKgPaise: number; // using the recommended plan
  savingsPaise: number; // separate - pooled (may be negative)
  explanation: string[];
  warnings: string[];
  transportSource: string;
}

// ---------------------------------------------------------------------------------- helpers
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function chooseVehicle(totalKg: number, vehicles: Vehicle[]): { vehicle: Vehicle; trips: number } {
  const sorted = [...vehicles].sort((x, y) => x.capacityKg - y.capacityKg);
  const fit = sorted.find((v) => v.capacityKg >= totalKg);
  if (fit) return { vehicle: fit, trips: 1 };
  const largest = sorted[sorted.length - 1];
  return { vehicle: largest, trips: Math.ceil(totalKg / largest.capacityKg) };
}

function tripCost(distanceKm: number, totalKg: number, stops: number, model: TransportModel, stopNames: string[]): TripPlan {
  const { vehicle, trips } = chooseVehicle(totalKg, model.vehicles);
  const perTrip = vehicle.baseFeePaise + Math.round(distanceKm * vehicle.perKmPaise);
  const durationHours = distanceKm / vehicle.avgSpeedKmph + (stops * model.loadingMinutesPerStop) / 60;
  return {
    vehicle: vehicle.name,
    trips,
    distanceKm: roundTo(distanceKm, 1),
    durationHours: roundTo(durationHours, 2),
    costPaise: perTrip * trips,
    stops: stopNames,
  };
}

/** Pooled route: start at the pickup farthest from the buyer, then nearest-neighbour, then the buyer. */
function pooledRoute(points: { id: string; name: string; lat: number; lng: number }[], buyer: { lat: number; lng: number }, roadFactor: number) {
  const remaining = [...points].sort((a, b) =>
    haversineKm(b.lat, b.lng, buyer.lat, buyer.lng) - haversineKm(a.lat, a.lng, buyer.lat, buyer.lng) || a.id.localeCompare(b.id));
  const order = [remaining.shift()!];
  while (remaining.length) {
    const last = order[order.length - 1];
    remaining.sort((a, b) => haversineKm(last.lat, last.lng, a.lat, a.lng) - haversineKm(last.lat, last.lng, b.lat, b.lng) || a.id.localeCompare(b.id));
    order.push(remaining.shift()!);
  }
  let km = 0;
  for (let i = 1; i < order.length; i++) km += haversineKm(order[i - 1].lat, order[i - 1].lng, order[i].lat, order[i].lng);
  const last = order[order.length - 1];
  km += haversineKm(last.lat, last.lng, buyer.lat, buyer.lng);
  return { order, km: km * roadFactor };
}

// ---------------------------------------------------------------------------------- engine
export function runClusterCart(
  demand: DemandInput,
  supply: SupplyCandidate[],
  transport: TransportModel = DEFAULT_TRANSPORT,
  opts: RunOptions,
): RunResult {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const exclusions: Exclusion[] = [];
  const warnings: string[] = [];
  const explanation: string[] = [];
  const demandKg = roundTo(demand.remainingQuantity * UNIT_TO_KG[demand.unit], 3);
  const buyerMaxPerKg = demand.maxPricePaisePerUnit != null ? demand.maxPricePaisePerUnit / UNIT_TO_KG[demand.unit] : null;
  const exclude = (s: SupplyCandidate, code: ExclusionCode, detail: string) => exclusions.push({ listingId: s.listingId, title: s.title, code, detail });

  const empty = (status: RunResult['status'], why: string): RunResult => ({
    algorithmVersion: ALGORITHM_VERSION, status, recommendation: 'none', demandQuantityKg: demandKg, buyer: { lat: demand.lat, lng: demand.lng, area: demand.area }, allocatedKg: 0,
    unmatchedKg: demandKg, allocations: [], exclusions, separate: { totalPaise: 0, perKgPaise: 0, trips: [] }, pooled: null,
    produceCostPaise: 0, buyerLandedPerKgPaise: 0, savingsPaise: 0, explanation: [why], warnings, transportSource: transport.source,
  });

  if (!(demandKg > 0)) return empty('no_feasible_supply', 'The requirement has no remaining quantity to fill.');
  if (demand.lat == null || demand.lng == null) {
    warnings.push('Delivery location has no approximate coordinates; distance-based constraints cannot be evaluated.');
    return empty('no_feasible_supply', 'Add an approximate delivery location to the requirement so routes can be estimated.');
  }

  // A + B: normalise and apply hard constraints BEFORE any ranking.
  type Feasible = { s: SupplyCandidate; priceBasis: Allocation['priceBasis']; pricePerUnit: number; pricePerKg: number; directKm: number; availableKg: number };
  const feasible: Feasible[] = [];
  for (const s of supply) {
    if (!isUnit(s.unit) || !(s.availableQuantity > 0)) { exclude(s, 'INVALID_QUANTITY', 'No available quantity or unknown unit.'); continue; }
    if (s.commodityId !== demand.commodityId) { exclude(s, 'COMMODITY_MISMATCH', 'Different commodity.'); continue; }
    if (demand.varietyId != null && s.varietyId !== demand.varietyId) { exclude(s, 'VARIETY_MISMATCH', 'Variety does not match the requirement.'); continue; }
    if (GRADE_RANK[s.grade] < GRADE_RANK[demand.minGrade]) { exclude(s, 'GRADE_BELOW_MINIMUM', `Grade ${s.grade} is below the required ${demand.minGrade}.`); continue; }
    if (s.lat == null || s.lng == null) { exclude(s, 'MISSING_LOCATION', 'Listing has no approximate pickup location.'); continue; }
    if (s.availableFrom > demand.deliveryUntil || s.availableUntil < demand.deliveryFrom || s.availableUntil < options.today) {
      exclude(s, 'WINDOW_NO_OVERLAP', 'Availability window does not overlap the delivery window.'); continue;
    }
    if (s.harvestDate) {
      const ageAtDelivery = daysBetween(s.harvestDate, demand.deliveryFrom > options.today ? demand.deliveryFrom : options.today);
      if (ageAtDelivery > s.shelfLifeDays) { exclude(s, 'FRESHNESS_WINDOW', `Produce would be ${ageAtDelivery} days from harvest; shelf life ${s.shelfLifeDays} days.`); continue; }
    }
    const minPerKg = s.minPricePaisePerUnit != null ? s.minPricePaisePerUnit / UNIT_TO_KG[s.unit] : null;
    if (minPerKg != null && buyerMaxPerKg != null && minPerKg > buyerMaxPerKg + 1e-9) {
      exclude(s, 'PRICE_FLOOR_ABOVE_BUYER_MAX', 'Farmer minimum price is above the buyer maximum.'); continue;
    }
    // Proposed price (per listing unit): asking price capped at buyer max, never below the farmer minimum.
    let pricePerUnit: number;
    let priceBasis: Allocation['priceBasis'];
    const buyerMaxPerUnit = buyerMaxPerKg != null ? Math.floor(buyerMaxPerKg * UNIT_TO_KG[s.unit]) : null;
    if (s.askingPricePaisePerUnit != null && (buyerMaxPerUnit == null || s.askingPricePaisePerUnit <= buyerMaxPerUnit)) {
      pricePerUnit = s.askingPricePaisePerUnit; priceBasis = 'asking_price';
    } else if (buyerMaxPerUnit != null) {
      pricePerUnit = buyerMaxPerUnit; priceBasis = 'buyer_max_price';
    } else if (s.minPricePaisePerUnit != null) {
      pricePerUnit = s.minPricePaisePerUnit; priceBasis = 'minimum_price';
    } else { exclude(s, 'NO_PRICE_BASIS', 'Neither the listing nor the requirement states a price.'); continue; }
    if (s.minPricePaisePerUnit != null && pricePerUnit < s.minPricePaisePerUnit) pricePerUnit = s.minPricePaisePerUnit;

    const directKm = haversineKm(s.lat, s.lng, demand.lat, demand.lng) * transport.roadFactor;
    const availableKg = s.availableQuantity * UNIT_TO_KG[s.unit];
    const direct = tripCost(directKm, Math.min(availableKg, demandKg), 1, transport, [s.area, demand.area]);
    if (demand.maxTransitHours != null && direct.durationHours > demand.maxTransitHours) {
      exclude(s, 'TRANSIT_TOO_LONG', `Estimated direct transit ${direct.durationHours} h exceeds the ${demand.maxTransitHours} h limit.`); continue;
    }
    feasible.push({ s, priceBasis, pricePerUnit, pricePerKg: pricePerUnit / UNIT_TO_KG[s.unit], directKm, availableKg });
  }

  if (feasible.length === 0) return empty('no_feasible_supply', 'No listing passes the hard constraints. See exclusions for the reason codes.');

  // C: candidate fill orders. (1) cheapest estimated landed cost per kg first; (2) for each feasible
  // listing, a nearest-neighbour cluster seeded from it. Every plan is costed end-to-end (D) and the
  // plan with the lowest total landed cost wins; ties break on fewer pickups, then listing ids.
  const landedPerKg = (f: Feasible) => {
    const kg = Math.min(f.availableKg, demandKg);
    return f.pricePerKg + tripCost(f.directKm, kg, 1, transport, []).costPaise / kg;
  };
  const byCost = [...feasible].sort((a, b) => landedPerKg(a) - landedPerKg(b) || a.directKm - b.directKm || a.s.listingId.localeCompare(b.s.listingId));
  const pool = byCost.slice(0, 25);
  if (byCost.length > pool.length) warnings.push(`Only the 25 lowest-cost of ${byCost.length} feasible listings were considered.`);
  const orders: Feasible[][] = [pool];
  for (const seed of pool) {
    const rest = pool.filter((f) => f !== seed).sort((a, b) =>
      haversineKm(seed.s.lat!, seed.s.lng!, a.s.lat!, a.s.lng!) - haversineKm(seed.s.lat!, seed.s.lng!, b.s.lat!, b.s.lng!) || a.s.listingId.localeCompare(b.s.listingId));
    orders.push([seed, ...rest]);
  }

  type Plan = ReturnType<typeof evaluate>;
  function evaluate(order: Feasible[]) {
    let remaining = demandKg;
    const picked: { f: Feasible; quantity: number; kg: number }[] = [];
    const skipped: { f: Feasible; code: ExclusionCode; detail: string }[] = [];
    for (const f of order) {
      if (remaining <= 0) { skipped.push({ f, code: 'DEMAND_ALREADY_FILLED', detail: 'Requirement already filled by a lower-cost plan.' }); continue; }
      const quantity = floor3(Math.min(f.availableKg, remaining) / UNIT_TO_KG[f.s.unit]);
      const kg = roundTo(quantity * UNIT_TO_KG[f.s.unit], 3);
      if (kg < options.minAllocationKg) { skipped.push({ f, code: 'BELOW_MIN_ALLOCATION', detail: `Only ${kg} kg would be allocated (minimum ${options.minAllocationKg} kg).` }); continue; }
      picked.push({ f, quantity, kg });
      remaining = roundTo(remaining - kg, 3);
    }
    const allocatedKg = roundTo(picked.reduce((t, p) => t + p.kg, 0), 3);
    const separateTrips = picked.map((p) => tripCost(p.f.directKm, p.kg, 1, transport, [p.f.s.area, demand.area]));
    const separateTotal = separateTrips.reduce((t, x) => t + x.costPaise, 0);
    let pooled: RunResult['pooled'] = null;
    if (picked.length > 1) {
      const route = pooledRoute(picked.map((p) => ({ id: p.f.s.listingId, name: p.f.s.area, lat: p.f.s.lat!, lng: p.f.s.lng! })), { lat: demand.lat!, lng: demand.lng! }, transport.roadFactor);
      const plan = tripCost(route.km, allocatedKg, route.order.length, transport, [...route.order.map((o) => o.name), demand.area]);
      pooled = { ...plan, perKgPaise: Math.round(plan.costPaise / allocatedKg), withinTransitLimit: demand.maxTransitHours == null || plan.durationHours <= demand.maxTransitHours };
    }
    const savings = pooled ? separateTotal - pooled.costPaise : 0;
    const usePooled = !!pooled && pooled.withinTransitLimit && savings >= separateTotal * options.minPoolingSaving;
    const produce = picked.reduce((t, p) => t + grossPaise(p.quantity, p.f.pricePerUnit), 0);
    const transportCost = usePooled && pooled ? pooled.costPaise : separateTotal;
    return { picked, skipped, allocatedKg, separateTrips, separateTotal, pooled, savings, usePooled, total: produce + transportCost };
  }

  let best: Plan | null = null;
  const seen = new Set<string>();
  for (const order of orders) {
    const plan = evaluate(order);
    if (plan.picked.length === 0) continue;
    const key = plan.picked.map((p) => `${p.f.s.listingId}:${p.quantity}`).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const better = !best
      || plan.allocatedKg > best.allocatedKg + 1e-6
      || (Math.abs(plan.allocatedKg - best.allocatedKg) <= 1e-6 && (plan.total < best.total
        || (plan.total === best.total && plan.picked.length < best.picked.length)));
    if (better) best = plan;
  }
  if (!best) return empty('no_feasible_supply', 'Feasible listings exist but every allocation would be below the minimum lot size.');
  for (const sk of best.skipped) exclude(sk.f.s, sk.code, sk.detail);
  const { picked, allocatedKg, separateTrips, separateTotal, pooled, savings } = best;
  if (seen.size > 1) explanation.push(`Compared ${seen.size} candidate allocation plans (cheapest-first and nearest-neighbour clusters); chose the lowest total landed cost.`);

  // E: decide.
  let recommendation: RunResult['recommendation'] = 'separate';
  if (!pooled) {
    explanation.push('Only one listing was allocated, so pooling does not apply.');
  } else if (!pooled.withinTransitLimit) {
    explanation.push(`Pooled route would take ~${pooled.durationHours} h, above the buyer's ${demand.maxTransitHours} h limit - separate trips recommended.`);
  } else if (!best.usePooled) {
    explanation.push(`Pooling would change transport cost by ${formatRupees(-savings)} (${pct(savings, separateTotal)} saving), below the ${Math.round(options.minPoolingSaving * 100)}% threshold - separate trips recommended.`);
  } else {
    recommendation = 'pooled';
    explanation.push(`Pooling ${picked.length} pickups into one ${pooled.vehicle} route saves an estimated ${formatRupees(savings)} (${pct(savings, separateTotal)}) versus ${separateTrips.length} separate trips.`);
  }

  const transportTotal = recommendation === 'pooled' && pooled ? pooled.costPaise : separateTotal;
  const allocations: Allocation[] = picked.map((p, i) => {
    const gross = grossPaise(p.quantity, p.f.pricePerUnit);
    const handling = grossPaise(p.quantity, p.f.s.sellerHandlingPaisePerUnit);
    const pooledShare = pooled ? Math.round((pooled.costPaise * p.kg) / allocatedKg) : separateTrips[i].costPaise;
    const reasons = [
      `${p.f.s.grade === 'ungraded' ? 'Ungraded' : 'Grade ' + p.f.s.grade} meets minimum ${demand.minGrade}`,
      `Available ${p.f.s.availableQuantity} ${p.f.s.unit}; allocated ${p.quantity} ${p.f.s.unit}`,
      `Price basis: ${p.f.priceBasis.replace(/_/g, ' ')}`,
      `~${roundTo(p.f.directKm, 1)} km estimated (straight-line x ${transport.roadFactor})`,
    ];
    return {
      listingId: p.f.s.listingId, farmerId: p.f.s.farmerId, title: p.f.s.title, area: p.f.s.area,
      quantity: p.quantity, unit: p.f.s.unit, quantityKg: p.kg, pricePaisePerUnit: p.f.pricePerUnit, priceBasis: p.f.priceBasis,
      directDistanceKm: roundTo(p.f.directKm, 1), lat: p.f.s.lat!, lng: p.f.s.lng!, grossPaise: gross, sellerHandlingPaise: handling, farmerNetPaise: gross - handling,
      separateTransportPaise: separateTrips[i].costPaise, pooledTransportSharePaise: pooledShare, reasons,
    };
  });
  const produceCost = allocations.reduce((t, a) => t + a.grossPaise, 0);
  const unmatchedKg = roundTo(Math.max(0, demandKg - allocatedKg), 3);
  if (unmatchedKg > 0) warnings.push(`${unmatchedKg} kg of the requirement is still unmatched.`);
  warnings.push('Transport figures are estimates from straight-line distance, not a road route or carrier quote.');
  explanation.push(`Hard constraints checked first: commodity, variety, grade, availability window, freshness, price floor and transit time. ${exclusions.length} listing(s) excluded with reason codes.`);
  explanation.push('Each farmer must accept their own offer; nothing is reserved until then.');

  return {
    algorithmVersion: ALGORITHM_VERSION,
    status: 'completed',
    recommendation,
    demandQuantityKg: demandKg,
    buyer: { lat: demand.lat, lng: demand.lng, area: demand.area },
    allocatedKg,
    unmatchedKg,
    allocations,
    exclusions,
    separate: { totalPaise: separateTotal, perKgPaise: Math.round(separateTotal / allocatedKg), trips: separateTrips },
    pooled,
    produceCostPaise: produceCost,
    buyerLandedPerKgPaise: Math.round((produceCost + transportTotal) / allocatedKg),
    savingsPaise: savings,
    explanation,
    warnings,
    transportSource: transport.source,
  };
}

// ---------------------------------------------------------------------------------- NetBack
export interface CostLine {
  label: string;
  payer: 'farmer' | 'buyer';
  amountPaise: number;
  certainty: 'estimated' | 'confirmed';
  source: string;
}

export interface NetBack {
  grossPaise: number;
  sellerCostsPaise: number;
  farmerNetPaise: number;
  buyerCostsPaise: number;
  buyerLandedTotalPaise: number;
  buyerLandedPerUnitPaise: number;
  farmerNetPerUnitPaise: number;
}

/**
 * NetBack semantics: farmer net = accepted gross - ONLY seller-paid itemised costs.
 * Buyer-paid costs never reduce farmer proceeds; they increase buyer landed cost.
 */
export function computeNetBack(quantity: number, pricePaisePerUnit: number, lines: CostLine[]): NetBack {
  if (!(quantity > 0)) throw new Error('Quantity must be positive');
  const gross = grossPaise(quantity, pricePaisePerUnit);
  const seller = lines.filter((l) => l.payer === 'farmer').reduce((t, l) => t + l.amountPaise, 0);
  const buyer = lines.filter((l) => l.payer === 'buyer').reduce((t, l) => t + l.amountPaise, 0);
  return {
    grossPaise: gross,
    sellerCostsPaise: seller,
    farmerNetPaise: gross - seller,
    buyerCostsPaise: buyer,
    buyerLandedTotalPaise: gross + buyer,
    buyerLandedPerUnitPaise: Math.round((gross + buyer) / quantity),
    farmerNetPerUnitPaise: Math.round((gross - seller) / quantity),
  };
}

export function formatRupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const rupees = Math.abs(paise) / 100;
  return `${sign}Rs ${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: rupees % 1 ? 2 : 0 })}`;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${roundTo((part / whole) * 100, 1)}%` : '0%';
}
