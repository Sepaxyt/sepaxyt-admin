const jwt = require('jsonwebtoken');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: "https://exotic-louse-124123.upstash.io",
    token: "gQAAAAAAAeTbAAIgcDE0NjNmMmUwMTY2MWY0NmY2ODFkOThiMDYyN2Y2M2QyOA",
});

const JWT_SECRET = "sepaxyt_super_secret_jwt_key_2026";

function verifyAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    try {
        const token = authHeader.replace('Bearer ', '');
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

function generateKey() {
    const r1 = Math.floor(1000 + Math.random() * 9000);
    const r2 = Math.floor(1000 + Math.random() * 9000);
    return `SepaxYt-${r1}-${r2}`;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const admin = verifyAuth(req);
    if (!admin) {
        return res.status(401).json({ success: false, reason: 'Unauthorized' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const action = body.action || req.query.action;

        // CREATE
        if (action === 'create') {
            const { customKey, duration, deviceLimit = 1, note = '' } = body;

            let keyName = customKey;
            if (!keyName) {
                let attempts = 0;
                do {
                    keyName = generateKey();
                    attempts++;
                } while (await redis.exists(`key:${keyName}`) && attempts < 10);
            } else {
                if (!keyName.startsWith('SepaxYt-')) {
                    return res.status(200).json({ success: false, reason: 'Key must start with "SepaxYt-"' });
                }
                if (await redis.exists(`key:${keyName}`)) {
                    return res.status(200).json({ success: false, reason: 'Key already exists' });
                }
            }

            let expiry;
            if (duration === 0) {
                expiry = '2099-12-31';
            } else {
                const d = new Date();
                d.setDate(d.getDate() + parseInt(duration));
                expiry = d.toISOString().split('T')[0];
            }

            const keyData = {
                key: keyName,
                expiry,
                deviceLimit: parseInt(deviceLimit),
                note,
                createdAt: new Date().toISOString(),
                createdBy: 'SepaxYt',
                disabled: false,
            };

            await redis.set(`key:${keyName}`, JSON.stringify(keyData));
            await redis.sadd('keys:all', keyName);

            console.log(`[KEY CREATED] ${keyName}`);
            return res.status(200).json({ success: true, key: keyData });
        }

        // LIST
        if (action === 'list' || !action) {
            const allKeys = await redis.smembers('keys:all') || [];
            const keys = [];

            for (const k of allKeys) {
                const data = await redis.get(`key:${k}`);
                if (!data) continue;
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;

                const devices = await redis.hgetall(`devices:${k}`) || {};
                const stats = await redis.hgetall(`stats:${k}`) || {};

                keys.push({
                    ...parsed,
                    deviceCount: Object.keys(devices).length,
                    totalLogins: parseInt(stats.totalLogins) || 0,
                    lastLogin: stats.lastLogin || null,
                });
            }

            keys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            return res.status(200).json({ success: true, keys });
        }

        // DELETE
        if (action === 'delete') {
            const { key } = body;
            await redis.del(`key:${key}`);
            await redis.del(`devices:${key}`);
            await redis.del(`stats:${key}`);
            await redis.srem('keys:all', key);
            console.log(`[KEY DELETED] ${key}`);
            return res.status(200).json({ success: true });
        }

        // TOGGLE
        if (action === 'toggle') {
            const { key, disabled } = body;
            const data = await redis.get(`key:${key}`);
            if (!data) return res.status(200).json({ success: false, reason: 'Key not found' });

            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            parsed.disabled = disabled;
            await redis.set(`key:${key}`, JSON.stringify(parsed));
            return res.status(200).json({ success: true });
        }

        // EXTEND
        if (action === 'extend') {
            const { key, days } = body;
            const data = await redis.get(`key:${key}`);
            if (!data) return res.status(200).json({ success: false, reason: 'Key not found' });

            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            const currentExpiry = new Date(parsed.expiry);
            const now = new Date();
            const baseDate = currentExpiry > now ? currentExpiry : now;
            baseDate.setDate(baseDate.getDate() + parseInt(days));
            parsed.expiry = baseDate.toISOString().split('T')[0];

            await redis.set(`key:${key}`, JSON.stringify(parsed));
            return res.status(200).json({ success: true, key: parsed });
        }

        // RESET DEVICES
        if (action === 'resetDevices') {
            const { key } = body;
            await redis.del(`devices:${key}`);
            console.log(`[DEVICES RESET] ${key}`);
            return res.status(200).json({ success: true });
        }

        return res.status(200).json({ success: false, reason: 'Invalid action' });

    } catch (e) {
        console.error('[KEYS ERROR]', e.message);
        return res.status(200).json({ success: false, reason: e.message });
    }
};