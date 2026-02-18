const pool = require('../config/db');

// Get All Parts
exports.getAllParts = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM parts ORDER BY part_name ASC'
    );

    res.json({
      success: true,
      count: result.rows.length,
      parts: result.rows
    });
  } catch (error) {
    console.error('Get parts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching parts'
    });
  }
};

// Create Part
exports.createPart = async (req, res) => {
  const { part_name, part_type, quantity, vendor, cost, location_code } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO parts (part_name, part_type, quantity, vendor, cost, location_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [part_name, part_type, quantity || 0, vendor, cost || 0, location_code]
    );

    res.status(201).json({
      success: true,
      message: 'Part created successfully',
      part: result.rows[0]
    });
  } catch (error) {
    console.error('Create part error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating part'
    });
  }
};

// Update Part Details (Name, Location, Cost, etc.)
exports.updatePart = async (req, res) => {
  const { id } = req.params;
  const { part_name, part_type, vendor, cost, location_code } = req.body;

  try {
    const result = await pool.query(
      `UPDATE parts 
       SET part_name = COALESCE($1, part_name),
           part_type = COALESCE($2, part_type),
           vendor = COALESCE($3, vendor),
           cost = COALESCE($4, cost),
           location_code = COALESCE($5, location_code)
       WHERE part_id = $6
       RETURNING *`,
      [part_name, part_type, vendor, cost, location_code, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Part not found' });
    }

    res.json({
      success: true,
      message: 'Part updated successfully',
      part: result.rows[0]
    });
  } catch (error) {
    console.error('Update part error:', error);
    res.status(500).json({ success: false, message: 'Server error updating part' });
  }
};

// Update Part Quantity (Restock or Consume)
exports.updatePartQuantity = async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body; // Can be positive (add) or negative (consume)

  try {
    const result = await pool.query(
      `UPDATE parts SET quantity = quantity + $1 WHERE part_id = $2 RETURNING *`,
      [quantity, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Part not found'
      });
    }

    res.json({
      success: true,
      message: 'Part quantity updated successfully',
      part: result.rows[0]
    });
  } catch (error) {
    console.error('Update part error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating part'
    });
  }
};
