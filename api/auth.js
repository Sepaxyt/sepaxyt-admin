const jwt = require('jsonwebtoken');

const ADMIN_PASSWORD = "ChaudharySaab";
const JWT_SECRET = "sepaxyt_super_secret_jwt_key_2026";

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, reason: 'Method not allowed' });
    }

    try {
        const { password } = req.body;

        if (!password) {
            return res.status(200).json({ success: false, reason: 'Password required' });
        }

        if (password !== ADMIN_PASSWORD) {
            console.log('[AUTH FAIL] Wrong password');
            return res.status(200).json({ success: false, reason: 'Wrong password' });
        }

        const token = jwt.sign(
            { admin: 'SepaxYt', role: 'super_admin' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log('[AUTH SUCCESS]');

        return res.status(200).json({ success: true, token });

    } catch (e) {
        return res.status(200).json({ success: false, reason: e.message });
    }
};