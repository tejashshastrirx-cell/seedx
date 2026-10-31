-- SEED X 04 - reference data required in every environment (no personal data).
-- Commodities, varieties, data-source registry, MSP reference rows and scheme records.
-- Scheme records are inserted WITHOUT last_verified_at: the UI shows "source check pending"
-- until an admin reviews them against the official site.

insert into public.commodities (code, name_en, name_hi, category, default_unit, shelf_life_days, icon) values
  ('wheat', 'Wheat', 'गेहूँ', 'cereal', 'quintal', 365, 'wheat'),
  ('paddy', 'Paddy', 'धान', 'cereal', 'quintal', 365, 'wheat'),
  ('maize', 'Maize', 'मक्का', 'cereal', 'quintal', 240, 'wheat'),
  ('bajra', 'Bajra (Pearl millet)', 'बाजरा', 'cereal', 'quintal', 240, 'wheat'),
  ('barley', 'Barley', 'जौ', 'cereal', 'quintal', 300, 'wheat'),
  ('tur', 'Tur / Arhar', 'तुअर / अरहर', 'pulse', 'quintal', 365, 'bean'),
  ('gram', 'Gram (Chana)', 'चना', 'pulse', 'quintal', 365, 'bean'),
  ('lentil', 'Lentil (Masur)', 'मसूर', 'pulse', 'quintal', 365, 'bean'),
  ('moong', 'Moong', 'मूँग', 'pulse', 'quintal', 365, 'bean'),
  ('mustard', 'Rapeseed & Mustard', 'सरसों', 'oilseed', 'quintal', 300, 'sprout'),
  ('safflower', 'Safflower', 'कुसुम', 'oilseed', 'quintal', 300, 'sprout'),
  ('soybean', 'Soybean', 'सोयाबीन', 'oilseed', 'quintal', 300, 'sprout'),
  ('groundnut', 'Groundnut', 'मूँगफली', 'oilseed', 'quintal', 240, 'sprout'),
  ('cotton', 'Cotton', 'कपास', 'fibre', 'quintal', 365, 'flower'),
  ('onion', 'Onion', 'प्याज़', 'vegetable', 'quintal', 90, 'carrot'),
  ('potato', 'Potato', 'आलू', 'vegetable', 'quintal', 90, 'carrot'),
  ('tomato', 'Tomato', 'टमाटर', 'vegetable', 'kg', 10, 'cherry'),
  ('cauliflower', 'Cauliflower', 'फूलगोभी', 'vegetable', 'kg', 7, 'leafy'),
  ('okra', 'Okra (Bhindi)', 'भिंडी', 'vegetable', 'kg', 5, 'leafy'),
  ('banana', 'Banana', 'केला', 'fruit', 'kg', 10, 'banana'),
  ('mango', 'Mango', 'आम', 'fruit', 'kg', 12, 'apple')
on conflict (code) do nothing;

insert into public.crop_varieties (commodity_id, name_en, name_hi)
select c.id, v.name_en, v.name_hi from (values
  ('wheat', 'Sharbati', 'शरबती'), ('wheat', 'Lokwan', 'लोकवन'), ('wheat', 'HD-2967', 'एचडी-2967'),
  ('paddy', 'Basmati 1121', 'बासमती 1121'), ('paddy', 'Common (non-basmati)', 'सामान्य'),
  ('tur', 'Desi', 'देसी'), ('gram', 'Kabuli', 'काबुली'), ('gram', 'Desi', 'देसी'),
  ('onion', 'Red (Nashik)', 'लाल (नासिक)'), ('potato', 'Jyoti', 'ज्योति'),
  ('tomato', 'Hybrid', 'हाइब्रिड'), ('tomato', 'Local', 'देसी'), ('soybean', 'JS-9560', 'जेएस-9560'),
  ('mustard', 'Black', 'काली'), ('maize', 'Yellow', 'पीली')
) as v(code, name_en, name_hi) join public.commodities c on c.code = v.code
on conflict (commodity_id, name_en) do nothing;

insert into public.data_sources (code, name, publisher, official_url, dataset_id, licence, price_type, expected_cadence, status, notes) values
  ('ogd_agmarknet', 'Current daily price of various commodities from various markets (Mandi)', 'Government of India - Open Government Data Platform (AGMARKNET)',
   'https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi', '9ef84268-d588-465a-a308-a864a43d0070',
   'Government Open Data Licence - India', 'mandi_wholesale', 'daily (as reported by mandis)', 'pending_access',
   'Requires a project-owned data.gov.in API key stored as an Edge Function secret (OGD_API_KEY). Dated daily data, not a live quote.'),
  ('msp_ccea', 'Minimum Support Prices (CCEA decisions)', 'Government of India - Cabinet Committee on Economic Affairs / PIB',
   'https://pib.gov.in/', null, 'Public government information', 'msp_reference', 'per marketing season', 'active',
   'Policy reference price for the named crop, season and marketing year. Not a promise that a procurement centre will buy a particular crop.'),
  ('seedx_sample', 'SEED X illustrative sample prices', 'SEED X (synthetic demo data)', 'https://data.gov.in/', null,
   'Synthetic - not real market data', 'mandi_wholesale', 'n/a', 'active', 'Clearly labelled SAMPLE rows for demos until the OGD feed is connected.')
on conflict (code) do nothing;

-- MSP reference rows (Rs/quintal -> paise). Figures from press reports of the CCEA decisions of
-- 13 May 2026 (Kharif MS 2026-27) and 30 Sep 2026 (Rabi MS 2027-28); pending admin check against the PIB release.
with src as (select id from public.data_sources where code = 'msp_ccea')
insert into public.market_price_observations (source_id, source_record_key, price_type, commodity_id, variety, season, observed_on,
  modal_paise, unit, is_sample, verification_status)
select src.id, 'msp|' || v.code || '|' || v.variety || '|' || v.season, 'msp_reference', c.id, v.variety, v.season, v.decided_on::date,
       v.rupees * 100, 'quintal', false, 'verification_pending'
from src, (values
  ('paddy', 'Common', 'Kharif MS 2026-27', '2026-05-13', 2441),
  ('paddy', 'Grade A', 'Kharif MS 2026-27', '2026-05-13', 2461),
  ('tur', 'Other', 'Kharif MS 2026-27', '2026-05-13', 8450),
  ('wheat', 'Other', 'Rabi MS 2027-28', '2026-09-30', 2610),
  ('barley', 'Other', 'Rabi MS 2027-28', '2026-09-30', 2286),
  ('gram', 'Other', 'Rabi MS 2027-28', '2026-09-30', 5958),
  ('lentil', 'Other', 'Rabi MS 2027-28', '2026-09-30', 7390),
  ('mustard', 'Other', 'Rabi MS 2027-28', '2026-09-30', 6613),
  ('safflower', 'Other', 'Rabi MS 2027-28', '2026-09-30', 7215)
) as v(code, variety, season, decided_on, rupees)
join public.commodities c on c.code = v.code
on conflict (source_id, source_record_key) do nothing;

insert into public.government_schemes (slug, title_en, title_hi, scheme_type, level, farmer_categories, summary_en, summary_hi, eligibility_en,
  benefit_en, documents_en, application_steps_en, official_url, application_url, status) values
  ('pm-kisan', 'PM-KISAN (Pradhan Mantri Kisan Samman Nidhi)', 'पीएम-किसान सम्मान निधि', 'income_support', 'central', '{landholding}',
   'Central income-support scheme for landholding farmer families, paid by direct benefit transfer.',
   'भूमिधारक किसान परिवारों के लिए केंद्रीय आय सहायता योजना, सीधे बैंक खाते में भुगतान।',
   'Landholding farmer families, subject to the exclusion criteria published on the official portal. The competent authority decides eligibility.',
   'Income support paid in instalments by DBT. Check the current amount and schedule on the official portal.',
   '{Aadhaar,"Land records","Bank account linked to Aadhaar"}',
   '{"Open the official PM-KISAN portal","Choose New Farmer Registration","Complete e-KYC as instructed on the portal"}',
   'https://pmkisan.gov.in/', 'https://pmkisan.gov.in/', 'published'),
  ('pmfby', 'Pradhan Mantri Fasal Bima Yojana (PMFBY)', 'प्रधानमंत्री फसल बीमा योजना', 'insurance', 'central', '{landholding,tenant,sharecropper}',
   'Crop insurance against notified risks for notified crops and areas.', 'अधिसूचित फसलों और क्षेत्रों के लिए फसल बीमा।',
   'Farmers growing notified crops in notified areas, including tenant and sharecropping farmers as per state notification.',
   'Insurance cover for yield loss from notified perils. Premium share and cut-off dates are notified per season and state.',
   '{"Land record or sowing certificate","Bank account details",Aadhaar}',
   '{"Check notified crops and cut-off date for your state","Apply via bank, CSC or the official portal before the cut-off"}',
   'https://pmfby.gov.in/', 'https://pmfby.gov.in/', 'published'),
  ('kisan-credit-card', 'Kisan Credit Card (KCC)', 'किसान क्रेडिट कार्ड', 'credit', 'central', '{landholding,tenant,sharecropper}',
   'Short-term institutional credit for crop cultivation and allied activities through banks.', 'बैंकों के माध्यम से खेती के लिए अल्पकालिक ऋण।',
   'Farmers, tenant farmers, sharecroppers and eligible groups as per bank and RBI guidelines.',
   'Revolving credit limit for cultivation needs. Interest subvention may apply as per current government notification.',
   '{"Identity proof","Address proof","Land/cultivation documents"}',
   '{"Contact your bank branch or apply where your bank offers online KCC","Submit documents for appraisal"}',
   'https://www.myscheme.gov.in/schemes/kcc', null, 'published'),
  ('soil-health-card', 'Soil Health Card', 'मृदा स्वास्थ्य कार्ड', 'soil_health', 'central', '{landholding}',
   'Soil testing and nutrient recommendations for farm plots.', 'खेत की मिट्टी जाँच और पोषक तत्व सिफ़ारिशें।',
   'Farmers through the state agriculture department soil-sampling programme.',
   'A card with soil nutrient status and fertiliser recommendations for the tested plot.',
   '{"Farmer details","Plot details"}', '{"Contact the local agriculture office or visit the official portal"}',
   'https://soilhealth.dac.gov.in/', null, 'published'),
  ('e-nam', 'National Agriculture Market (e-NAM)', 'राष्ट्रीय कृषि बाज़ार (ई-नाम)', 'market_access', 'central', '{landholding,tenant}',
   'Online trading platform linking participating APMC mandis.', 'भाग लेने वाली मंडियों को जोड़ने वाला ऑनलाइन व्यापार मंच।',
   'Farmers registered at a participating e-NAM mandi.', 'Access to online bidding at participating mandis.',
   '{"Identity proof","Bank account details"}', '{"Register on the official e-NAM portal or at a participating mandi"}',
   'https://www.enam.gov.in/', 'https://www.enam.gov.in/', 'published'),
  ('pm-kusum', 'PM-KUSUM (solar pumps and grid-connected solar)', 'पीएम-कुसुम', 'irrigation_energy', 'central', '{landholding}',
   'Support for solar pumps and solar power generation by farmers, implemented through state agencies.', 'किसानों के लिए सौर पंप व सौर ऊर्जा सहायता।',
   'As notified by the state implementing agency.', 'Subsidy/support for solar pumps and plants as notified by the state agency.',
   '{"Land documents","Identity proof","Bank account details"}', '{"Apply through your state implementing agency as listed on the official site"}',
   'https://pmkusum.mnre.gov.in/', null, 'published')
on conflict (slug) do nothing;
