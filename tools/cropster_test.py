"""Cropster REST API v2 - Complete data inventory for SiloOS integration."""
import urllib.request
import json
import base64

CLIENT_ID = "305de0edc0f643869f15610df0f44fd6"
CLIENT_SECRET = "b0b41510c5b31ed134614ea4995bf687a79c9c606ca910d231b075cbe6a633be"
BASE_URL = "https://c-sar.cropster.com/api/v2"
GROUP = "SCANO"

CREDS = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
HEADERS = {
    "User-Agent": "SiloOS/1.0",
    "Accept": "application/json",
    "Authorization": f"Basic {CREDS}",
}

def api_get(path):
    url = f"{BASE_URL}/{path}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        print(f"  ERROR: HTTP {e.code} - {body[:200]}")
        return None

def section(title):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def main():
    # ── GREEN LOTS ──
    section("GREEN LOTS")
    result = api_get(f"lots?filter[lots][group]={GROUP}&filter[type]=green&page[size]=50")
    green_lots = []
    if result:
        green_lots = result.get("data", [])
        print(f"Found {len(green_lots)} green lot(s):\n")
        for lot in green_lots:
            a = lot.get("attributes", {})
            w = a.get("weight", {})
            rels = lot.get("relationships", {})
            loc_id = rels.get("location", {}).get("data", {})
            if isinstance(loc_id, dict):
                loc_id = loc_id.get("id", "-")
            else:
                loc_id = "-"
            print(f"  [{lot['id']}] {a.get('name', 'N/A')}")
            print(f"    Weight: {w.get('amount', '?')} {w.get('unit', '?')}")
            print(f"    ICO: {a.get('icoNumber', '-')} | Crop Year: {a.get('cropYear', '-')}")
            print(f"    ERP ID: {a.get('erpId', '-')} | Location: {loc_id}")
            print(f"    Created: {a.get('created', '-')} | Modified: {a.get('lastModified', '-')}")
            print()

    # ── ROASTED LOTS ──
    section("ROASTED LOTS")
    result = api_get(f"lots?filter[lots][group]={GROUP}&filter[type]=roasted&page[size]=50")
    if result:
        roasted = result.get("data", [])
        print(f"Found {len(roasted)} roasted lot(s):\n")
        for lot in roasted[:20]:
            a = lot.get("attributes", {})
            w = a.get("weight", {})
            rels = lot.get("relationships", {})
            profile_data = rels.get("profile", {}).get("data", {})
            profile_id = profile_data.get("id", "-") if isinstance(profile_data, dict) else "-"
            source_data = rels.get("sourceLots", {}).get("data", [])
            source_ids = [s.get("id","?") for s in source_data] if isinstance(source_data, list) else []
            loc_data = rels.get("location", {}).get("data", {})
            loc_id = loc_data.get("id","-") if isinstance(loc_data, dict) else "-"
            machine_data = rels.get("machine", {}).get("data", {})
            machine_id = machine_data.get("id","-") if isinstance(machine_data, dict) else "-"
            
            print(f"  [{lot['id']}] {a.get('name', 'N/A')}")
            print(f"    Weight: {w.get('amount', '?')} {w.get('unit', '?')}")
            print(f"    Profile: {profile_id} | Machine: {machine_id} | Location: {loc_id}")
            print(f"    Source lots: {source_ids}")
            print(f"    ERP: {a.get('erpId', '-')} | Created: {a.get('created', '-')}")
            print()

    # ── BLENDED LOTS ──
    section("BLENDED LOTS")
    result = api_get(f"lots?filter[lots][group]={GROUP}&filter[type]=blended&page[size]=50")
    if result:
        blended = result.get("data", [])
        print(f"Found {len(blended)} blended lot(s):\n")
        for lot in blended[:15]:
            a = lot.get("attributes", {})
            w = a.get("weight", {})
            rels = lot.get("relationships", {})
            source_data = rels.get("sourceLots", {}).get("data", [])
            source_ids = [s.get("id","?") for s in source_data] if isinstance(source_data, list) else []
            
            print(f"  [{lot['id']}] {a.get('name', 'N/A')}")
            print(f"    Weight: {w.get('amount', '?')} {w.get('unit', '?')}")
            print(f"    Source lots: {source_ids}")
            print(f"    ERP: {a.get('erpId', '-')}")
            print()

    # ── PROFILES ──
    section("ROAST PROFILES")
    result = api_get(f"profiles?filter[profiles][group]={GROUP}&page[size]=50")
    if result:
        profiles = result.get("data", [])
        print(f"Found {len(profiles)} profile(s):\n")
        for p in profiles:
            a = p.get("attributes", {})
            print(f"  [{p['id']}] {a.get('name', 'N/A')} (ERP: {a.get('erpId', '-')})")

    # ── LOCATIONS ──
    section("LOCATIONS")
    result = api_get(f"locations?filter[locations][group]={GROUP}&page[size]=50")
    if result:
        locs = result.get("data", [])
        print(f"Found {len(locs)} location(s):\n")
        for loc in locs:
            a = loc.get("attributes", {})
            print(f"  [{loc['id']}] {a.get('name', 'N/A')}")
            print(f"    {json.dumps(a, indent=4)}")
            print()

    # ── MACHINES ──
    section("MACHINES")
    result = api_get("machines")
    if result:
        machines = result.get("data", [])
        print(f"Found {len(machines)} machine(s):\n")
        for m in machines:
            a = m.get("attributes", {})
            cap = a.get("capacity", {})
            print(f"  [{m['id']}] {a.get('name', 'N/A')}")
            print(f"    Capacity: {cap.get('amount', '?')} {cap.get('unit', '?')}")
            print(f"    ERP: {a.get('erpId', '-')}, Sample: {a.get('forSamples', False)}")
            print()

if __name__ == "__main__":
    main()
