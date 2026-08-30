"""Pull green lots from Cropster."""
import urllib.request, json, base64, os

# Security Fix: Remove hardcoded credentials. Use environment variables.
CLIENT_ID = os.environ.get("CROPSTER_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("CROPSTER_CLIENT_SECRET", "")
CREDS = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
HEADERS = {"User-Agent": "SiloOS/1.0", "Accept": "application/json", "Authorization": f"Basic {CREDS}"}

url = "https://c-sar.cropster.com/api/v2/lots?filter[lots][group]=SCANO&filter[type]=green&page[size]=50"
req = urllib.request.Request(url, headers=HEADERS)
resp = urllib.request.urlopen(req, timeout=30)
data = json.loads(resp.read().decode())
lots = data.get("data", [])
print(f"Found {len(lots)} green lot(s):\n")
for l in lots:
    a = l["attributes"]
    w = a.get("weight", {})
    rels = l.get("relationships", {})
    loc = rels.get("location", {}).get("data", {})
    loc_id = loc.get("id", "-") if isinstance(loc, dict) else "-"
    print(f"  [{l['id']}] {a.get('name','?')}")
    print(f"    Weight: {w.get('amount','?')} {w.get('unit','?')} | ICO: {a.get('icoNumber','-')} | Crop: {a.get('cropYear','-')}")
    print(f"    Location: {loc_id} | ERP: {a.get('erpId','-')}")
    print()
