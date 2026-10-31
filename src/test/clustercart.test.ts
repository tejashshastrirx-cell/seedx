import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_VERSION, DEFAULT_TRANSPORT, computeNetBack, convertPricePerUnit, convertQuantity, grossPaise, runClusterCart,
  type DemandInput, type SupplyCandidate,
} from '@shared/clustercart';

const today = '2026-10-31';
const bhopal = { lat: 23.26, lng: 77.41 };

function supply(over: Partial<SupplyCandidate>): SupplyCandidate {
  return {
    listingId: 'L?', farmerId: 'F?', title: 'Wheat', commodityId: 1, varietyId: 10, grade: 'A', unit: 'quintal',
    availableQuantity: 20, minPricePaisePerUnit: 250000, askingPricePaisePerUnit: 280000, sellerHandlingPaisePerUnit: 2000,
    availableFrom: '2026-10-31', availableUntil: '2026-11-30', harvestDate: '2026-10-21', shelfLifeDays: 365,
    lat: 23.2, lng: 77.08, area: 'Sehore, MP', ...over,
  };
}

const hostelDemand: DemandInput = {
  demandId: 'D1', commodityId: 1, varietyId: 10, minGrade: 'B', unit: 'quintal', remainingQuantity: 60,
  maxPricePaisePerUnit: 290000, deliveryFrom: '2026-11-02', deliveryUntil: '2026-11-14', ...bhopal, maxTransitHours: 48, area: 'Bhopal, MP',
};

const demoSupply = [
  supply({ listingId: 'L1', farmerId: 'F1', availableQuantity: 30, askingPricePaisePerUnit: 285000, lat: 23.2, lng: 77.08, area: 'Sehore' }),
  supply({ listingId: 'L2', farmerId: 'F2', availableQuantity: 22, minPricePaisePerUnit: 255000, lat: 23.52, lng: 77.81, area: 'Vidisha' }),
  supply({ listingId: 'L3', farmerId: 'F3', availableQuantity: 15, grade: 'B', minPricePaisePerUnit: 245000, askingPricePaisePerUnit: 270000, sellerHandlingPaisePerUnit: 0, lat: 23.33, lng: 77.79, area: 'Raisen' }),
];

describe('unit conversion', () => {
  it('converts quantities through explicit factors', () => {
    expect(convertQuantity(1, 'quintal', 'kg')).toBe(100);
    expect(convertQuantity(250, 'kg', 'quintal')).toBe(2.5);
    expect(convertQuantity(1.5, 'tonne', 'quintal')).toBe(15);
  });
  it('converts prices per unit without mixing Rs/kg and Rs/quintal', () => {
    expect(convertPricePerUnit(260000, 'quintal', 'kg')).toBe(2600); // Rs 2,600/q = Rs 26/kg
    expect(convertPricePerUnit(2200, 'kg', 'quintal')).toBe(220000);
  });
  it('rejects unknown units', () => {
    // @ts-expect-error deliberate bad unit
    expect(() => convertQuantity(1, 'bag', 'kg')).toThrow();
  });
});

describe('money', () => {
  it('computes gross in integer paise without float drift', () => {
    expect(grossPaise(0.1 + 0.2, 100)).toBe(30);
    expect(grossPaise(20, 260000)).toBe(5_200_000);
    expect(grossPaise(12.345, 285000)).toBe(3_518_325);
  });
});

describe('ClusterCart allocation', () => {
  const result = runClusterCart(hostelDemand, demoSupply, DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.05, minAllocationKg: 50 });

  it('records the algorithm version', () => {
    expect(result.algorithmVersion).toBe(ALGORITHM_VERSION);
  });
  it('fills the requirement without exceeding any listing', () => {
    expect(result.status).toBe('completed');
    expect(result.allocatedKg).toBe(6000);
    expect(result.unmatchedKg).toBe(0);
    for (const a of result.allocations) {
      const s = demoSupply.find((x) => x.listingId === a.listingId)!;
      expect(a.quantity).toBeLessThanOrEqual(s.availableQuantity);
      expect(a.pricePaisePerUnit).toBeGreaterThanOrEqual(s.minPricePaisePerUnit ?? 0);
      expect(a.pricePaisePerUnit).toBeLessThanOrEqual(hostelDemand.maxPricePaisePerUnit!);
    }
  });
  it('is deterministic for identical inputs', () => {
    const again = runClusterCart(hostelDemand, [...demoSupply].reverse(), DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.05, minAllocationKg: 50 });
    expect(again.allocations.map((a) => [a.listingId, a.quantity])).toEqual(result.allocations.map((a) => [a.listingId, a.quantity]));
  });
  it('rejects pooling for 60 q because Sehore lies opposite Vidisha/Raisen (pooled route costs more)', () => {
    expect(result.pooled).not.toBeNull();
    expect(result.savingsPaise).toBeLessThan(0);
    expect(result.recommendation).toBe('separate');
  });
  it('recommends pooling when the pickups are clustered in one direction (35 q demo)', () => {
    const r = runClusterCart({ ...hostelDemand, remainingQuantity: 35 }, demoSupply, DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.05, minAllocationKg: 50 });
    expect(r.allocations.map((a) => a.listingId).sort()).toEqual(['L2', 'L3']);
    expect(r.recommendation).toBe('pooled');
    expect(r.savingsPaise).toBeGreaterThan(r.separate.totalPaise * 0.05);
    const shares = r.allocations.reduce((t, a) => t + a.pooledTransportSharePaise, 0);
    expect(Math.abs(shares - r.pooled!.costPaise)).toBeLessThanOrEqual(r.allocations.length);
    expect(r.pooled!.stops.at(-1)).toBe('Bhopal, MP');
  });
  it('keeps farmer net separate from buyer transport (buyer-paid by default)', () => {
    for (const a of result.allocations) expect(a.farmerNetPaise).toBe(a.grossPaise - a.sellerHandlingPaise);
    expect(result.buyerLandedPerKgPaise).toBeGreaterThan(result.produceCostPaise / result.allocatedKg);
  });
  it('labels transport as an estimate', () => {
    expect(result.warnings.join(' ')).toMatch(/estimates/);
    expect(result.transportSource).toMatch(/not a carrier quote/);
  });
});

describe('hard constraints with reason codes', () => {
  const run = (s: SupplyCandidate[], d: Partial<DemandInput> = {}) =>
    runClusterCart({ ...hostelDemand, ...d }, s, DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.05, minAllocationKg: 50 });
  const code = (s: SupplyCandidate, d: Partial<DemandInput> = {}) => run([s], d).exclusions[0]?.code;

  it('excludes other commodities, varieties and lower grades', () => {
    expect(code(supply({ listingId: 'x', commodityId: 2 }))).toBe('COMMODITY_MISMATCH');
    expect(code(supply({ listingId: 'x', varietyId: 99 }))).toBe('VARIETY_MISMATCH');
    expect(code(supply({ listingId: 'x', grade: 'C' }))).toBe('GRADE_BELOW_MINIMUM');
  });
  it('excludes when the farmer floor is above the buyer maximum (after unit conversion)', () => {
    expect(code(supply({ listingId: 'x', unit: 'kg', availableQuantity: 2000, minPricePaisePerUnit: 3000, askingPricePaisePerUnit: 3200 }))).toBe('PRICE_FLOOR_ABOVE_BUYER_MAX');
    // Rs 28/kg = Rs 2,800/q which is below the Rs 2,900/q maximum -> feasible
    expect(run([supply({ listingId: 'x', unit: 'kg', availableQuantity: 2000, minPricePaisePerUnit: 2500, askingPricePaisePerUnit: 2800 })]).allocations).toHaveLength(1);
  });
  it('excludes non-overlapping windows and stale produce', () => {
    expect(code(supply({ listingId: 'x', availableFrom: '2026-12-01', availableUntil: '2026-12-20' }))).toBe('WINDOW_NO_OVERLAP');
    expect(code(supply({ listingId: 'x', shelfLifeDays: 5, harvestDate: '2026-10-20' }))).toBe('FRESHNESS_WINDOW');
  });
  it('excludes pickups beyond the buyer transit limit', () => {
    expect(code(supply({ listingId: 'x', lat: 28.6, lng: 77.2 }), { maxTransitHours: 6 })).toBe('TRANSIT_TOO_LONG');
  });
  it('excludes listings without location or price basis', () => {
    expect(code(supply({ listingId: 'x', lat: null }))).toBe('MISSING_LOCATION');
    expect(code(supply({ listingId: 'x', minPricePaisePerUnit: null, askingPricePaisePerUnit: null }), { maxPricePaisePerUnit: null })).toBe('NO_PRICE_BASIS');
  });
  it('returns no_feasible_supply with an explanation when nothing passes', () => {
    const r = run([supply({ listingId: 'x', grade: 'C' })]);
    expect(r.status).toBe('no_feasible_supply');
    expect(r.recommendation).toBe('none');
    expect(r.unmatchedKg).toBe(6000);
  });
});

describe('pooling is rejected when it is not beneficial', () => {
  it('recommends separate trips when pickups are in opposite directions', () => {
    const r = runClusterCart(
      { ...hostelDemand, remainingQuantity: 30, maxTransitHours: 72 },
      [
        supply({ listingId: 'N', availableQuantity: 15, lat: 24.6, lng: 77.41, area: 'North' }),
        supply({ listingId: 'S', availableQuantity: 15, lat: 21.9, lng: 77.41, area: 'South' }),
      ],
      DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.05, minAllocationKg: 50 });
    expect(r.recommendation).toBe('separate');
    expect(r.explanation[0]).toMatch(/separate trips recommended/);
  });
  it('recommends separate trips when the pooled route breaks the transit limit', () => {
    const r = runClusterCart(
      { ...hostelDemand, remainingQuantity: 30, maxTransitHours: 4 },
      [
        supply({ listingId: 'A', availableQuantity: 15, lat: 23.2, lng: 77.0 }),
        supply({ listingId: 'B', availableQuantity: 15, lat: 23.6, lng: 77.9 }),
      ],
      DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.0, minAllocationKg: 50 });
    if (r.pooled && !r.pooled.withinTransitLimit) expect(r.recommendation).toBe('separate');
    else expect(r.pooled?.durationHours ?? 0).toBeLessThanOrEqual(4);
  });
});

describe('NetBack', () => {
  it('never subtracts buyer-paid costs from farmer proceeds', () => {
    const nb = computeNetBack(20, 260000, [
      { label: 'Handling', payer: 'farmer', amountPaise: 20000, certainty: 'confirmed', source: 'listing' },
      { label: 'Transport', payer: 'buyer', amountPaise: 150000, certainty: 'estimated', source: 'estimate' },
    ]);
    expect(nb.grossPaise).toBe(5_200_000);
    expect(nb.farmerNetPaise).toBe(5_180_000);
    expect(nb.buyerLandedTotalPaise).toBe(5_350_000);
    expect(nb.buyerLandedPerUnitPaise).toBe(267_500);
  });
  it('subtracts transport only when the agreement makes it seller-paid', () => {
    const nb = computeNetBack(10, 100000, [{ label: 'Transport', payer: 'farmer', amountPaise: 50000, certainty: 'estimated', source: 'x' }]);
    expect(nb.farmerNetPaise).toBe(950000);
    expect(nb.buyerCostsPaise).toBe(0);
  });
});
