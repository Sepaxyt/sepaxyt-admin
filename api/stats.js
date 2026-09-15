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
        return jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    } catch (e) { return null; }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const admin = verifyAuth(req);
    if (!admin) return res.status(401).json({ success: false, reason: 'Unauthorized' });

    try {
        const allKeys = await redis.smembers('keys:all') || [];
        const now = new Date();

        let active = 0, expired = 0, disabled = 0, lifetime = 0;
        let singleDevice = 0, multiDevice = 0, totalDevices = 0;

        for (const k of allKeys) {
            const data = await redis.get(`key:${k}`);
            if (!data) continue;
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;

            if (parsed.disabled) { disabled++; continue; }

            if (parsed.expiry === '2099-12-31') { lifetime++; active++; }
            else if (new Date(parsed.expiry) < now) expired++;
            else active++;

            if (parsed.deviceLimit === 1) singleDevice++;
            else multiDevice++;

            const devices = await redis.hgetall(`devices:${k}`) || {};
            totalDevices += Object.keys(devices).length;
        }

        return res.status(200).json({
            success: true,
            stats: {
                total: allKeys.length,
                active, expired, disabled, lifetime,
                singleDevice, multiDevice, totalDevices,
            }
        });

    } catch (e) {
        return res.status(200).json({ success: false, reason: e.message });
    }
};