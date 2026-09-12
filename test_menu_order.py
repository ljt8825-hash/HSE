import json
import urllib.request

BASE = 'http://127.0.0.1:3000'

def api(method, path, body=None, token=None):
    url = f'{BASE}{path}'
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())
    except Exception as e:
        return {'error': str(e)}

# 1. Login
print('=== Login ===')
login = api('POST', '/api/auth/login', body={'username': 'admin', 'password': '123456'})
token = login['data']['token']
print(f"Token: {token[:30]}...")

# 2. GET empty
print('\n=== GET (empty) ===')
print(json.dumps(api('GET', '/api/user/menu-order', token=token), ensure_ascii=False, indent=2))

# 3. POST
print('\n=== POST ===')
print(json.dumps(api('POST', '/api/user/menu-order', token=token, body={
    'orders': [
        {'path': '/hse/dashboard', 'order': 0},
        {'path': '/hse/accidents', 'order': 1},
        {'path': '/hse/training', 'order': 2}
    ]
}), ensure_ascii=False, indent=2))

# 4. GET has data
print('\n=== GET (has data) ===')
print(json.dumps(api('GET', '/api/user/menu-order', token=token), ensure_ascii=False, indent=2))

# 5. DELETE
print('\n=== DELETE ===')
print(json.dumps(api('DELETE', '/api/user/menu-order', token=token), ensure_ascii=False, indent=2))

# 6. GET after delete
print('\n=== GET (after delete) ===')
print(json.dumps(api('GET', '/api/user/menu-order', token=token), ensure_ascii=False, indent=2))

# 7. Validation tests
print('\n=== VALIDATION: empty body ===')
print(json.dumps(api('POST', '/api/user/menu-order', token=token, body={}), ensure_ascii=False, indent=2))

print('\n=== VALIDATION: duplicate path ===')
print(json.dumps(api('POST', '/api/user/menu-order', token=token, body={
    'orders': [{'path': '/a', 'order': 0}, {'path': '/a', 'order': 1}]
}), ensure_ascii=False, indent=2))

print('\n=== VALIDATION: missing path ===')
print(json.dumps(api('POST', '/api/user/menu-order', token=token, body={
    'orders': [{'order': 0}]
}), ensure_ascii=False, indent=2))

print('\n=== DONE ===')
