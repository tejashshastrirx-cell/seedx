// SEED X - run-clustercart Edge Function.
// Computes a ClusterCart allocation for one of the caller's demand requests and stores an
// immutable match run. Inputs are read with the CALLER's JWT (RLS applies); only the final
// insert uses the service role, through the service-role-only record_match_run() RPC.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ALGORITHM_VERSION, DEFAULT_TRANSPORT, runClusterCart, type DemandInput, type Grade, type SupplyCandidate, type Unit } from '../_shared/clustercart.ts';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173')
  .split(',').map((o) => o.trim()).filter(Boolean);
const RUNS_PER_MINUTE = 6;

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function reply(status: number, body: unknown, origin: string | null, correlationId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const cid = crypto.randomUUID();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: 'ORIGIN_NOT_ALLOWED', correlation_id: cid }, origin, cid);
  if (req.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED', correlation_id: cid }, origin, cid);
  if (!(req.headers.get('Content-Type') ?? '').includes('application/json')) return reply(415, { error: 'JSON_REQUIRED', correlation_id: cid }, origin, cid);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return reply(401, { error: 'AUTH_REQUIRED', correlation_id: cid }, origin, cid);

  let body: { demand_id?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 2_000) return reply(413, { error: 'PAYLOAD_TOO_LARGE', correlation_id: cid }, origin, cid);
    body = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'INVALID_JSON', correlation_id: cid }, origin, cid);
  }
  const demandId = typeof body.demand_id === 'string' && UUID.test(body.demand_id) ? body.demand_id : null;
  if (!demandId) return reply(422, { error: 'DEMAND_ID_REQUIRED', correlation_id: cid }, origin, cid);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return reply(401, { error: 'INVALID_TOKEN', correlation_id: cid }, origin, cid);
  const user = userData.user;
  if (!user.email_confirmed_at) return reply(403, { error: 'EMAIL_NOT_VERIFIED', correlation_id: cid }, origin, cid);

  const { data: roles } = await userClient.from('user_roles').select('role,status').eq('user_id', user.id);
  if (!roles?.some((r) => r.role === 'buyer' && r.status === 'active')) return reply(403, { error: 'ROLE_REQUIRED', role: 'buyer', correlation_id: cid }, origin, cid);

  // Rate limit per user.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from('match_runs').select('id', { count: 'exact', head: true }).eq('created_by', user.id).gte('created_at', since);
  if ((count ?? 0) >= RUNS_PER_MINUTE) return reply(429, { error: 'RATE_LIMITED', retry_after_seconds: 60, correlation_id: cid }, origin, cid);

  // Demand: read through RLS, then confirm ownership explicitly.
  const { data: d, error: dErr } = await userClient.from('demand_requests')
    .select('id,buyer_id,commodity_id,variety_id,min_grade,quantity,filled_quantity,unit,max_price_paise_per_unit,delivery_from,delivery_until,approx_lat,approx_lng,max_transit_hours,delivery_district,delivery_state,status')
    .eq('id', demandId).maybeSingle();
  if (dErr || !d || d.buyer_id !== user.id) return reply(404, { error: 'DEMAND_NOT_FOUND', correlation_id: cid }, origin, cid);
  if (!['open', 'partially_filled'].includes(d.status)) return reply(409, { error: 'DEMAND_CLOSED', correlation_id: cid }, origin, cid);

  // Supply: only listings the caller is allowed to see (public, open) for the commodity.
  const { data: listings, error: lErr } = await userClient.from('harvest_listings')
    .select('id,farmer_id,title,commodity_id,variety_id,grade,unit,available_quantity,min_price_paise_per_unit,asking_price_paise_per_unit,seller_handling_paise_per_unit,available_from,available_until,harvest_date,approx_lat,approx_lng,district,state,status')
    .eq('commodity_id', d.commodity_id).in('status', ['published', 'partially_reserved']).gt('available_quantity', 0).neq('farmer_id', user.id).limit(200);
  if (lErr) return reply(500, { error: 'SUPPLY_QUERY_FAILED', correlation_id: cid }, origin, cid);
  const { data: commodity } = await userClient.from('commodities').select('shelf_life_days').eq('id', d.commodity_id).single();

  const demand: DemandInput = {
    demandId: d.id, commodityId: d.commodity_id, varietyId: d.variety_id, minGrade: d.min_grade as Grade, unit: d.unit as Unit,
    remainingQuantity: Number(d.quantity) - Number(d.filled_quantity), maxPricePaisePerUnit: d.max_price_paise_per_unit,
    deliveryFrom: d.delivery_from, deliveryUntil: d.delivery_until, lat: d.approx_lat == null ? null : Number(d.approx_lat),
    lng: d.approx_lng == null ? null : Number(d.approx_lng), maxTransitHours: d.max_transit_hours, area: `${d.delivery_district}, ${d.delivery_state}`,
  };
  const supply: SupplyCandidate[] = (listings ?? []).map((l) => ({
    listingId: l.id, farmerId: l.farmer_id, title: l.title, commodityId: l.commodity_id, varietyId: l.variety_id, grade: l.grade as Grade,
    unit: l.unit as Unit, availableQuantity: Number(l.available_quantity), minPricePaisePerUnit: l.min_price_paise_per_unit,
    askingPricePaisePerUnit: l.asking_price_paise_per_unit, sellerHandlingPaisePerUnit: Number(l.seller_handling_paise_per_unit),
    availableFrom: l.available_from, availableUntil: l.available_until, harvestDate: l.harvest_date, shelfLifeDays: commodity?.shelf_life_days ?? 30,
    lat: l.approx_lat == null ? null : Number(l.approx_lat), lng: l.approx_lng == null ? null : Number(l.approx_lng), area: `${l.district}, ${l.state}`,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const result = runClusterCart(demand, supply, DEFAULT_TRANSPORT, { today, minPoolingSaving: 0.05, minAllocationKg: 50 });
  const allocations = result.allocations.map((a) => ({
    listing_id: a.listingId, quantity: a.quantity, price_paise_per_unit: a.pricePaisePerUnit,
    transport_share_paise: result.recommendation === 'pooled' ? a.pooledTransportSharePaise : a.separateTransportPaise,
  }));

  const { data: runId, error: rErr } = await admin.rpc('record_match_run', {
    p_created_by: user.id, p_demand_id: d.id, p_algorithm_version: ALGORITHM_VERSION, p_status: result.status,
    p_recommendation: result.recommendation,
    p_input: { demand, supply_count: supply.length, supply_ids: supply.map((s) => s.listingId), transport: DEFAULT_TRANSPORT, today },
    p_result: result, p_allocations: allocations,
  });
  if (rErr) {
    console.error(JSON.stringify({ cid, msg: 'record_match_run failed', code: rErr.code }));
    return reply(500, { error: 'PERSIST_FAILED', correlation_id: cid }, origin, cid);
  }
  console.log(JSON.stringify({ cid, msg: 'match run stored', run: runId, allocations: allocations.length, recommendation: result.recommendation }));
  return reply(200, { match_run_id: runId, result, correlation_id: cid }, origin, cid);
});
