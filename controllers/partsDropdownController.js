const pool = require('../config/db');

// Get All Parts Grouped by Category (for Dropdown)
exports.getPartsGrouped = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT part_id, part_name, part_type, quantity, location_code 
            FROM parts 
            ORDER BY part_type, part_name
        `);

        const grouped = {};
        result.rows.forEach(part => {
            if (!grouped[part.part_type]) grouped[part.part_type] = [];
            grouped[part.part_type].push(part);
        });

        res.json({ success: true, parts: grouped });
    } catch (error) {
        console.error('Get grouped parts error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
