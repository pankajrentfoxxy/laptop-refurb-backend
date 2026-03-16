# ERP Inventory Sync – How It Works & Where Wrong Details Come From

## Data Flow

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  QC Passed API          │     │  Purchase Order API       │
│  /qc-orders/passed     │     │  /purchase-order-list    │
└───────────┬─────────────┘     └────────────┬─────────────┘
            │                                │
            │  machine_number, serial_number │  product_details[],
            │  product_id, po_id             │  assets_details
            │                                │
            └──────────────┬─────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │  buildPurchaseOrderMap()     │
            │  Map PO by: id, qc_order_id, │
            │  purchase_order_id, order_id  │
            └──────────────┬─────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │  For each QC record:         │
            │  purchaseDetails = map.get(  │
            │    poId || qcRecord.id       │
            │  )                           │
            └──────────────┬─────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │  resolvePurchaseDetailsForQc │
            │  Find matching product in    │
            │  purchaseDetails.product_details
            └──────────────┬─────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │  Match order:               │
            │  1. product_id match        │
            │  2. machine_number match    │
            │  3. FALLBACK: products[0]   │  ← WRONG for multi-laptop orders!
            │  4. FALLBACK: {}            │
            └──────────────┬──────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │  Merge: purchaseRecord +     │
            │  assets_details + matchedProduct
            │  + qcRecord (overrides)      │
            └──────────────┬─────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │  upsertInventoryFromErpRecord│
            │  Save to CRM inventory       │
            │  (machine_number, serial from QC)
            │  (brand, model, etc from merge)
            └──────────────────────────────┘
```

## Where Wrong Details Come From

### 1. **Wrong Purchase Order matched**
- **buildPurchaseOrderMap** indexes by multiple IDs: `id`, `qc_order_id`, `purchase_order_id`, `order_id`
- If IDs overlap across different orders, the first match wins
- **Fix:** Prefer `po_id` / `purchase_order_id` from QC record; avoid matching by generic `id` when it can collide

### 2. **products[0] fallback (multi-laptop orders)**
- When `product_id` and `machine_number` don’t match any product, code uses `products[0]`
- For orders with multiple laptops, this always picks the first product
- **Result:** Laptop 2, 3, … get specs of Laptop 1
- **Fix:** Remove or restrict the `products.length === 1` fallback; only use it when there is exactly one product

### 3. **ID / field name mismatches**
- QC: `product_id`, `product_details_id`
- PO product: `id`, `product_id`, `product_details_id`, `item_id`
- ERP may use different field names or ID types
- **Fix:** Add more ID fields and normalize before comparing

### 4. **Machine number format mismatch**
- QC: `unique_product_serial`, `machine_number`, `machineNumber`
- PO product: `unique_product_serial`, `machine_number`, `machineNumber`, `serial_number`, `serialNumber`
- Formats can differ (e.g. `TTSPL-123` vs `TTSPL123`)
- **Fix:** Normalize (trim, uppercase, remove separators) before matching

### 5. **assets_details vs product_details**
- `assets_details` is PO-level (one per order)
- For multi-laptop orders, it may not be per-laptop
- **Fix:** Prefer product-level fields; use `assets_details` only when product-level data is missing

## Trace a Specific Machine

```
GET /api/inventory/trace/:machineNumber
```

Returns QC record, matched PO, and merged details for that machine number.
