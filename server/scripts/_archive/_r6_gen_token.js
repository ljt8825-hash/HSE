const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const JWT_SECRET = 'hse_prod_jwt_7f3a9c2e8b1d4f6a0e5c7d9b2a4f8e1c3d5b7a9e1f3c5d7b9a1e3f5c7d9b2';
const payload = { id: 1, username: 'admin', role: 'admin', realName: '管理员', type: 'access' };
const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h', jwtid: crypto.randomUUID() });
console.log(token);
