"""Quick diagnostic: test Tableau Server connectivity."""
import urllib.request
import ssl
import json

server = 'https://si-mytableau-pprod.edf.fr'
ctx = ssl.create_default_context()

# Test 1: Server info (no auth needed)
info_url = f'{server}/api/3.21/serverinfo'
print(f'[1] GET {info_url}')
try:
    req = urllib.request.Request(info_url, headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        raw = resp.read()
        ct = resp.headers.get('Content-Type', 'unknown')
        print(f'    Status: {resp.status}')
        print(f'    Content-Type: {ct}')
        text = raw.decode('utf-8', errors='replace')[:500]
        if 'json' in ct:
            data = json.loads(text)
            print(f'    Server Info: {json.dumps(data, indent=2)[:400]}')
        else:
            print(f'    Body (first 300 chars): {text[:300]}')
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')[:300]
    print(f'    HTTP Error {e.code}: {body}')
except Exception as e:
    print(f'    ERROR: {type(e).__name__}: {e}')

# Test 2: Try sign-in with empty creds to see response format
print()
signin_url = f'{server}/api/3.21/auth/signin'
print(f'[2] POST {signin_url} (empty creds - expect 401)')
try:
    payload = json.dumps({'credentials': {'personalAccessTokenName': 'test', 'personalAccessTokenSecret': 'test', 'site': {'contentUrl': ''}}}).encode('utf-8')
    req = urllib.request.Request(signin_url, data=payload, headers={'Accept': 'application/json', 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        raw = resp.read()
        ct = resp.headers.get('Content-Type', 'unknown')
        print(f'    Status: {resp.status}')
        print(f'    Content-Type: {ct}')
        text = raw.decode('utf-8', errors='replace')[:500]
        print(f'    Body: {text[:300]}')
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')[:500]
    ct = e.headers.get('Content-Type', 'unknown') if e.headers else 'unknown'
    print(f'    HTTP Error {e.code} (Content-Type: {ct})')
    print(f'    Body: {body[:300]}')
except Exception as e:
    print(f'    ERROR: {type(e).__name__}: {e}')

print()
print('Done. If you see HTML above, the server may be behind a proxy or SSO.')
print('If SSL error, try: set TABLEAU_SSL_NO_VERIFY=1')
