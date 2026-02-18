const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const pool = require('../config/db');

const csvPath = process.argv[2];

if (!csvPath) {
    console.error('Usage: node scripts/importLaptopCatalog.js "<csv_path>"');
    process.exit(1);
}

const resolvedPath = path.resolve(csvPath);
if (!fs.existsSync(resolvedPath)) {
    console.error(`CSV file not found: ${resolvedPath}`);
    process.exit(1);
}

const pick = (row, keys) => {
    for (const k of keys) {
        const val = row[k];
        if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
    }
    return '';
};

async function ensureTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS laptop_catalog (
            catalog_id SERIAL PRIMARY KEY,
            brand VARCHAR(100) NOT NULL,
            model VARCHAR(120),
            processor VARCHAR(120),
            generation VARCHAR(80),
            ram VARCHAR(50),
            storage VARCHAR(50),
            device_type VARCHAR(50) DEFAULT 'Laptop',
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_laptop_catalog UNIQUE (brand, model, processor, generation, ram, storage, device_type)
        );
    `);
}

async function run() {
    await ensureTable();

    const rows = [];
    await new Promise((resolve, reject) => {
        fs.createReadStream(resolvedPath)
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', resolve)
            .on('error', reject);
    });

    let failed = 0;
    let processed = 0;
    const payload = [];

    for (const row of rows) {
        const brand = pick(row, ['brand', 'Brand']);
        const model = pick(row, ['model', 'Model', 'preferred_model', 'Preferred Model']);
        const processor = pick(row, ['processor', 'Processor']);
        const generation = pick(row, ['generation', 'Generation', 'gen', 'Gen']);
        const ram = pick(row, ['ram', 'RAM']);
        const storage = pick(row, ['storage', 'Storage']);
        const deviceType = pick(row, ['device_type', 'Device Type', 'device']) || 'Laptop';

        if (!brand) {
            failed++;
            continue;
        }

        payload.push([brand, model || null, processor || null, generation || null, ram || null, storage || null, deviceType]);
    }

    const chunkSize = 500;
    for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const values = [];
        const placeholders = chunk.map((row, rIdx) => {
            const base = rIdx * 7;
            values.push(...row);
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, true)`;
        }).join(', ');
        try {
            await pool.query(
                `INSERT INTO laptop_catalog (brand, model, processor, generation, ram, storage, device_type, active)
                 VALUES ${placeholders}
                 ON CONFLICT (brand, model, processor, generation, ram, storage, device_type)
                 DO UPDATE SET active = true, updated_at = CURRENT_TIMESTAMP`,
                values
            );
            processed += chunk.length;
        } catch (_e) {
            failed += chunk.length;
        }
    }

    console.log(JSON.stringify({ totalRows: rows.length, validRows: payload.length, processed, failed }));
}

run()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
