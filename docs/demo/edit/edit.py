#!/usr/bin/env python3
"""SEED X demo editor: cuts real recorded segments, adds guide overlays + subtitles, encodes final MP4s.
Usage: python3 edit.py stage|full   (reads ../raw/*.mp4 + *.json, writes ../SEED_X_*.mp4)
Every frame of product UI comes from the real browser recording; overlays are drawn outside the app."""
import json, os, subprocess, sys, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); RAW = os.path.join(HERE, '..', 'raw'); TMP = os.path.join(HERE, 'tmp')
os.makedirs(TMP, exist_ok=True)
OFF = 0.7  # recording starts ~0.7 s before the logged t=0 of each segment
FONT = '/usr/share/fonts/opentype/inter/'
F = lambda n, s: ImageFont.truetype(FONT + n, s)
FOREST, DEEP, GOLD, CREAM, MINT = (23, 75, 53), (14, 46, 33), (229, 166, 59), (245, 240, 228), (230, 241, 231)
EV = {}
for f in os.listdir(RAW):
    if f.endswith('.json'):
        d = json.load(open(os.path.join(RAW, f))); EV[d['name']] = {e['label']: e for e in d['events']}

def ev(seg, label): return EV[seg][label]['t'] + OFF
def box(seg, label): return EV[seg][label]['box']

def run(cmd): subprocess.run(cmd, check=True)

# ------------------------------------------------------------------ overlay drawing
def rr(d, xy, r, **k): d.rounded_rectangle(xy, r, **k)

def chip(text, sub=None):
    f1, f2 = F('InterDisplay-Bold.otf', 34), F('Inter-Medium.otf', 24)
    w = max(f1.getlength(text), f2.getlength(sub) if sub else 0) + 64
    h = 78 if not sub else 116
    im = Image.new('RGBA', (int(w) + 20, h + 20)); d = ImageDraw.Draw(im)
    rr(d, (10, 10, 10 + w, 10 + h), 18, fill=DEEP + (238,), outline=GOLD + (255,), width=2)
    d.rectangle((10, 26, 17, 10 + h - 16), fill=GOLD)
    d.text((40, 26), text, font=f1, fill=CREAM)
    if sub: d.text((40, 72), sub, font=f2, fill=MINT)
    return im

def banner(title, sub=None, width=None, size=52, wrap=70):
    f1, f2 = F('InterDisplay-Bold.otf', size), F('Inter-Medium.otf', 30)
    lines = textwrap.wrap(sub, wrap) if sub else []
    width = width or int(max([f1.getlength(title)] + [f2.getlength(l) for l in lines]) + 90)
    h = 110 + 42 * len(lines) + (14 if lines else 0)
    im = Image.new('RGBA', (width, h)); d = ImageDraw.Draw(im)
    rr(d, (0, 0, width - 1, h - 1), 24, fill=DEEP + (240,), outline=GOLD + (255,), width=3)
    d.text((width / 2, 54), title, font=f1, fill=GOLD, anchor='mm')
    for i, l in enumerate(lines): d.text((width / 2, 112 + 42 * i), l, font=f2, fill=CREAM, anchor='mm')
    return im

def card(title, rows, foot=None, width=760):
    f1, f2, f3 = F('InterDisplay-Bold.otf', 40), F('Inter-SemiBold.otf', 32), F('Inter-Medium.otf', 24)
    fl = textwrap.wrap(foot, 50) if foot else []
    h = 96 + 54 * len(rows) + (30 + 32 * len(fl) if foot else 20)
    im = Image.new('RGBA', (width, h)); d = ImageDraw.Draw(im)
    rr(d, (0, 0, width - 1, h - 1), 24, fill=DEEP + (242,), outline=GOLD + (255,), width=3)
    d.text((36, 30), title, font=f1, fill=GOLD)
    y = 100
    for left, right, strong in rows:
        col = CREAM if not strong else GOLD
        d.text((36, y), left, font=f2, fill=col); d.text((width - 36, y), right, font=f2, fill=col, anchor='ra'); y += 54
    if foot:
        for i, l in enumerate(fl): d.text((36, y + 12 + 32 * i), l, font=f3, fill=MINT)
    return im

def highlight(b, pad=10):
    w, h = b['w'] + 2 * pad, b['h'] + 2 * pad
    im = Image.new('RGBA', (w + 40, h + 40)); d = ImageDraw.Draw(im)
    rr(d, (20, 20, 20 + w, 20 + h), 14, outline=GOLD + (120,), width=12)
    im = im.filter(ImageFilter.GaussianBlur(6)); d = ImageDraw.Draw(im)
    rr(d, (20, 20, 20 + w, 20 + h), 14, outline=GOLD + (255,), width=4)
    return im, b['x'] - pad - 20, b['y'] - pad - 20

def subtitle(speaker, text):
    f1, f2 = F('Inter-Bold.otf', 22), F('Inter-SemiBold.otf', 40)
    lines = textwrap.wrap(text, 58)
    w = max(f2.getlength(l) for l in lines) + 80; w = max(w, 420)
    h = 64 + 52 * len(lines)
    im = Image.new('RGBA', (int(w), h)); d = ImageDraw.Draw(im)
    rr(d, (0, 0, w - 1, h - 1), 20, fill=(14, 46, 33, 224))
    d.text((40, 16), speaker, font=f1, fill=GOLD)
    for i, l in enumerate(lines): d.text((w / 2, 48 + 52 * i), l, font=f2, fill=CREAM, anchor='ma')
    return im

# ------------------------------------------------------------------ clip building
ZN = (548, 300, 1372, 772)    # NetBack zoom crop (1.4x)
ZC = (548, 150, 1372, 772)    # ClusterCart reasons zoom crop

def build_clips(clips, tag):
    files, t, starts = [], 0.0, []
    for i, c in enumerate(clips):
        out = os.path.join(TMP, f'{tag}_{i:02d}.mp4'); files.append(out)
        if c[0] in ('title', 'end', 'img'):
            src = os.path.join(HERE, c[1]) if c[0] == 'img' else os.path.join(HERE, c[0] + '.png'); dur = c[2] if c[0] == 'img' else c[1]
            vf = f"scale=2112:1188,zoompan=z='1+0.0006*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(dur*30)}:s=1920x1080:fps=30,fade=in:st=0:d=0.6,fade=out:st={dur-0.6}:d=0.6"
            run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', src, '-t', str(dur), '-vf', vf, '-r', '30', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p', out])
            starts.append((c, t)); t += dur; continue
        seg, a, b = c[0], c[1], c[2]; z = c[3] if len(c) > 3 else None
        vf = 'fps=30'
        if z: vf = f'crop={z[2]}:{z[3]}:{z[0]}:{z[1]},scale=1920:1080:flags=lanczos,fps=30'
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{a:.3f}', '-i', os.path.join(RAW, seg + '.mp4'), '-t', f'{b - a:.3f}', '-vf', vf,
             '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an', out])
        starts.append((c, t)); t += b - a
    return files, starts, t

def at(starts, seg, vt):
    """Map a raw-segment video time to final timeline time (None if cut)."""
    for c, t0 in starts:
        if c[0] == seg and c[1] <= vt <= c[2]: return t0 + vt - c[1]
    return None

def zoomed(starts, seg, vt):
    for c, t0 in starts:
        if c[0] == seg and c[1] <= vt <= c[2]: return len(c) > 3 and c[3] is not None
    return False

# ------------------------------------------------------------------ compositor
def compose(files, overlays, total, outname):
    lst = os.path.join(TMP, 'list.txt'); open(lst, 'w').write(''.join(f"file '{f}'\n" for f in files))
    base = os.path.join(TMP, 'base.mp4')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', base])
    args = ['ffmpeg', '-y', '-loglevel', 'error', '-i', base]
    fc, last = [], '0:v'
    for i, (im, x, y, t0, t1) in enumerate(overlays):
        p = os.path.join(TMP, f'ov_{i:03d}.png'); im.save(p); dur = t1 - t0
        args += ['-loop', '1', '-framerate', '30', '-t', f'{dur:.3f}', '-i', p]
        fc.append(f'[{i + 1}:v]format=rgba,fade=in:st=0:d=0.3:alpha=1,fade=out:st={max(dur - 0.3, 0):.3f}:d=0.3:alpha=1,setpts=PTS-STARTPTS+{t0:.3f}/TB[o{i}]')
        fc.append(f'[{last}][o{i}]overlay=x={int(x)}:y={int(y)}:eof_action=pass[v{i}]'); last = f'v{i}'
    script = os.path.join(TMP, 'fc.txt'); open(script, 'w').write(';\n'.join(fc) if fc else 'null')
    out = os.path.join(HERE, '..', outname)
    args += ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-filter_complex_script', script,
             '-map', f'[{last}]' if fc else '0:v', '-map', f'{len(overlays) + 1}:a', '-t', f'{total:.3f}',
             '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30',
             '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out]
    run(args); print('wrote', out, round(total, 2))

def subs_for(section_lines, s0, s1, speaker, overlays):
    chunks, sl = [], []
    for line in section_lines:
        parts = line.split('. ') if len(line) > 116 else [line]
        sl += [x + ('.' if i < len(parts) - 1 else '') for i, x in enumerate(parts)]
    for line in sl:
        if len(line) <= 116: chunks.append(line)
        else:
            cut = [i for i, ch in enumerate(line) if ch == ',' and 30 < i < len(line) - 25]
            if cut:
                i = min(cut, key=lambda i: abs(i - len(line) / 2)); chunks += [line[:i + 1], line[i + 2:]]
            else: chunks += textwrap.wrap(line, 110)
    tot = sum(len(c) + 25 for c in chunks); t = s0 + 0.3; span = (s1 - 0.3) - t
    for c in chunks:
        d = span * (len(c) + 25) / tot
        im = subtitle(speaker, c); overlays.append((im, (1920 - im.width) / 2, 1080 - im.height - 30, t, t + d - 0.05)); t += d

def add_hl(overlays, starts, seg, label, dur=1.8, lead=0.4):
    vt = ev(seg, label); ft = at(starts, seg, vt)
    if ft is None or zoomed(starts, seg, vt): return
    im, x, y = highlight(box(seg, label)); overlays.append((im, x, y, max(ft - lead, 0), ft - lead + dur))

def add_chip(overlays, t0, t1, text, sub=None, y=None, right=False):
    im = chip(text, sub); overlays.append((im, 1920 - im.width - 28 if right else 28, y if y is not None else 1080 - 230 - im.height, t0, t1))

def add_banner(overlays, t0, t1, title, sub=None, y=110, x=None, **k):
    im = banner(title, sub, **k); overlays.append((im, (1920 - im.width) / 2 if x is None else x, y, t0, t1))

# ------------------------------------------------------------------ STAGE (owner's Slide 11 timeline)
SPEECH = [  # (section start, end, speaker, sentences) - final thank-you lines intentionally excluded
    (0, 30, 'TEJASH', ["Instead of just explaining our idea, we'd like to show you how someone actually uses SEED X.", "Let's start with a farmer.",
                       "This is our actual deployed application. A farmer can access SEED X through a browser, without needing any special hardware.", "Let's see how the journey begins."]),
    (30, 55, 'TEJASH', ["First, the farmer creates an account and selects the farmer role.", "They enter their required details and complete the account verification process.",
                        "We've kept the process straightforward because a farmer shouldn't need technical knowledge just to get started.", "Once signed in, they reach their own farmer workspace."]),
    (55, 75, 'TEJASH', ["Here's the farmer dashboard.", "From My Products, the farmer can list the harvest, enter the quantity, choose the quality and set a minimum acceptable price.",
                        "For example, this farmer has a listing of 900 kilograms of tomatoes.", "The idea is simple: make available produce visible to potential buyers."]),
    (75, 95, 'TEJASH', ["Now let's switch to the buyer's side.", "A buyer can search for available produce or post a requirement.",
                        "Here, we're using an example of a buyer requesting 300 kilograms and making an offer of 22 rupees per kilogram.", "The farmer can review the offer and decide whether to accept, reject or negotiate."]),
    (95, 115, 'SHAURYA', ["Now look at NetBack.", "Instead of showing only the selling price, it calculates what the farmer may actually retain after the expenses paid by the farmer.",
                          "It also shows the buyer's landed cost separately.", "That means both sides can understand the economics of the same transaction before making a decision."]),
    (115, 140, 'SHAURYA', ["Next is ClusterCart, our multi-farmer and multi-buyer matching feature.", "This is a separate wheat demonstration scenario, not the tomato transaction we just showed.",
                           "It evaluates compatible supply and buyer demand, then compares pooled and separate transportation.", "Notice the result.",
                           "In this demonstration, it recommends separate trips because the estimated pooled route costs more.",
                           "It doesn't recommend sharing just because sharing is its main feature. It recommends it only when it makes economic sense."]),
    (140, 155, 'SHAURYA', ["After an offer is accepted, the available stock is reserved through the order workflow.", "The buyer and farmer can follow the order's actual progress through the supported delivery statuses.",
                           "This helps keep the transaction organised and prevents the same available stock from being sold twice."]),
    (155, 167, 'TEJASH', ["And finally, buyers can manage their suppliers, farmers can manage their clients, and users can switch to their preferred language, including Hindi.",
                          "This is SEED X: one connected workspace for the farmer's business."]),
]

def stage():
    clips = [('title', 8.0),
             ('seg01_url', 0.4, 6.4), ('seg02_home', 3.5, 9.5), ('seg02_home', 15.0, 20.0), ('seg02_home', 27.0, 32.0),                  # A 0-30
             ('seg03_register', 10.0, 27.0), ('seg03_register', 37.0, 45.0),                                                               # B 30-55
             ('seg04_farmer', 1.0, 6.5), ('seg04_farmer', 6.6, 13.6), ('seg04_farmer', 55.6, 59.8), ('seg04_farmer', 67.6, 69.2), ('seg04_farmer', 74.6, 76.3),  # C 55-75
             ('seg05_buyer', 5.5, 11.0), ('seg05_buyer', 12.6, 17.4), ('seg05_buyer', 21.8, 26.4), ('seg05_buyer', 30.0, 35.1),         # D 75-95
             ('seg06_netback', 2.0, 18.0, ZN), ('seg06_netback', 23.2, 27.2),                                                              # E 95-115
             ('seg07_clustercart', 0.5, 13.5), ('seg07_clustercart', 13.5, 18.0), ('seg07_clustercart', 21.0, 28.5, ZC),                  # F 115-140
             ('seg08_order', 12.6, 20.0), ('seg08_order', 24.3, 28.0), ('seg08b_buyer_order', 2.4, 6.3),                                  # G 140-155
             ('seg09_relationships', 1.2, 4.2), ('seg09b_suppliers', 1.2, 4.2), ('seg10_hindi', 0.8, 4.6), ('seg10_hindi', 9.5, 14.5),   # H 155-169
             ('end', 8.0)]
    files, S, total = build_clips(clips, 'stage')
    print('sections:', [round(t, 2) for c, t in S])
    O = []
    for s0, s1, who, lines in SPEECH: subs_for(lines, s0, s1, who, O)
    # A
    add_chip(O, 8.3, 14.0, 'THE REAL, DEPLOYED WEBSITE', 'seedxsss.tejash-shastri-rx.workers.dev', y=140)
    add_chip(O, 14.5, 19.5, 'WELCOME TO SEED X', 'Farmers and buyers start here', y=150, right=True)
    # B
    add_chip(O, 30.0, 34.5, 'STEP 1 — CREATE YOUR ACCOUNT')
    add_hl(O, S, 'seg03_register', 'create_account')
    add_chip(O, 34.6, 42.0, 'STEP 2 — ENTER YOUR DETAILS', 'Synthetic demo details · password hidden')
    t = at(S, 'seg03_register', ev('seg03_register', 'submit_not_clicked'))
    add_banner(O, t - 0.6, t + 5.4, 'EMAIL VERIFICATION REQUIRED', 'A real sign-up gets a verification email. This form is not submitted in the demo — we continue with an approved demo farmer account.')
    add_chip(O, 50.3, 55.0, 'STEP 3 — SIGN IN · FARMER ROLE', 'Demo account: Dhruv (demo farmer)')
    add_hl(O, S, 'seg03_register', 'farmer_role_active', dur=2.0)
    # C
    add_chip(O, 55.0, 59.5, 'STEP 4 — YOUR FARMING BUSINESS, IN ONE PLACE')
    add_hl(O, S, 'seg04_farmer', 'tomato_900', dur=2.6)
    t = at(S, 'seg04_farmer', ev('seg04_farmer', 'tomato_900'))
    add_chip(O, t - 0.4, t + 2.4, '900 KG TOMATO LISTING', 'Demo data', y=880 - 116)
    add_chip(O, 67.4, 73.2, 'STEP 5 — LIST YOUR HARVEST · SET YOUR PRICE', 'Quantity · grade · minimum price')
    add_hl(O, S, 'seg04_farmer', 'publish', dur=1.5)
    add_chip(O, 73.3, 75.0, 'SAVED TO THE LIVE DATABASE', 'Separate demo lot for the order flow')
    # D
    add_chip(O, 75.0, 80.0, 'STEP 6 — BUYER: FIND PRODUCE', 'Demo buyer: Annapurna Hostel Mess')
    add_hl(O, S, 'seg05_buyer', 'requirement', dur=2.2)
    add_chip(O, 90.0, 95.0, 'THE OFFER', '300 kg · ₹22/kg · seller pays transport')
    # E
    add_chip(O, 95.0, 99.0, 'STEP 7 — CHECK NETBACK', 'What does the farmer actually keep?')
    O.append((card('NETBACK  ·  this offer', [('Gross sale value', '₹6,600', False), ('− Farmer-paid packing', '₹300', False), ('Estimated farmer net', '₹6,300', True),
                                               ('Buyer landed cost', '₹6,600', True)], 'Buyer-paid costs are never subtracted from the farmer\'s net. Estimates, not a profit statement.'), 40, 150, 99.5, 110.8))
    add_chip(O, 111.2, 115.0, 'OFFER SENT TO THE FARMER')
    # F
    add_banner(O, 115.2, 121.0, 'SEPARATE CLUSTERCART DEMONSTRATION SCENARIO', 'A saved wheat requirement — not the tomato order shown before.')
    add_chip(O, 121.2, 124.2, 'STEP 8 — RUN CLUSTERCART')
    add_hl(O, S, 'seg07_clustercart', 'run', dur=1.6)
    t = at(S, 'seg07_clustercart', ev('seg07_clustercart', 'result'))
    add_banner(O, t - 0.2, t + 6.8, 'CLUSTERCART RECOMMENDS: DO NOT POOL', 'Estimated pooled route ₹6,365 vs separate trips ₹5,364 — pooling would cost 18.7% more.', y=96, wrap=90)
    add_hl(O, S, 'seg07_clustercart', 'recommendation', dur=3.0)
    add_banner(O, 132.6, 140.0, 'SHARE ONLY WHEN IT MAKES SENSE', 'Sharing is recommended only when it is feasible and economically beneficial. Rule-based checks — not AI. Transport costs are estimates, not carrier quotes.', y=330, x=40, size=44, wrap=44)
    # G
    add_chip(O, 140.0, 143.4, 'STEP 9 — ACCEPT & RESERVE STOCK', 'Demo transaction · no payment')
    add_hl(O, S, 'seg08_order', 'accept', dur=1.6)
    add_chip(O, 143.6, 147.4, 'STOCK RESERVED · ORDER CREATED', 'The same stock cannot be sold twice')
    add_chip(O, 147.5, 151.1, 'TRACK YOUR ORDER', 'Pickup scheduled → In transit → Delivered')
    add_chip(O, 151.2, 155.0, 'BUYER CONFIRMS RECEIPT', 'Status: Delivered')
    # H
    add_chip(O, 155.0, 161.0, 'STEP 10 — MANAGE YOUR CUSTOMERS', 'My Clients · My Suppliers')
    add_chip(O, 161.1, 169.8, 'YOUR FARM. YOUR LANGUAGE.', 'Real translated Hindi interface — not subtitles')
    compose(files, O, total, 'SEED_X_STAGE_DEMO_1080P.mp4')
    json.dump({'clips': [[c[0], c[1], c[2] if len(c) > 2 else None, round(t, 2)] for c, t in S], 'total': total}, open(os.path.join(TMP, 'stage_map.json'), 'w'), indent=1)

# ------------------------------------------------------------------ FULL guided walkthrough
def full():
    clips = [('title', 6.0), ('seg01_url', 0.4, 8.9), ('seg02_home', 3.0, 36.0), ('seg02_home', 48.0, 60.0),
             ('seg03_register', 9.8, 47.6), ('seg04_farmer', 0.8, 17.3), ('seg04_farmer', 47.6, 77.8),
             ('seg05_buyer', 0.5, 35.0), ('img', 'netback_example.png', 9.0), ('seg06_netback', 1.0, 22.5, ZN), ('seg06_netback', 22.5, 27.6),
             ('seg07_clustercart', 0.4, 20.5), ('seg07_clustercart', 20.5, 29.0, ZC), ('seg07_clustercart', 29.0, 33.4),
             ('seg08_order', 0.4, 32.5), ('seg08b_buyer_order', 0.6, 9.8), ('seg08c_stock', 0.6, 6.4),
             ('seg09_relationships', 0.6, 5.9), ('seg09b_suppliers', 0.6, 5.9), ('seg10_hindi', 0.5, 15.2), ('end', 8.0)]
    files, S, total = build_clips(clips, 'full')
    O = []
    def G(seg, label, text, dur=4.5, lead=0.3, who='GUIDE'):
        t = at(S, seg, ev(seg, label)) if label else None
        if t is None: return
        im = subtitle(who, text); O.append((im, (1920 - im.width) / 2, 1080 - im.height - 30, t - lead, t - lead + dur))
    def T(t0, t1, text, who='GUIDE'):
        im = subtitle(who, text); O.append((im, (1920 - im.width) / 2, 1080 - im.height - 30, t0, t1))
    start = {c[0] + str(c[1]): t for c, t in S}
    t01 = start['seg01_url0.4']
    add_chip(O, t01 + 0.3, t01 + 7.5, 'THE REAL, DEPLOYED WEBSITE', 'seedxsss.tejash-shastri-rx.workers.dev', y=140)
    T(t01 + 0.3, t01 + 7.5, 'This is the live SEED X website, running on Cloudflare with a Supabase database.')
    G('seg02_home', 'hero', 'The home page: farmers list harvests, buyers post demand, and both trade in one place.', 6)
    G('seg02_home', 'cta_farmer', 'Two clear entry points: “I am a farmer” and “I buy produce”.', 6)
    G('seg02_home', 'language', 'The language picker is always visible — ten Indian languages.', 5)
    G('seg02_home', 'live_counts', 'Live counts and the journey are read from the database (records marked “Demo” are demo data).', 7)
    G('seg03_register', 'create_account', 'STEP 1 — Create your account.', 3.5)
    G('seg03_register', 'field_name', 'STEP 2 — Enter your details. We use synthetic demo details; the password is hidden.', 9)
    G('seg03_register', 'submit_not_clicked', 'A real sign-up sends a verification email. We do not submit this form in the demo.', 6)
    G('seg03_register', 'go_login', 'Instead we sign in with an approved demo farmer account: Dhruv (demo farmer).', 7)
    G('seg03_register', 'dashboard_reached', 'STEP 3 — After sign-in, the farmer chooses roles. “Farmer – sell my harvest” is active.', 5.5)
    G('seg04_farmer', 'command_centre', 'STEP 4 — The Farmer Command Centre: open listings, offers to answer, active orders and clients.', 5.5)
    G('seg04_farmer', 'nav_my_harvest', 'My harvest lists every lot with available, reserved and sold stock — including the 900 kg tomato listing.', 7)
    G('seg04_farmer', 'new_listing', 'STEP 5 — List a harvest: crop, title, grade, quantity and unit.', 6)
    G('seg04_farmer', 'field_qty', 'Set the minimum acceptable price, an asking price and any packing cost the farmer pays.', 6)
    G('seg04_farmer', 'field_state', 'Only the area is public. Exact pickup details are shared after an order is confirmed.', 6)
    G('seg04_farmer', 'publish', 'Publish — this separate demo lot is saved to the live database and used for the order flow.', 8)
    G('seg05_buyer', 'login_email', 'STEP 6 — Now the buyer side: an approved demo buyer, Annapurna Hostel Mess (demo).', 6)
    G('seg05_buyer', 'procurement_centre', 'The Buyer Procurement Centre, then Requirements — the buyer\'s posted demand.', 6)
    G('seg05_buyer', 'nav_marketplace', 'Search the marketplace for tomato and open the demo lot.', 7)
    G('seg05_buyer', 'offer_qty', 'Make an offer: 300 kg at ₹22/kg, seller pays transport.', 5)
    tn = start['img9.0'] if 'img9.0' in start else [t for c, t in S if c[0] == 'img'][0]
    add_chip(O, start['seg06_netback1.0'] + 0.2, start['seg06_netback1.0'] + 5, 'STEP 7 — CHECK NETBACK', 'What does the farmer actually keep?')
    G('seg06_netback', 'farmer_net', 'Farmer net: ₹6,600 gross − ₹300 farmer-paid packing = ₹6,300 (₹21/kg).', 4.3)
    G('seg06_netback', 'buyer_landed', 'Buyer landed cost: ₹6,600 — buyer-paid costs never reduce the farmer\'s net.', 4.3)
    G('seg06_netback', 'view_breakdown', 'Open the breakdown: each cost line shows who pays it and whether it is confirmed or estimated.', 6.5)
    G('seg06_netback', 'mandi_ref', 'A dated mandi price is shown only as a reference (labelled SAMPLE).', 3)
    G('seg06_netback', 'submit_offer', 'Send the offer to the farmer.', 4)
    t7 = start['seg07_clustercart0.4']
    add_banner(O, t7 + 0.2, t7 + 5.5, 'SEPARATE CLUSTERCART DEMONSTRATION SCENARIO', 'A saved wheat requirement — not the tomato order shown before.')
    G('seg07_clustercart', 'pick_wheat', 'STEP 8 — Choose the wheat requirement and run ClusterCart.', 4.5)
    t = at(S, 'seg07_clustercart', ev('seg07_clustercart', 'result'))
    add_banner(O, t, t + 7, 'CLUSTERCART RECOMMENDS: DO NOT POOL', 'Estimated pooled route ₹6,365 vs separate trips ₹5,364 — pooling would cost 18.7% more.', y=96, wrap=90)
    G('seg07_clustercart', 'why', 'Why this match? Hard checks first: crop, grade, quantity, price floor, distance, freshness, timing.', 5)
    G('seg07_clustercart', 'reason_pooling', 'Pooling is recommended only when it saves at least 5%. Here it would cost more, so: separate trips.', 5)
    G('seg07_clustercart', 'reason_checks', 'Rule-based and explainable — not AI. Transport costs are estimates, not carrier quotes.', 5)
    G('seg07_clustercart', 'checks_table', 'Every lot shows its quantity, price, gross value, estimated farmer net and transport cost.', 4)
    G('seg08_order', 'bell', 'STEP 9 — Back to the farmer. A notification shows the new offer.', 3)
    G('seg08_order', 'offer_card', 'The farmer reviews the offer with its NetBack — and can accept, counter or reject.', 6.5)
    G('seg08_order', 'accept', 'Accept & reserve: stock is reserved atomically and the order is created. Demo transaction — no payment.', 6)
    G('seg08_order', 'order_page', 'The order page: agreed terms, NetBack, parties and the timeline.', 5)
    G('seg08_order', 'schedule_pickup', 'The farmer schedules pickup, then marks the order in transit.', 7.5)
    G('seg08b_buyer_order', 'buyer_order', 'The buyer confirms receipt — the timeline shows every status change.', 8)
    G('seg08c_stock', 'stock_after', 'Stock after the order: 200 kg available, 300 kg sold — no double-selling.', 5)
    G('seg09_relationships', 'my_clients', 'STEP 10 — My Clients: the farmer\'s buyers, order counts and private notes.', 5)
    G('seg09b_suppliers', 'my_suppliers', 'My Suppliers: the buyer\'s farmers and purchase history.', 5)
    G('seg10_hindi', 'language', 'Switch the language to Hindi — the real interface is translated, not subtitled.', 3.0)
    G('seg10_hindi', 'hindi_dashboard', 'Dashboard, navigation and buttons in Hindi.', 3.5)
    G('seg10_hindi', 'hindi_marketplace', 'The marketplace in Hindi, with crop names in Hindi.', 4.5)
    compose(files, O, total, 'SEED_X_FULL_GUIDED_WALKTHROUGH.mp4')
    json.dump({'clips': [[c[0], c[1], c[2] if len(c) > 2 else None, round(t, 2)] for c, t in S], 'total': total}, open(os.path.join(TMP, 'full_map.json'), 'w'), indent=1)

if __name__ == '__main__':
    {'stage': stage, 'full': full}[sys.argv[1]]()
