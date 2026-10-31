-- SEED X forward migration: crop catalogue v2 (categories + 10-language names, admin managed),
-- ten-language profile preference, trade relationships (My Clients / My Suppliers),
-- notification preferences / archive / dedupe / delivery records, saved searches,
-- and listing expiry. Additive only: no existing rows are deleted or renamed.

-- ---------------------------------------------------------------------------
-- 0. Supported languages
-- ---------------------------------------------------------------------------
create or replace function app_private.supported_languages() returns text[]
language sql immutable set search_path = '' as $$
  select array['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'pa']::text[]
$$;
grant execute on function app_private.supported_languages() to anon, authenticated, service_role;

-- Validates a {"en": "...", "hi": "..."} translation map: object, English required,
-- only supported language keys, non-empty strings of at most 80 characters.
create or replace function app_private.valid_name_map(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and coalesce(length(trim(p ->> 'en')), 0) between 1 and 80
     and not exists (
       select 1 from jsonb_each(p) e
        where not (e.key = any (app_private.supported_languages()))
           or jsonb_typeof(e.value) <> 'string'
           or length(trim(e.value #>> '{}')) not between 1 and 80)
$$;
grant execute on function app_private.valid_name_map(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Profile language: widen to ten languages
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_preferred_language_check;
alter table public.profiles add constraint profiles_preferred_language_check
  check (preferred_language = any (array['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'pa']));

create or replace function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'SEED X user'), 80);
  v_req text := new.raw_user_meta_data ->> 'preferred_language';
  v_lang text := case when v_req = any (app_private.supported_languages()) then v_req else 'en' end;
begin
  insert into public.profiles (id, display_name, preferred_language) values (new.id, v_name, v_lang)
  on conflict (id) do nothing;
  insert into public.profile_private (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function app_private.handle_new_user() from public;

-- ---------------------------------------------------------------------------
-- 2. Crop catalogue v2
-- ---------------------------------------------------------------------------
create table public.crop_categories (
  code text primary key check (code ~ '^[a-z_]{2,40}$'),
  names jsonb not null check (app_private.valid_name_map(names)),
  sort_order smallint not null default 100,
  is_active boolean not null default true
);

insert into public.crop_categories (code, sort_order, names) values
  ('vegetable', 10, '{"en":"Vegetables","hi":"सब्ज़ियाँ","bn":"সবজি","te":"కూరగాయలు","mr":"भाज्या","ta":"காய்கறிகள்","gu":"શાકભાજી","kn":"ತರಕಾರಿಗಳು","ml":"പച്ചക്കറികൾ","pa":"ਸਬਜ਼ੀਆਂ"}'),
  ('fruit', 20, '{"en":"Fruits","hi":"फल","bn":"ফল","te":"పండ్లు","mr":"फळे","ta":"பழங்கள்","gu":"ફળો","kn":"ಹಣ್ಣುಗಳು","ml":"പഴങ്ങൾ","pa":"ਫਲ"}'),
  ('cereal', 30, '{"en":"Grains","hi":"अनाज","bn":"শস্য","te":"ధాన్యాలు","mr":"धान्य","ta":"தானியங்கள்","gu":"અનાજ","kn":"ಧಾನ್ಯಗಳು","ml":"ധാന്യങ്ങൾ","pa":"ਅਨਾਜ"}'),
  ('pulse', 40, '{"en":"Pulses","hi":"दलहन","bn":"ডাল","te":"పప్పుధాన్యాలు","mr":"कडधान्ये","ta":"பருப்பு வகைகள்","gu":"કઠોળ","kn":"ಬೇಳೆಕಾಳುಗಳು","ml":"പയർവർഗങ്ങൾ","pa":"ਦਾਲਾਂ"}'),
  ('oilseed', 50, '{"en":"Oilseeds","hi":"तिलहन","bn":"তৈলবীজ","te":"నూనెగింజలు","mr":"तेलबिया","ta":"எண்ணெய் வித்துக்கள்","gu":"તેલીબિયાં","kn":"ಎಣ್ಣೆಕಾಳುಗಳು","ml":"എണ്ണക്കുരുക്കൾ","pa":"ਤੇਲ ਬੀਜ"}'),
  ('fibre', 60, '{"en":"Fibre crops","hi":"रेशा फसलें","bn":"আঁশ ফসল","te":"నార పంటలు","mr":"तंतू पिके","ta":"நார் பயிர்கள்","gu":"રેસાવાળા પાક","kn":"ನಾರು ಬೆಳೆಗಳು","ml":"നാരുവിളകൾ","pa":"ਰੇਸ਼ੇ ਵਾਲੀਆਂ ਫ਼ਸਲਾਂ"}'),
  ('spice', 70, '{"en":"Spices","hi":"मसाले","bn":"মশলা","te":"సుగంధ ద్రవ్యాలు","mr":"मसाले","ta":"மசாலாப் பொருட்கள்","gu":"મસાલા","kn":"ಮಸಾಲೆಗಳು","ml":"സുഗന്ധവ്യഞ്ജനങ്ങൾ","pa":"ਮਸਾਲੇ"}'),
  ('other', 90, '{"en":"Other","hi":"अन्य","bn":"অন্যান্য","te":"ఇతర","mr":"इतर","ta":"பிற","gu":"અન્ય","kn":"ಇತರ","ml":"മറ്റുള്ളവ","pa":"ਹੋਰ"}')
on conflict (code) do nothing;

alter table public.commodities
  add column if not exists names jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_other boolean not null default false,
  add column if not exists sort_order smallint not null default 100,
  add column if not exists updated_at timestamptz not null default now();

alter table public.commodities drop constraint if exists commodities_category_check;
alter table public.commodities add constraint commodities_category_fkey
  foreign key (category) references public.crop_categories (code);

-- New crops (existing codes are kept; on conflict do nothing).
insert into public.commodities (code, name_en, name_hi, category, default_unit, shelf_life_days, icon, is_other) values
  ('cabbage', 'Cabbage', 'पत्तागोभी', 'vegetable', 'kg', 14, 'leafy', false),
  ('brinjal', 'Brinjal', 'बैंगन', 'vegetable', 'kg', 7, 'leafy', false),
  ('green_chilli', 'Green chilli', 'हरी मिर्च', 'vegetable', 'kg', 7, 'leafy', false),
  ('capsicum', 'Capsicum', 'शिमला मिर्च', 'vegetable', 'kg', 10, 'leafy', false),
  ('cucumber', 'Cucumber', 'खीरा', 'vegetable', 'kg', 7, 'leafy', false),
  ('carrot', 'Carrot', 'गाजर', 'vegetable', 'kg', 21, 'carrot', false),
  ('radish', 'Radish', 'मूली', 'vegetable', 'kg', 10, 'carrot', false),
  ('spinach', 'Spinach', 'पालक', 'vegetable', 'kg', 3, 'leafy', false),
  ('peas', 'Green peas', 'मटर', 'vegetable', 'kg', 7, 'leafy', false),
  ('vegetable_other', 'Other vegetable', 'अन्य सब्ज़ी', 'vegetable', 'kg', 7, 'leafy', true),
  ('apple', 'Apple', 'सेब', 'fruit', 'kg', 60, 'apple', false),
  ('guava', 'Guava', 'अमरूद', 'fruit', 'kg', 7, 'apple', false),
  ('papaya', 'Papaya', 'पपीता', 'fruit', 'kg', 7, 'apple', false),
  ('pomegranate', 'Pomegranate', 'अनार', 'fruit', 'kg', 45, 'apple', false),
  ('grapes', 'Grapes', 'अंगूर', 'fruit', 'kg', 14, 'cherry', false),
  ('watermelon', 'Watermelon', 'तरबूज़', 'fruit', 'kg', 14, 'apple', false),
  ('fruit_other', 'Other fruit', 'अन्य फल', 'fruit', 'kg', 7, 'apple', true),
  ('rice', 'Rice', 'चावल', 'cereal', 'quintal', 365, 'wheat', false),
  ('millets', 'Millets', 'मोटा अनाज (मिलेट्स)', 'cereal', 'quintal', 300, 'wheat', false),
  ('grain_other', 'Other grain', 'अन्य अनाज', 'cereal', 'quintal', 240, 'wheat', true),
  ('urad', 'Black gram (Urad)', 'उड़द', 'pulse', 'quintal', 365, 'bean', false),
  ('pulse_other', 'Other pulse', 'अन्य दलहन', 'pulse', 'quintal', 300, 'bean', true),
  ('sesame', 'Sesame', 'तिल', 'oilseed', 'quintal', 300, 'sprout', false),
  ('sunflower', 'Sunflower', 'सूरजमुखी', 'oilseed', 'quintal', 240, 'sprout', false),
  ('oilseed_other', 'Other oilseed', 'अन्य तिलहन', 'oilseed', 'quintal', 240, 'sprout', true)
on conflict (code) do nothing;

-- Ten-language display names (machine-assisted; flagged for native review in docs/LANGUAGES.md).
update public.commodities c set names = v.names::jsonb, sort_order = v.sort_order
from (values
  ('tomato', 10, '{"en":"Tomato","hi":"टमाटर","bn":"টমেটো","te":"టమాటా","mr":"टोमॅटो","ta":"தக்காளி","gu":"ટામેટા","kn":"ಟೊಮೇಟೊ","ml":"തക്കാളി","pa":"ਟਮਾਟਰ"}'),
  ('potato', 11, '{"en":"Potato","hi":"आलू","bn":"আলু","te":"బంగాళాదుంప","mr":"बटाटा","ta":"உருளைக்கிழங்கு","gu":"બટાકા","kn":"ಆಲೂಗಡ್ಡೆ","ml":"ഉരുളക്കിഴങ്ങ്","pa":"ਆਲੂ"}'),
  ('onion', 12, '{"en":"Onion","hi":"प्याज़","bn":"পেঁয়াজ","te":"ఉల్లిపాయ","mr":"कांदा","ta":"வெங்காயம்","gu":"ડુંગળી","kn":"ಈರುಳ್ಳಿ","ml":"ഉള്ളി","pa":"ਪਿਆਜ਼"}'),
  ('cauliflower', 13, '{"en":"Cauliflower","hi":"फूलगोभी","bn":"ফুলকপি","te":"కాలీఫ్లవర్","mr":"फुलकोबी","ta":"காலிஃபிளவர்","gu":"ફૂલકોબી","kn":"ಹೂಕೋಸು","ml":"കോളിഫ്ലവർ","pa":"ਫੁੱਲਗੋਭੀ"}'),
  ('cabbage', 14, '{"en":"Cabbage","hi":"पत्तागोभी","bn":"বাঁধাকপি","te":"క్యాబేజీ","mr":"कोबी","ta":"முட்டைக்கோஸ்","gu":"કોબીજ","kn":"ಎಲೆಕೋಸು","ml":"കാബേജ്","pa":"ਬੰਦ ਗੋਭੀ"}'),
  ('brinjal', 15, '{"en":"Brinjal","hi":"बैंगन","bn":"বেগুন","te":"వంకాయ","mr":"वांगी","ta":"கத்தரிக்காய்","gu":"રીંગણ","kn":"ಬದನೆಕಾಯಿ","ml":"വഴുതന","pa":"ਬੈਂਗਣ"}'),
  ('okra', 16, '{"en":"Okra (Bhindi)","hi":"भिंडी","bn":"ঢেঁড়স","te":"బెండకాయ","mr":"भेंडी","ta":"வெண்டைக்காய்","gu":"ભીંડા","kn":"ಬೆಂಡೆಕಾಯಿ","ml":"വെണ്ടയ്ക്ക","pa":"ਭਿੰਡੀ"}'),
  ('green_chilli', 17, '{"en":"Green chilli","hi":"हरी मिर्च","bn":"কাঁচা লঙ্কা","te":"పచ్చి మిరపకాయ","mr":"हिरवी मिरची","ta":"பச்சை மிளகாய்","gu":"લીલું મરચું","kn":"ಹಸಿರು ಮೆಣಸಿನಕಾಯಿ","ml":"പച്ചമുളക്","pa":"ਹਰੀ ਮਿਰਚ"}'),
  ('capsicum', 18, '{"en":"Capsicum","hi":"शिमला मिर्च","bn":"ক্যাপসিকাম","te":"క్యాప్సికం","mr":"ढोबळी मिरची","ta":"குடைமிளகாய்","gu":"સિમલા મરચું","kn":"ದೊಣ್ಣೆ ಮೆಣಸಿನಕಾಯಿ","ml":"കാപ്സിക്കം","pa":"ਸ਼ਿਮਲਾ ਮਿਰਚ"}'),
  ('cucumber', 19, '{"en":"Cucumber","hi":"खीरा","bn":"শসা","te":"దోసకాయ","mr":"काकडी","ta":"வெள்ளரிக்காய்","gu":"કાકડી","kn":"ಸೌತೆಕಾಯಿ","ml":"വെള്ളരിക്ക","pa":"ਖੀਰਾ"}'),
  ('carrot', 20, '{"en":"Carrot","hi":"गाजर","bn":"গাজর","te":"క్యారెట్","mr":"गाजर","ta":"கேரட்","gu":"ગાજર","kn":"ಕ್ಯಾರೆಟ್","ml":"കാരറ്റ്","pa":"ਗਾਜਰ"}'),
  ('radish', 21, '{"en":"Radish","hi":"मूली","bn":"মুলো","te":"ముల్లంగి","mr":"मुळा","ta":"முள்ளங்கி","gu":"મૂળો","kn":"ಮೂಲಂಗಿ","ml":"മുള്ളങ്കി","pa":"ਮੂਲੀ"}'),
  ('spinach', 22, '{"en":"Spinach","hi":"पालक","bn":"পালং শাক","te":"పాలకూర","mr":"पालक","ta":"பசலைக்கீரை","gu":"પાલક","kn":"ಪಾಲಕ್","ml":"ചീര","pa":"ਪਾਲਕ"}'),
  ('peas', 23, '{"en":"Green peas","hi":"मटर","bn":"মটরশুঁটি","te":"బఠానీ","mr":"वाटाणा","ta":"பட்டாணி","gu":"વટાણા","kn":"ಬಟಾಣಿ","ml":"പട്ടാണി","pa":"ਮਟਰ"}'),
  ('vegetable_other', 29, '{"en":"Other vegetable","hi":"अन्य सब्ज़ी","bn":"অন্যান্য সবজি","te":"ఇతర కూరగాయలు","mr":"इतर भाजी","ta":"பிற காய்கறி","gu":"અન્ય શાકભાજી","kn":"ಇತರ ತರಕಾರಿ","ml":"മറ്റ് പച്ചക്കറി","pa":"ਹੋਰ ਸਬਜ਼ੀ"}'),
  ('mango', 30, '{"en":"Mango","hi":"आम","bn":"আম","te":"మామిడి","mr":"आंबा","ta":"மாம்பழம்","gu":"કેરી","kn":"ಮಾವು","ml":"മാമ്പഴം","pa":"ਅੰਬ"}'),
  ('banana', 31, '{"en":"Banana","hi":"केला","bn":"কলা","te":"అరటి","mr":"केळी","ta":"வாழைப்பழம்","gu":"કેળા","kn":"ಬಾಳೆಹಣ್ಣು","ml":"വാഴപ്പഴം","pa":"ਕੇਲਾ"}'),
  ('apple', 32, '{"en":"Apple","hi":"सेब","bn":"আপেল","te":"ఆపిల్","mr":"सफरचंद","ta":"ஆப்பிள்","gu":"સફરજન","kn":"ಸೇಬು","ml":"ആപ്പിൾ","pa":"ਸੇਬ"}'),
  ('guava', 33, '{"en":"Guava","hi":"अमरूद","bn":"পেয়ারা","te":"జామ","mr":"पेरू","ta":"கொய்யா","gu":"જામફળ","kn":"ಸೀಬೆ","ml":"പേരയ്ക്ക","pa":"ਅਮਰੂਦ"}'),
  ('papaya', 34, '{"en":"Papaya","hi":"पपीता","bn":"পেঁপে","te":"బొప్పాయి","mr":"पपई","ta":"பப்பாளி","gu":"પપૈયું","kn":"ಪಪ್ಪಾಯಿ","ml":"പപ്പായ","pa":"ਪਪੀਤਾ"}'),
  ('pomegranate', 35, '{"en":"Pomegranate","hi":"अनार","bn":"ডালিম","te":"దానిమ్మ","mr":"डाळिंब","ta":"மாதுளை","gu":"દાડમ","kn":"ದಾಳಿಂಬೆ","ml":"മാതളനാരങ്ങ","pa":"ਅਨਾਰ"}'),
  ('grapes', 36, '{"en":"Grapes","hi":"अंगूर","bn":"আঙুর","te":"ద్రాక్ష","mr":"द्राक्षे","ta":"திராட்சை","gu":"દ્રાક્ષ","kn":"ದ್ರಾಕ್ಷಿ","ml":"മുന്തിരി","pa":"ਅੰਗੂਰ"}'),
  ('watermelon', 37, '{"en":"Watermelon","hi":"तरबूज़","bn":"তরমুজ","te":"పుచ్చకాయ","mr":"कलिंगड","ta":"தர்பூசணி","gu":"તરબૂચ","kn":"ಕಲ್ಲಂಗಡಿ","ml":"തണ്ണിമത്തൻ","pa":"ਤਰਬੂਜ਼"}'),
  ('fruit_other', 39, '{"en":"Other fruit","hi":"अन्य फल","bn":"অন্যান্য ফল","te":"ఇతర పండ్లు","mr":"इतर फळ","ta":"பிற பழம்","gu":"અન્ય ફળ","kn":"ಇತರ ಹಣ್ಣು","ml":"മറ്റ് പഴം","pa":"ਹੋਰ ਫਲ"}'),
  ('wheat', 40, '{"en":"Wheat","hi":"गेहूँ","bn":"গম","te":"గోధుమ","mr":"गहू","ta":"கோதுமை","gu":"ઘઉં","kn":"ಗೋಧಿ","ml":"ഗോതമ്പ്","pa":"ਕਣਕ"}'),
  ('paddy', 41, '{"en":"Paddy","hi":"धान","bn":"ধান","te":"వరి ధాన్యం","mr":"भात (धान)","ta":"நெல்","gu":"ડાંગર","kn":"ಭತ್ತ","ml":"നെല്ല്","pa":"ਝੋਨਾ"}'),
  ('rice', 42, '{"en":"Rice","hi":"चावल","bn":"চাল","te":"బియ్యం","mr":"तांदूळ","ta":"அரிசி","gu":"ચોખા","kn":"ಅಕ್ಕಿ","ml":"അരി","pa":"ਚੌਲ"}'),
  ('maize', 43, '{"en":"Maize","hi":"मक्का","bn":"ভুট্টা","te":"మొక్కజొన్న","mr":"मका","ta":"மக்காச்சோளம்","gu":"મકાઈ","kn":"ಮೆಕ್ಕೆಜೋಳ","ml":"ചോളം","pa":"ਮੱਕੀ"}'),
  ('barley', 44, '{"en":"Barley","hi":"जौ","bn":"যব","te":"బార్లీ","mr":"जव","ta":"பார்லி","gu":"જવ","kn":"ಬಾರ್ಲಿ","ml":"ബാർലി","pa":"ਜੌਂ"}'),
  ('millets', 45, '{"en":"Millets","hi":"मोटा अनाज (मिलेट्स)","bn":"মিলেট","te":"చిరుధాన్యాలు","mr":"तृणधान्ये","ta":"சிறுதானியங்கள்","gu":"બરછટ ધાન્ય","kn":"ಸಿರಿಧಾನ್ಯಗಳು","ml":"ചെറുധാന്യങ്ങൾ","pa":"ਮੋਟੇ ਅਨਾਜ"}'),
  ('bajra', 46, '{"en":"Bajra (Pearl millet)","hi":"बाजरा","bn":"বাজরা","te":"సజ్జలు","mr":"बाजरी","ta":"கம்பு","gu":"બાજરી","kn":"ಸಜ್ಜೆ","ml":"കമ്പ്","pa":"ਬਾਜਰਾ"}'),
  ('grain_other', 49, '{"en":"Other grain","hi":"अन्य अनाज","bn":"অন্যান্য শস্য","te":"ఇతర ధాన్యాలు","mr":"इतर धान्य","ta":"பிற தானியம்","gu":"અન્ય અનાજ","kn":"ಇತರ ಧಾನ್ಯ","ml":"മറ്റ് ധാന്യം","pa":"ਹੋਰ ਅਨਾਜ"}'),
  ('gram', 50, '{"en":"Chickpea (Gram / Chana)","hi":"चना","bn":"ছোলা","te":"శనగలు","mr":"हरभरा","ta":"கொண்டைக்கடலை","gu":"ચણા","kn":"ಕಡಲೆ","ml":"കടല","pa":"ਛੋਲੇ"}'),
  ('lentil', 51, '{"en":"Lentils (Masur)","hi":"मसूर","bn":"মসুর ডাল","te":"మసూర్ పప్పు","mr":"मसूर","ta":"மசூர் பருப்பு","gu":"મસૂર","kn":"ಮಸೂರ್ ಬೇಳೆ","ml":"മസൂർ പരിപ്പ്","pa":"ਮਸਰ"}'),
  ('tur', 52, '{"en":"Pigeon pea (Tur / Arhar)","hi":"तुअर / अरहर","bn":"অড়হর ডাল","te":"కందులు","mr":"तूर","ta":"துவரை","gu":"તુવેર","kn":"ತೊಗರಿ","ml":"തുവര","pa":"ਅਰਹਰ"}'),
  ('moong', 53, '{"en":"Green gram (Moong)","hi":"मूँग","bn":"মুগ ডাল","te":"పెసలు","mr":"मूग","ta":"பாசிப்பயறு","gu":"મગ","kn":"ಹೆಸರು","ml":"ചെറുപയർ","pa":"ਮੂੰਗੀ"}'),
  ('urad', 54, '{"en":"Black gram (Urad)","hi":"उड़द","bn":"মাষকলাই","te":"మినుములు","mr":"उडीद","ta":"உளுந்து","gu":"અડદ","kn":"ಉದ್ದು","ml":"ഉഴുന്ന്","pa":"ਮਾਂਹ"}'),
  ('pulse_other', 59, '{"en":"Other pulse","hi":"अन्य दलहन","bn":"অন্যান্য ডাল","te":"ఇతర పప్పుధాన్యాలు","mr":"इतर कडधान्य","ta":"பிற பருப்பு","gu":"અન્ય કઠોળ","kn":"ಇತರ ಬೇಳೆಕಾಳು","ml":"മറ്റ് പയർവർഗം","pa":"ਹੋਰ ਦਾਲ"}'),
  ('mustard', 60, '{"en":"Mustard (Rapeseed & Mustard)","hi":"सरसों","bn":"সরিষা","te":"ఆవాలు","mr":"मोहरी","ta":"கடுகு","gu":"રાઈ","kn":"ಸಾಸಿವೆ","ml":"കടുക്","pa":"ਸਰ੍ਹੋਂ"}'),
  ('groundnut', 61, '{"en":"Groundnut","hi":"मूँगफली","bn":"চিনাবাদাম","te":"వేరుశనగ","mr":"भुईमूग","ta":"நிலக்கடலை","gu":"મગફળી","kn":"ಕಡಲೆಕಾಯಿ","ml":"നിലക്കടല","pa":"ਮੂੰਗਫਲੀ"}'),
  ('soybean', 62, '{"en":"Soybean","hi":"सोयाबीन","bn":"সয়াবিন","te":"సోయాబీన్","mr":"सोयाबीन","ta":"சோயாபீன்","gu":"સોયાબીન","kn":"ಸೋಯಾಬೀನ್","ml":"സോയാബീൻ","pa":"ਸੋਇਆਬੀਨ"}'),
  ('sesame', 63, '{"en":"Sesame","hi":"तिल","bn":"তিল","te":"నువ్వులు","mr":"तीळ","ta":"எள்","gu":"તલ","kn":"ಎಳ್ಳು","ml":"എള്ള്","pa":"ਤਿਲ"}'),
  ('sunflower', 64, '{"en":"Sunflower","hi":"सूरजमुखी","bn":"সূর্যমুখী","te":"పొద్దుతిరుగుడు","mr":"सूर्यफूल","ta":"சூரியகாந்தி","gu":"સૂર્યમુખી","kn":"ಸೂರ್ಯಕಾಂತಿ","ml":"സൂര്യകാന്തി","pa":"ਸੂਰਜਮੁਖੀ"}'),
  ('safflower', 65, '{"en":"Safflower","hi":"कुसुम","bn":"কুসুম","te":"కుసుమ","mr":"करडई","ta":"குசும்பா","gu":"કસુંબી","kn":"ಕುಸುಬೆ","ml":"കുസുംഭം","pa":"ਕਸੁੰਭਾ"}'),
  ('oilseed_other', 69, '{"en":"Other oilseed","hi":"अन्य तिलहन","bn":"অন্যান্য তৈলবীজ","te":"ఇతర నూనెగింజలు","mr":"इतर तेलबिया","ta":"பிற எண்ணெய் வித்து","gu":"અન્ય તેલીબિયાં","kn":"ಇತರ ಎಣ್ಣೆಕಾಳು","ml":"മറ്റ് എണ്ണക്കുരു","pa":"ਹੋਰ ਤੇਲ ਬੀਜ"}'),
  ('cotton', 70, '{"en":"Cotton","hi":"कपास","bn":"তুলা","te":"పత్తి","mr":"कापूस","ta":"பருத்தி","gu":"કપાસ","kn":"ಹತ್ತಿ","ml":"പരുത്തി","pa":"ਕਪਾਹ"}')
) as v(code, sort_order, names)
where c.code = v.code;

-- Any commodity without a translation map falls back to its English/Hindi columns.
update public.commodities set names = jsonb_build_object('en', name_en, 'hi', coalesce(name_hi, name_en)) where names is null;
alter table public.commodities alter column names set not null;
alter table public.commodities add constraint commodities_names_valid check (app_private.valid_name_map(names));

alter table public.crop_categories enable row level security;
revoke all on public.crop_categories from anon, authenticated;
grant select on public.crop_categories to anon, authenticated;
create policy crop_categories_read on public.crop_categories for select to anon, authenticated using (true);

-- New listings and demand requests may only use an active commodity.
create or replace function app_private.require_active_commodity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.commodity_id is distinct from old.commodity_id then
    if not exists (select 1 from public.commodities c where c.id = new.commodity_id and c.is_active) then
      raise exception 'commodity is not active in the catalogue' using errcode = '22023', hint = 'COMMODITY_INACTIVE';
    end if;
  end if;
  return new;
end $$;
revoke all on function app_private.require_active_commodity() from public;
create trigger harvest_listings_active_commodity before insert or update of commodity_id on public.harvest_listings
  for each row execute function app_private.require_active_commodity();
create trigger demand_requests_active_commodity before insert or update of commodity_id on public.demand_requests
  for each row execute function app_private.require_active_commodity();

-- Admin catalogue management (MFA admin only, audited). Codes are immutable once created.
create or replace function public.admin_upsert_commodity(
  p_code text, p_category text, p_names jsonb, p_default_unit text,
  p_shelf_life_days integer, p_is_active boolean default true, p_sort_order smallint default 100)
returns smallint language plpgsql security definer set search_path = '' as $$
declare v_id smallint;
begin
  if not app_private.is_admin() then
    raise exception 'admin with MFA required' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[a-z_]{2,40}$' then
    raise exception 'invalid commodity code' using errcode = '22023';
  end if;
  if not exists (select 1 from public.crop_categories where code = p_category) then
    raise exception 'unknown category' using errcode = '22023';
  end if;
  if not app_private.valid_name_map(p_names) then
    raise exception 'names must include English and only supported languages (max 80 chars each)' using errcode = '22023';
  end if;
  if p_default_unit not in ('kg', 'quintal', 'tonne') or p_shelf_life_days not between 1 and 720 then
    raise exception 'invalid unit or shelf life' using errcode = '22023';
  end if;
  insert into public.commodities (code, name_en, name_hi, category, default_unit, shelf_life_days, names, is_active, sort_order, is_other)
  values (p_code, trim(p_names ->> 'en'), coalesce(nullif(trim(p_names ->> 'hi'), ''), trim(p_names ->> 'en')), p_category,
          p_default_unit, p_shelf_life_days, p_names, coalesce(p_is_active, true), coalesce(p_sort_order, 100), p_code like '%\_other')
  on conflict (code) do update set
    name_en = excluded.name_en, name_hi = excluded.name_hi, category = excluded.category,
    default_unit = excluded.default_unit, shelf_life_days = excluded.shelf_life_days, names = excluded.names,
    is_active = excluded.is_active, sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;
  perform app_private.audit('commodity.upsert', 'commodity', v_id::text,
    jsonb_build_object('code', p_code, 'category', p_category, 'is_active', p_is_active));
  return v_id;
end $$;
revoke all on function public.admin_upsert_commodity(text, text, jsonb, text, integer, boolean, smallint) from public, anon;
grant execute on function public.admin_upsert_commodity(text, text, jsonb, text, integer, boolean, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Listing expiry (trusted job; admin-callable). Listings with a reservation are left alone.
-- ---------------------------------------------------------------------------
-- Core job: no API execute grant. Schedule with pg_cron as the database owner, e.g.
--   select cron.schedule('seedx-expire-listings', '15 0 * * *', 'select app_private.expire_stale_listings_job()');
create or replace function app_private.expire_stale_listings_job() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform set_config('app.trusted_inventory_write', 'on', true);
  update public.harvest_listings set status = 'expired'
   where status in ('published', 'paused') and available_until < current_date and reserved_quantity = 0;
  get diagnostics v_count = row_count;
  perform set_config('app.trusted_inventory_write', 'off', true);
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'listing.expire_stale', 'harvest_listing', null, jsonb_build_object('count', v_count));
  return v_count;
end $$;
revoke all on function app_private.expire_stale_listings_job() from public, anon, authenticated, service_role;

-- API wrapper: MFA admin only.
create or replace function public.expire_stale_listings() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_admin() then
    raise exception 'admin with MFA required' using errcode = '42501';
  end if;
  return app_private.expire_stale_listings_job();
end $$;
revoke all on function public.expire_stale_listings() from public, anon;
grant execute on function public.expire_stale_listings() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trade relationships: My Clients (farmer) / My Suppliers (buyer)
-- ---------------------------------------------------------------------------
create table public.trade_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  counterparty_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('client', 'supplier')),
  manual_stage text not null default 'saved' check (manual_stage in ('lead', 'saved')),
  is_favourite boolean not null default false,
  private_note text check (char_length(private_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, counterparty_id, kind),
  check (owner_id <> counterparty_id)
);
create index trade_contacts_counterparty_idx on public.trade_contacts (counterparty_id);

create or replace function app_private.trade_contacts_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    if (select count(*) from public.trade_contacts where owner_id = new.owner_id) >= 500 then
      raise exception 'contact limit reached (500)' using errcode = '54000';
    end if;
  else
    new.owner_id := old.owner_id;
    new.counterparty_id := old.counterparty_id;
    new.kind := old.kind;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.trade_contacts_before_write() from public;
create trigger trade_contacts_before_write before insert or update on public.trade_contacts
  for each row when (current_user in ('authenticated', 'anon'))
  execute function app_private.trade_contacts_before_write();

alter table public.trade_contacts enable row level security;
revoke all on public.trade_contacts from anon, authenticated;
grant select, delete on public.trade_contacts to authenticated;
grant insert (counterparty_id, kind, manual_stage, is_favourite, private_note) on public.trade_contacts to authenticated;
grant update (manual_stage, is_favourite, private_note) on public.trade_contacts to authenticated;
create policy trade_contacts_select_own on public.trade_contacts for select to authenticated using (owner_id = (select auth.uid()));
create policy trade_contacts_insert_own on public.trade_contacts for insert to authenticated with check (owner_id = (select auth.uid()));
create policy trade_contacts_update_own on public.trade_contacts for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy trade_contacts_delete_own on public.trade_contacts for delete to authenticated using (owner_id = (select auth.uid()));

-- Derived relationship list. Stage precedence: repeat_client > existing_client > active > enquiry > manual stage.
-- Only the caller's own trading history is read; counterparties expose public profile fields only.
create or replace function public.list_trade_contacts(p_kind text)
returns table (
  counterparty_id uuid, display_name text, district text, state text,
  stage text, is_favourite boolean, private_note text, saved boolean,
  completed_orders integer, active_orders integer, offers_count integer,
  completed_gross_paise bigint, last_interaction_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_kind not in ('client', 'supplier') then
    raise exception 'kind must be client or supplier' using errcode = '22023';
  end if;
  return query
  with o as (
    select case when p_kind = 'client' then ord.buyer_id else ord.farmer_id end as cp, ord.status, ord.gross_paise, ord.updated_at
      from public.orders ord
     where (p_kind = 'client' and ord.farmer_id = v_me) or (p_kind = 'supplier' and ord.buyer_id = v_me)
  ), f as (
    select case when p_kind = 'client' then ofr.buyer_id else ofr.farmer_id end as cp, ofr.created_at
      from public.offers ofr
     where (p_kind = 'client' and ofr.farmer_id = v_me) or (p_kind = 'supplier' and ofr.buyer_id = v_me)
  ), people as (
    select cp from o union select cp from f
    union select tc.counterparty_id from public.trade_contacts tc where tc.owner_id = v_me and tc.kind = p_kind
  ), agg as (
    select p.cp,
      (select count(*) from o where o.cp = p.cp and o.status = 'completed')::integer as completed,
      (select count(*) from o where o.cp = p.cp and o.status in ('confirmed', 'pickup_scheduled', 'in_transit', 'delivered', 'disputed'))::integer as active,
      (select count(*) from f where f.cp = p.cp)::integer as offers,
      (select coalesce(sum(o.gross_paise), 0) from o where o.cp = p.cp and o.status = 'completed')::bigint as gross,
      greatest((select max(o.updated_at) from o where o.cp = p.cp), (select max(f.created_at) from f where f.cp = p.cp)) as last_at
    from people p
  )
  select a.cp, pr.display_name, pr.district, pr.state,
    case when a.completed >= 2 then 'repeat_client' when a.completed = 1 then 'existing_client'
         when a.active > 0 then 'active' when a.offers > 0 then 'enquiry'
         else coalesce(tc.manual_stage, 'lead') end,
    coalesce(tc.is_favourite, false), tc.private_note, tc.id is not null,
    a.completed, a.active, a.offers, a.gross, coalesce(a.last_at, tc.updated_at)
  from agg a
  join public.profiles pr on pr.id = a.cp
  left join public.trade_contacts tc on tc.owner_id = v_me and tc.counterparty_id = a.cp and tc.kind = p_kind
  order by coalesce(tc.is_favourite, false) desc, coalesce(a.last_at, tc.updated_at) desc nulls last;
end $$;
revoke all on function public.list_trade_contacts(text) from public, anon;
grant execute on function public.list_trade_contacts(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Notifications: categories, archive, delete, dedupe, preferences, delivery records
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists archived_at timestamptz,
  add column if not exists dedupe_key text check (char_length(dedupe_key) <= 120),
  add column if not exists category text generated always as (
    case
      when type like 'offer\_%' then 'offers'
      when type = 'order_update' then 'orders'
      when type = 'seed_order_update' then 'seeds'
      when type = 'match_proposal' then 'matches'
      when type = 'listing_moderated' then 'listings'
      when type = 'role_update' then 'account'
      else 'security' end) stored;
create unique index if not exists notifications_dedupe_idx on public.notifications (recipient_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_recipient_category_idx on public.notifications (recipient_id, category, created_at desc);

create table public.notification_preferences (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  in_app_offers boolean not null default true,
  in_app_seeds boolean not null default true,
  in_app_matches boolean not null default true,
  in_app_listings boolean not null default true,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.notification_preferences is
  'Optional categories only. orders, account and security notifications are always delivered in-app.';

create or replace function app_private.notification_preferences_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.user_id := auth.uid(); else new.user_id := old.user_id; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger notification_preferences_before_write before insert or update on public.notification_preferences
  for each row when (current_user in ('authenticated', 'anon'))
  execute function app_private.notification_preferences_before_write();

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant insert (in_app_offers, in_app_seeds, in_app_matches, in_app_listings, email_enabled) on public.notification_preferences to authenticated;
grant update (in_app_offers, in_app_seeds, in_app_matches, in_app_listings, email_enabled) on public.notification_preferences to authenticated;
create policy notification_preferences_own_select on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_own_insert on public.notification_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_preferences_own_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email')),
  status text not null check (status in ('delivered', 'queued', 'not_configured', 'failed')),
  detail text check (char_length(detail) <= 200),
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;
grant select on public.notification_deliveries to authenticated;
create policy notification_deliveries_own on public.notification_deliveries for select to authenticated
  using (exists (select 1 from public.notifications n where n.id = notification_id and n.recipient_id = (select auth.uid())));

-- Notification fan-out: honours optional-category preferences, dedupes on payload.dedupe_key,
-- records an in-app delivery and (if the user opted in) an email delivery that stays
-- 'not_configured' until the owner configures custom SMTP + a mail worker.
create or replace function app_private.notify(p_recipient uuid, p_type text, p_title text, p_body text, p_link text, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_pref public.notification_preferences;
  v_cat text := case
      when p_type like 'offer\_%' then 'offers' when p_type = 'order_update' then 'orders'
      when p_type = 'seed_order_update' then 'seeds' when p_type = 'match_proposal' then 'matches'
      when p_type = 'listing_moderated' then 'listings' when p_type = 'role_update' then 'account'
      else 'security' end;
  v_dedupe text := left(nullif(coalesce(p_payload, '{}'::jsonb) ->> 'dedupe_key', ''), 120);
  v_id uuid;
begin
  select * into v_pref from public.notification_preferences where user_id = p_recipient;
  if found and (
       (v_cat = 'offers' and not v_pref.in_app_offers) or (v_cat = 'seeds' and not v_pref.in_app_seeds) or
       (v_cat = 'matches' and not v_pref.in_app_matches) or (v_cat = 'listings' and not v_pref.in_app_listings)) then
    return;
  end if;
  insert into public.notifications (recipient_id, type, title, body, link, payload, dedupe_key)
  values (p_recipient, p_type, p_title, p_body, p_link, coalesce(p_payload, '{}'::jsonb), v_dedupe)
  on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is null then return; end if;
  insert into public.notification_deliveries (notification_id, channel, status) values (v_id, 'in_app', 'delivered');
  if coalesce(v_pref.email_enabled, false) then
    insert into public.notification_deliveries (notification_id, channel, status, detail)
    values (v_id, 'email', 'not_configured', 'custom SMTP not configured by owner');
  end if;
end $$;
revoke all on function app_private.notify(uuid, text, text, text, text, jsonb) from public;

grant update (archived_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
create policy notifications_delete_own on public.notifications for delete to authenticated using (recipient_id = (select auth.uid()));

create or replace function public.archive_notifications(p_ids uuid[], p_archive boolean default true)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then
    raise exception 'provide between 1 and 200 ids' using errcode = '22023';
  end if;
  update public.notifications
     set archived_at = case when p_archive then now() else null end,
         read_at = coalesce(read_at, case when p_archive then now() end)
   where recipient_id = auth.uid() and id = any (p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.archive_notifications(uuid[], boolean) from public, anon;
grant execute on function public.archive_notifications(uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Saved searches (marketplace / demand / seeds). Search history stays on-device.
-- ---------------------------------------------------------------------------
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  scope text not null check (scope in ('marketplace', 'demand', 'seeds')),
  name text not null check (char_length(trim(name)) between 1 and 60),
  filters jsonb not null check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) <= 2000),
  created_at timestamptz not null default now()
);
create index saved_searches_owner_idx on public.saved_searches (owner_id, created_at desc);

create or replace function app_private.saved_searches_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.owner_id := auth.uid();
  if (select count(*) from public.saved_searches where owner_id = new.owner_id) >= 25 then
    raise exception 'saved search limit reached (25)' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function app_private.saved_searches_before_insert() from public;
create trigger saved_searches_before_insert before insert on public.saved_searches
  for each row when (current_user in ('authenticated', 'anon'))
  execute function app_private.saved_searches_before_insert();

alter table public.saved_searches enable row level security;
revoke all on public.saved_searches from anon, authenticated;
grant select, delete on public.saved_searches to authenticated;
grant insert (scope, name, filters) on public.saved_searches to authenticated;
create policy saved_searches_own_select on public.saved_searches for select to authenticated using (owner_id = (select auth.uid()));
create policy saved_searches_own_insert on public.saved_searches for insert to authenticated with check (owner_id = (select auth.uid()));
create policy saved_searches_own_delete on public.saved_searches for delete to authenticated using (owner_id = (select auth.uid()));
