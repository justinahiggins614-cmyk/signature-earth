#!/usr/bin/env python3
"""
Signature Earth addresses archive drip.

Seeds and grows the million-address archive with REAL geocoded addresses —
every record comes from a live Nominatim reverse-geocode of one of the
site's existing GeoNames place coordinates. NOTHING is invented,
interpolated, or procedurally generated.

Data honesty per record: osm_place_id, osm_display_name, lat, lon, country,
fetched_at. Dedupe key = OSM place_id (never re-request a cached coordinate).

Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
  - max 1 request/second (we wait 1.2s between requests)
  - every response cached on disk; cached coordinates are NEVER re-requested
  - identifying User-Agent

Layout:
  data/addresses/state.json        {next_index, total, cursor}
  data/addresses/seen_place_ids.json  (sorted list, dedupe)
  data/addresses/chunks/addr-cNNNNN.jsonl.gz  (500 full records per chunk)
  data/addresses/index.json.gz     (compact client rows [id,label,lat,lon,country,place_id])
  data/addresses/stats.json        {total, letters, goal}
  code/.nominatim_cache/rev_<lat>_<lon>.json  (raw responses)

Run: python3 code/drip_addresses.py --n 300
Cron: every 2h (see jah-addresses-drip cron job).
"""
import argparse, gzip, json, math, os, random, sys, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADDR = os.path.join(ROOT, "data", "addresses")
CHUNKS = os.path.join(ADDR, "chunks")
CACHE = os.path.join(ROOT, "code", ".nominatim_cache")
UA = "SignatureEarth-Drip/1.0 (https://justinahiggins614-cmyk.github.io/signature-earth/)"
GOAL = 1000000
CHUNK_SIZE = 500

for d in (ADDR, CHUNKS, CACHE):
    os.makedirs(d, exist_ok=True)

def load_json(p, default):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default

def save_json(p, obj):
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f)
    os.replace(tmp, p)

def state():
    return load_json(os.path.join(ADDR, "state.json"),
                     {"next_index": 1, "total": 0, "cursor": 0})

def gazetteer_coords():
    with gzip.open(os.path.join(ROOT, "data", "index", "names.json.gz"), "rt", encoding="utf-8") as f:
        rows = json.load(f)
    return [(r[1], r[2]) for r in rows]  # (lat, lon)

def cache_key(la, lo):
    return "rev_%.4f_%.4f.json" % (la, lo)

def reverse_geocode(la, lo):
    """Returns the parsed Nominatim record, or None. Cached forever."""
    ck = os.path.join(CACHE, cache_key(la, lo))
    if os.path.exists(ck):
        return load_json(ck, None)
    q = urllib.parse.urlencode({"format": "json", "lat": la, "lon": lo,
                                "zoom": 18, "addressdetails": 1})
    req = urllib.request.Request(
        "https://nominatim.openstreetmap.org/reverse?" + q,
        headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rec = json.load(r)
    except Exception as e:
        print("  nominatim error for %.4f,%.4f: %s" % (la, lo, e), flush=True)
        return None
    time.sleep(1.2)  # usage policy: max 1 req/sec
    with open(ck, "w", encoding="utf-8") as f:
        json.dump(rec, f)
    return rec

def is_address(rec):
    """Only real street addresses: must have a road (or house_number)."""
    if not rec or not rec.get("place_id") or not rec.get("display_name"):
        return False
    a = rec.get("address") or {}
    return bool(a.get("road") or a.get("house_number") or a.get("building"))

def country_of(rec):
    a = rec.get("address") or {}
    return a.get("country") or (rec.get("display_name", "").split(",")[-1].strip())

def short_label(display_name):
    parts = [p.strip() for p in (display_name or "").split(",")]
    return ", ".join(parts[:3])

def append_chunk(records):
    """Append full records to the current chunk; returns chunk name."""
    st = state()
    idx = st["next_index"]
    cnum = (idx - 1) // CHUNK_SIZE + 1
    cpath = os.path.join(CHUNKS, "addr-c%05d.jsonl.gz" % cnum)
    with gzip.open(cpath, "at", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return os.path.basename(cpath)

def rebuild_index_and_stats():
    rows, letters = [], {}
    total = 0
    cnum = 1
    while True:
        cpath = os.path.join(CHUNKS, "addr-c%05d.jsonl.gz" % cnum)
        if not os.path.exists(cpath):
            break
        with gzip.open(cpath, "rt", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                rows.append([r["id"], r["label"], r["lat"], r["lon"],
                             r["country"], r["osm_place_id"]])
                L = (r["label"][:1] or "#").upper()
                if not ("A" <= L <= "Z"):
                    L = "#"
                letters[L] = letters.get(L, 0) + 1
                total += 1
        cnum += 1
    with gzip.open(os.path.join(ADDR, "index.json.gz"), "wt", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    save_json(os.path.join(ADDR, "stats.json"),
              {"total": total, "letters": letters, "goal": GOAL,
               "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    return total

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300,
                    help="max NEW addresses to add this run (default 300)")
    args = ap.parse_args()

    st = state()
    seen = set(load_json(os.path.join(ADDR, "seen_place_ids.json"), []))
    coords = gazetteer_coords()
    print("gazetteer pool: %d coords; seen place_ids: %d; next: JAH-ADDR-%06d"
          % (len(coords), len(seen), st["next_index"]), flush=True)

    rnd = random.Random(20261005)
    order = list(range(len(coords)))
    rnd.shuffle(order)
    # resume roughly where the last run left off, but shuffled for spread
    start = st.get("cursor", 0) % len(order)

    new_records, added, tried = [], 0, 0
    i = start
    while added < args.n and tried < len(coords) * 2:
        la, lo = coords[order[i % len(order)]]
        i += 1
        tried += 1
        ck = os.path.join(CACHE, cache_key(la, lo))
        cached = os.path.exists(ck)
        rec = reverse_geocode(la, lo)
        if not cached:
            pass  # reverse_geocode already slept
        if not is_address(rec):
            continue
        pid = rec["place_id"]
        if pid in seen:
            continue
        seen.add(pid)
        idx = st["next_index"]
        st["next_index"] = idx + 1
        new_records.append({
            "id": "JAH-ADDR-%06d" % idx,
            "label": short_label(rec["display_name"]),
            "display_name": rec["display_name"],
            "lat": float(rec["lat"]), "lon": float(rec["lon"]),
            "country": country_of(rec),
            "osm_place_id": pid,
            "osm_class": rec.get("class"), "osm_type": rec.get("type"),
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        added += 1
        if added % 25 == 0:
            print("  +%d new addresses (JAH-ADDR-%06d)" % (added, idx), flush=True)

    st["cursor"] = i % len(order)
    if new_records:
        chunk = append_chunk(new_records)
        st["total"] = st.get("total", 0) + added
        save_json(os.path.join(ADDR, "state.json"), st)
        save_json(os.path.join(ADDR, "seen_place_ids.json"), sorted(seen))
        total = rebuild_index_and_stats()
        print("appended %d records to %s; archive total %d / %d"
              % (added, chunk, total, GOAL), flush=True)
    else:
        print("no new addresses this run (all cached/dupes)", flush=True)

if __name__ == "__main__":
    main()
