const pool = require('../config/db');

exports.getTechnicianPerformance = async (req, res) => {
    try {
        // Aggregate work logs
        // Users want to see: Technician Name, Team Name, Machine Number, Total Time, Count (Times Picked)
        // We group by User and Ticket

        const query = `
      SELECT 
        u.name as technician,
        t.team_name,
        tk.machine_number,
        tk.serial_number,
        COUNT(wl.log_id) as times_picked,
        SUM(EXTRACT(EPOCH FROM (COALESCE(wl.end_time, CURRENT_TIMESTAMP) - wl.start_time))) as total_seconds,
        BOOL_OR(wl.end_time IS NULL) as is_active
      FROM work_logs wl
      JOIN users u ON wl.user_id = u.user_id
      LEFT JOIN teams t ON u.team_id = t.team_id
      JOIN tickets tk ON wl.ticket_id = tk.ticket_id
      GROUP BY u.user_id, u.name, t.team_name, tk.ticket_id, tk.machine_number, tk.serial_number
      ORDER BY u.name, tk.machine_number
    `;

        const result = await pool.query(query);

        // Format the result
        const report = result.rows.map(row => ({
            technician: row.technician,
            team: row.team_name || 'Unassigned',
            machine_number: row.machine_number || row.serial_number, // Fallback to serial if machine # missing
            times_picked: parseInt(row.times_picked),
            total_duration: formatDuration(row.total_seconds),
            status: row.is_active ? 'Active' : 'Completed'
        }));

        res.json({
            success: true,
            report
        });
    } catch (error) {
        console.error('Report error:', error);
        res.status(500).json({ success: false, message: 'Server error generating report' });
    }
};

function formatDuration(seconds) {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}
