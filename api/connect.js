const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: "https://exotic-louse-124123.upstash.io",
    token: "gQAAAAAAAeTbAAIgcDE0NjNmMmUwMTY2MWY0NmY2ODFkOThiMDYyN2Y2M2QyOA",
});

const LICENSE_SECRET = "Vm8Lk7Uj2JmsjCPVPVjrLa7zgfx3uz9E";

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ status: false, reason: 'Method not allowed' });
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            body = Object.fromEntries(new URLSearchParams(body));
        }

        const game     = body.game;
        const user_key = body.user_key;
        const serial   = body.serial;

        console.log(`[LOGIN] game=${game} | key=${user_key} | serial=${serial}`);

        if (!game || !user_key || !serial) {
            return res.status(200).json({ status: false, reason: 'Missing required fields' });
        }

        const keyData = await redis.get(`key:${user_key}`);
        if (!keyData) {
            console.log(`[FAIL] Key not found: ${user_key}`);
            return res.status(200).json({ status: false, reason: 'Invalid key' });
        }

        const key = typeof keyData === 'string' ? JSON.parse(keyData) : keyData;

        if (new Date(key.expiry) < new Date()) {
            console.log(`[FAIL] Key expired: ${user_key}`);
            return res.status(200).json({ status: false, reason: 'Key expired' });
        }

        if (key.disabled === true) {
            return res.status(200).json({ status: false, reason: 'Key disabled' });
        }

        const deviceKey = `devices:${user_key}`;
        const devices = await redis.hgetall(deviceKey) || {};
        const existingDevices = Object.keys(devices);
        const deviceAlreadyAdded = existingDevices.includes(serial);

        if (!deviceAlreadyAdded) {
            if (existingDevices.length >= key.deviceLimit) {
                return res.status(200).json({
                    status: false,
                    reason: `Device limit reached (${key.deviceLimit}). Contact admin.`
                });
            }

            await redis.hset(deviceKey, {
                [serial]: JSON.stringify({
                    firstLogin: new Date().toISOString(),
                    lastLogin: new Date().toISOString(),
                    ip: req.headers['x-forwarded-for'] || 'unknown',
                })
            });
        } else {
            const deviceInfo = typeof devices[serial] === 'string' 
                ? JSON.parse(devices[serial]) 
                : devices[serial];
            deviceInfo.lastLogin = new Date().toISOString();
            await redis.hset(deviceKey, { [serial]: JSON.stringify(deviceInfo) });
        }

        const statsKey = `stats:${user_key}`;
        await redis.hincrby(statsKey, 'totalLogins', 1);
        await redis.hset(statsKey, { lastLogin: new Date().toISOString() });

        const auth = `${game}-${user_key}-${serial}-${LICENSE_SECRET}`;
        const token = crypto.createHash('md5').update(auth).digest('hex');
        const rng = Math.floor(Date.now() / 1000);

        console.log(`[SUCCESS] key=${user_key}`);

        return res.status(200).json({
            status: true,
            data: { token, rng, EXP: key.expiry }
        });

    } catch (e) {
        console.error('[ERROR]', e.message);
        return res.status(200).json({ status: false, reason: 'Server error: ' + e.message });
    }
};
