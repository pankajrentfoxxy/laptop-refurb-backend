const pool = require('../config/db');

const logOrderStatusHistory = async (client, { orderId, fromStatus, toStatus, changedBy, notes }) => {
    await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, fromStatus, toStatus, changedBy || null, notes || null]
    );
};

// Get warehouse items (order_items with status Warehouse - Cooling Period laptops)
exports.getWarehouseItems = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                oi.item_id, oi.order_id, oi.brand, oi.processor, oi.generation, oi.ram, oi.storage, oi.preferred_model,
                oi.status as item_status, oi.inventory_id,
                i.machine_number, i.serial_number, i.stock_type,
                o.status as order_status, o.customer_id,
                c.name as customer_name, c.email as customer_email
            FROM order_items oi
            LEFT JOIN inventory i ON oi.inventory_id = i.inventory_id
            JOIN orders o ON oi.order_id = o.order_id
            JOIN customers c ON o.customer_id = c.customer_id
            WHERE oi.status = 'Warehouse'
              AND o.status != 'Cancelled'
            ORDER BY oi.item_id ASC
        `);
        res.json({ items: result.rows || [] });
    } catch (err) {
        console.error('Warehouse getItems error:', err);
        res.status(500).json({ message: 'Failed to fetch warehouse items' });
    }
};

// Mark item ready - move to QC
exports.markReady = async (req, res) => {
    const { item_id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const itemRes = await client.query(
            `SELECT oi.item_id, oi.order_id, oi.inventory_id
             FROM order_items oi
             WHERE oi.item_id = $1 AND oi.status = 'Warehouse'`,
            [item_id]
        );
        if (itemRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Warehouse item not found' });
        }
        const item = itemRes.rows[0];

        await client.query(
            `UPDATE inventory SET stock_type = 'Ready', status = 'Reserved' WHERE inventory_id = $1`,
            [item.inventory_id]
        );
        await client.query(
            `UPDATE order_items SET status = 'Assigned' WHERE item_id = $1`,
            [item_id]
        );

        const pendingWarehouse = await client.query(
            `SELECT 1 FROM order_items WHERE order_id = $1 AND status = 'Warehouse'`,
            [item.order_id]
        );
        if (pendingWarehouse.rows.length === 0) {
            const orderRes = await client.query(`SELECT status FROM orders WHERE order_id = $1`, [item.order_id]);
            const fromStatus = orderRes.rows[0]?.status || null;
            await client.query(`UPDATE orders SET status = 'QC Pending' WHERE order_id = $1`, [item.order_id]);
            await logOrderStatusHistory(client, {
                orderId: item.order_id,
                fromStatus,
                toStatus: 'QC Pending',
                changedBy: req.user.user_id,
                notes: 'Warehouse marked laptop ready, moved to QC'
            });
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Laptop marked ready, moved to QC', order_id: item.order_id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Warehouse markReady error:', err);
        res.status(500).json({ message: err.message || 'Failed to mark ready' });
    } finally {
        client.release();
    }
};

// Replace machine - swap with new machine, old goes to In Repair
exports.replaceMachine = async (req, res) => {
    const { item_id } = req.params;
    const { new_machine_number } = req.body;
    if (!new_machine_number || !String(new_machine_number).trim()) {
        return res.status(400).json({ message: 'new_machine_number is required' });
    }
    const machineNum = String(new_machine_number).trim();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const itemRes = await client.query(
            `SELECT oi.item_id, oi.order_id, oi.inventory_id, oi.brand, oi.processor, oi.ram, oi.storage
             FROM order_items oi
             WHERE oi.item_id = $1 AND oi.status = 'Warehouse'`,
            [item_id]
        );
        if (itemRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Warehouse item not found' });
        }
        const item = itemRes.rows[0];

        const newInvRes = await client.query(
            `SELECT inventory_id, machine_number, serial_number, brand, model, processor, ram, storage
             FROM inventory
             WHERE machine_number = $1
               AND status IN ('Ready', 'In Stock')
               AND stock_type IN ('Cooling Period', 'Ready')
               AND inventory_id != $2
               FOR UPDATE SKIP LOCKED`,
            [machineNum, item.inventory_id]
        );
        if (newInvRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: `Machine ${machineNum} not found or not available for assignment` });
        }
        const newInv = newInvRes.rows[0];

        const oldInvId = item.inventory_id;
        const newInvId = newInv.inventory_id;

        await client.query(
            `UPDATE inventory SET status = 'In Repair' WHERE inventory_id = $1`,
            [oldInvId]
        );
        await client.query(
            `UPDATE inventory SET status = 'Reserved' WHERE inventory_id = $1`,
            [newInvId]
        );

        await client.query(
            `UPDATE order_items 
             SET inventory_id = $1, brand = $2, processor = $3, ram = $4, storage = $5, preferred_model = $6
             WHERE item_id = $7`,
            [newInvId, newInv.brand, newInv.processor, newInv.ram, newInv.storage, newInv.model, item_id]
        );

        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Machine replaced. Old laptop marked In Repair.',
            order_id: item.order_id,
            new_machine_number: newInv.machine_number,
            new_serial_number: newInv.serial_number
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Warehouse replaceMachine error:', err);
        res.status(500).json({ message: err.message || 'Failed to replace machine' });
    } finally {
        client.release();
    }
};
