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
        const key = req.query.key;
        if (!key) return res.status(200).json({ success: false, reason: 'Key required' });

        const devices = await redis.hgetall(`devices:${key}`) || {};
        const deviceList = Object.entries(devices).map(([uuid, info]) => {
            const parsed = typeof info === 'string' ? JSON.parse(info) : info;
            return {
                uuid,
                firstLogin: parsed.firstLogin,
                lastLogin: parsed.lastLogin,
                ip: parsed.ip,
            };
        });

        return res.status(200).json({ success: true, devices: deviceList });

    } catch (e) {
        return res.status(200).json({ success: false, reason: e.message });
    }
};