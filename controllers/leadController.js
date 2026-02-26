const fs = require('fs');
const csv = require('csv-parser');
const crypto = require('crypto');
const prisma = require('../prisma/client');
const pool = require('../config/db');
const { ensureResearch } = require('../services/leadResearchService');
const { getNextAutoAssignee, updateAutoAssignConfig } = require('../services/leadAutoAssignService');

const LEAD_STATUSES = ['Pending', 'Cold', 'Warm', 'Hot', 'Gone', 'Hold', 'Rejected', 'Call Back', 'Deal'];

const normalizeEmail = (value) => (value || '').trim().toLowerCase();
const normalizePhone = (value) => (value || '').replace(/\s+/g, '');
const isLikelyCompanyDomain = (value) => !!value && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
const getDomainFromEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return null;
  return normalized.split('@')[1] || null;
};
const canEditLead = (user, lead) => {
  if (!user || !lead) return false;
  if (['admin', 'manager'].includes(user.role)) return true;
  if (user.role === 'sales') return lead.assignedUserId === user.user_id;
  return false;
};

const pickField = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
};

const normalizeRowKeys = (row) => {
  const normalized = {};
  Object.keys(row || {}).forEach((key) => {
    const cleanKey = String(key)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    normalized[cleanKey] = row[key];
  });
  return normalized;
};

const buildLeadPayload = (row) => {
  const normalizedRow = normalizeRowKeys(row);
  const name = pickField(row, ['name', 'contact_name', 'lead_name', 'company_name']);
  const companyName = pickField(row, ['company_name', 'company', 'business_name']);
  const email = normalizeEmail(pickField(row, ['email', 'email_id', 'work_email']));
  const phone = normalizePhone(pickField(row, ['phone', 'phone_number', 'mobile', 'mobile_number']));
  const source = pickField(row, ['source', 'lead_source']);
  const city = pickField(row, ['city', 'town', 'location']);

  const normalizedName = pickField(normalizedRow, ['name', 'contact_name', 'lead_name', 'company_name', 'company']);
  const normalizedCompany = pickField(normalizedRow, ['company_name', 'company', 'business_name']);
  const normalizedEmail = normalizeEmail(pickField(normalizedRow, ['email', 'email_id', 'work_email']));
  const normalizedPhone = normalizePhone(pickField(normalizedRow, ['phone', 'phone_number', 'mobile', 'mobile_number']));
  const normalizedSource = pickField(normalizedRow, ['source', 'lead_source']);
  const normalizedCity = pickField(normalizedRow, ['city', 'town', 'location']);

  return {
    name: normalizedName || name || normalizedCompany || companyName || 'Unknown',
    brand: pickField(normalizedRow, ['brand']) || pickField(row, ['brand']) || null,
    companyName: normalizedCompany || companyName || null,
    email: normalizedEmail || email || null,
    phone: normalizedPhone || phone || null,
    city: normalizedCity || city || null,
    source: normalizedSource || source || null
  };
};

const formatHeadOfficeAddress = (research) => {
  const chunks = [
    research?.address,
    research?.city,
    research?.state
  ].map((v) => (v || '').trim()).filter(Boolean);
  return chunks.join(', ');
};

const ensureCustomerFromLead = async (leadId) => {
  const leadRes = await pool.query(
    `SELECT l.lead_id, l.name, l.brand, l.company_name, l.email, l.phone, r.gst, r.address, r.city, r.state, r.pincode
     FROM leads l
     LEFT JOIN lead_company_research r ON r.lead_id = l.lead_id
     WHERE l.lead_id = $1`,
    [leadId]
  );
  if (!leadRes.rows.length) return null;
  const lead = leadRes.rows[0];
  const headOffice = formatHeadOfficeAddress(lead) || null;

  const customerUpsert = await pool.query(
    `INSERT INTO customers (name, company_name, source_lead_id, email, phone, gst_no, address, type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Lead', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (source_lead_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       company_name = EXCLUDED.company_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       gst_no = EXCLUDED.gst_no,
       address = EXCLUDED.address,
       updated_at = CURRENT_TIMESTAMP
     RETURNING customer_id`,
    [
      lead.name || lead.company_name || 'Lead Customer',
      lead.company_name || null,
      lead.lead_id,
      lead.email || null,
      lead.phone || null,
      lead.gst || null,
      headOffice
    ]
  );
  const customerId = customerUpsert.rows[0].customer_id;

  if (headOffice) {
    await pool.query(
      `INSERT INTO customer_addresses (customer_id, concern_person, mobile_no, address, pincode, is_head_office, address_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, 'Billing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (customer_id, is_head_office)
       WHERE is_head_office = true
       DO UPDATE SET
         concern_person = EXCLUDED.concern_person,
         mobile_no = EXCLUDED.mobile_no,
         address = EXCLUDED.address,
         pincode = EXCLUDED.pincode,
         address_type = EXCLUDED.address_type,
         updated_at = CURRENT_TIMESTAMP`,
      [customerId, lead.name || null, lead.phone || null, headOffice, lead.pincode || null]
    );
  }

  await pool.query(
    `INSERT INTO customer_addresses (customer_id, concern_person, mobile_no, address, pincode, is_head_office, address_type, source_lead_address_id, created_at, updated_at)
     SELECT $1, la.concern_person, la.mobile_no, la.address, la.pincode, false, COALESCE(la.address_type, 'Shipping'), la.address_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     FROM lead_addresses la
     WHERE la.lead_id = $2
     ON CONFLICT (source_lead_address_id) DO NOTHING`,
    [customerId, leadId]
  );

  return customerId;
};

const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const distributeAssignments = (leadIds, userIds) => {
  if (!leadIds.length || !userIds.length) return [];
  const randomizedUsers = shuffle(userIds);
  return leadIds.map((leadId, index) => ({
    leadId,
    assignedTo: randomizedUsers[index % randomizedUsers.length]
  }));
};

const normalizeArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

exports.getLeads = async (req, res) => {
  const { status, assigned_to, source, date_from, date_to, search, include_duplicates } = req.query;

  try {
    const andConditions = [];

    if (!include_duplicates || include_duplicates === 'false') {
      andConditions.push({ isDuplicate: false });
    }
    if (status) {
      const statusList = Array.isArray(status) ? status : String(status).split(',').map((s) => s.trim()).filter(Boolean);
      if (statusList.length > 0) {
        andConditions.push({ status: { in: statusList } });
      }
    }
    if (source) andConditions.push({ source });

    if (req.user.role === 'sales') {
      andConditions.push({ assignedUserId: req.user.user_id });
    } else if (assigned_to) {
      if (assigned_to === 'unassigned') {
        andConditions.push({ assignedUserId: null });
      } else {
        const uid = parseInt(assigned_to, 10);
        if (!isNaN(uid)) andConditions.push({ assignedUserId: uid });
      }
    }

    if (date_from || date_to) {
      const createdAtFilter = {};
      if (date_from) createdAtFilter.gte = new Date(date_from + 'T00:00:00.000Z');
      if (date_to) createdAtFilter.lte = new Date(date_to + 'T23:59:59.999Z');
      andConditions.push({ createdAt: createdAtFilter });
    }

    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { city: { contains: search, mode: 'insensitive' } }
        ]
      });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedUser: { select: { userId: true, name: true, role: true } },
        research: true
      }
    });

    res.json({ success: true, count: leads.length, leads });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching leads' });
  }
};

exports.getLeadById = async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await prisma.lead.findUnique({
      where: { leadId: parseInt(id, 10) },
      include: {
        assignedUser: { select: { userId: true, name: true, role: true } },
        research: true,
        activities: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { userId: true, name: true } }
          }
        },
        assignments: { orderBy: { assignedAt: 'desc' } },
        orders: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (req.user.role === 'sales' && lead.assignedUserId !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const addressRes = await pool.query(
      `SELECT address_id, concern_person, mobile_no, address, pincode, address_type, created_at
       FROM lead_addresses
       WHERE lead_id = $1
       ORDER BY created_at DESC`,
      [lead.leadId]
    );
    lead.addresses = addressRes.rows;

    const remarksRes = await pool.query(
      `SELECT r.remark_id, r.lead_id, r.user_id, r.note, r.created_at, u.name as user_name
       FROM lead_remarks r
       LEFT JOIN users u ON r.user_id = u.user_id
       WHERE r.lead_id = $1
       ORDER BY r.created_at DESC`,
      [lead.leadId]
    );
    lead.remarks = remarksRes.rows.map((row) => ({
      remarkId: row.remark_id,
      leadId: row.lead_id,
      userId: row.user_id,
      note: row.note,
      createdAt: row.created_at,
      userName: row.user_name
    }));

    // Exclude email_reingested from activities (only show post-ingestion activity)
    lead.activities = (lead.activities || []).filter(
      (a) => a.action !== 'email_reingested'
    );

    res.json({ success: true, lead });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching lead' });
  }
};

exports.createLead = async (req, res) => {
  const payload = buildLeadPayload(req.body || {});

  if (!payload.phone || !String(payload.phone).trim()) {
    return res.status(400).json({ success: false, message: 'Phone is required' });
  }

  try {
    let duplicateOf = null;
    if (payload.email && payload.phone) {
      const existing = await prisma.lead.findFirst({
        where: { email: payload.email, phone: payload.phone, isDuplicate: false }
      });
      if (existing) duplicateOf = existing.leadId;
    }

    const hasSalesAccess = Array.isArray(req.user.permissions) && req.user.permissions.includes('sales_access');
    const isSalesOperator = req.user.role === 'sales' || (!['admin', 'manager'].includes(req.user.role) && hasSalesAccess);

    let assignData = {};
    if (isSalesOperator) {
      assignData = { assignedUserId: req.user.user_id, assignedById: req.user.user_id, assignedAt: new Date() };
    } else {
      const autoAssignee = await getNextAutoAssignee();
      if (autoAssignee) {
        assignData = { assignedUserId: autoAssignee, assignedById: req.user.user_id, assignedAt: new Date() };
      }
    }

    const lead = await prisma.lead.create({
      data: {
        ...payload,
        brand: payload.brand,
        status: 'Pending',
        createdAt: new Date(),
        ...assignData,
        isDuplicate: !!duplicateOf,
        duplicateOf: duplicateOf || null
      }
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.leadId,
        userId: req.user.user_id,
        action: 'lead_created',
        notes: 'Lead created'
      }
    });

    // Trigger research in background (don't block response)
    ensureResearch(lead).catch((err) => console.error('Lead research error:', err));

    res.status(201).json({ success: true, lead });
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ success: false, message: 'Server error creating lead' });
  }
};

exports.uploadLeadsCsv = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const rows = [];
  const errors = [];
  let created = 0;
  let duplicates = 0;

  const firstLine = fs.readFileSync(req.file.path, 'utf8').split(/\r?\n/)[0] || '';
  const separator = firstLine.includes('\t') ? '\t' : ',';

  fs.createReadStream(req.file.path)
    .pipe(csv({ separator }))
    .on('data', (row) => rows.push(row))
    .on('error', (err) => {
      console.error('CSV parse error:', err);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Invalid CSV format' });
    })
    .on('end', async () => {
      fs.unlinkSync(req.file.path);

      for (const row of rows) {
        try {
          const payload = buildLeadPayload(row);
          if (!payload.name) {
            errors.push({ row, message: 'Missing name or company' });
            continue;
          }

          let duplicateOf = null;
          if (payload.email && payload.phone) {
            const existing = await prisma.lead.findFirst({
              where: { email: payload.email, phone: payload.phone, isDuplicate: false }
            });
            if (existing) duplicateOf = existing.leadId;
          }

          const autoAssignee = await getNextAutoAssignee();
          const assignData = autoAssignee
            ? { assignedUserId: autoAssignee, assignedById: req.user.user_id, assignedAt: new Date() }
            : {};

          const createdLead = await prisma.lead.create({
            data: {
              ...payload,
              status: 'Pending',
              createdAt: new Date(),
              isDuplicate: !!duplicateOf,
              duplicateOf: duplicateOf || null,
              ...assignData
            }
          });

          if (duplicateOf) duplicates += 1;
          created += 1;

          // Trigger research in background
          ensureResearch(createdLead).catch((err) => console.error('Lead research error:', err));
        } catch (error) {
          errors.push({ row, message: error.message });
        }
      }

      res.json({
        success: true,
        message: `Processed ${rows.length} rows. Created: ${created}. Duplicates: ${duplicates}. Errors: ${errors.length}.`,
        errors: errors.length ? errors : undefined
      });
    });
};

exports.getSampleCsv = async (req, res) => {
  const header = 'name,company_name,email,phone,city,source';
  const sample = [
    'Amit Sharma,Rentfoxxy India,amit@rentfoxxy.com,9876543210,Bengaluru,LinkedIn',
    'Neha Verma,TechNova Pvt Ltd,neha@technova.com,9123456780,Mumbai,Website'
  ];
  const csvContent = [header, ...sample].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="lead_sample.csv"');
  res.send(csvContent);
};

exports.assignLeads = async (req, res) => {
  const { lead_ids, sales_user_id, sales_user_ids, assign_unassigned_only } = req.body;

  try {
    let targetLeadIds = [];
    if (assign_unassigned_only) {
      const unassigned = await prisma.lead.findMany({
        where: { assignedUserId: null },
        select: { leadId: true },
        orderBy: { createdAt: 'asc' }
      });
      targetLeadIds = unassigned.map((l) => l.leadId);
    } else if (Array.isArray(lead_ids) && lead_ids.length > 0) {
      targetLeadIds = lead_ids.map((id) => parseInt(id, 10)).filter(Number.isFinite);
    }

    if (!targetLeadIds.length) {
      return res.status(400).json({ success: false, message: 'No leads available for assignment' });
    }

    const requestedUserIds = Array.isArray(sales_user_ids) && sales_user_ids.length > 0
      ? sales_user_ids.map((id) => parseInt(id, 10)).filter(Number.isFinite)
      : (sales_user_id ? [parseInt(sales_user_id, 10)] : []);

    if (!requestedUserIds.length) {
      return res.status(400).json({ success: false, message: 'At least one sales user is required' });
    }

    const eligibleUsers = await prisma.user.findMany({
      where: {
        userId: { in: requestedUserIds },
        role: 'sales'
      },
      select: { userId: true }
    });
    const eligibleUserIds = eligibleUsers.map((u) => u.userId);
    if (!eligibleUserIds.length) {
      return res.status(400).json({ success: false, message: 'No valid sales users selected' });
    }

    const assignmentPlan = distributeAssignments(targetLeadIds, eligibleUserIds);
    const batchId = crypto.randomUUID();
    const now = new Date();

    await prisma.$transaction(assignmentPlan.map(({ leadId, assignedTo }) =>
      prisma.lead.update({
        where: { leadId },
        data: {
          assignedUserId: assignedTo,
          assignedById: req.user.user_id,
          assignedAt: now
        }
      })
    ));

    await prisma.leadAssignment.createMany({
      data: assignmentPlan.map(({ leadId, assignedTo }) => ({
        leadId,
        assignedTo,
        assignedBy: req.user.user_id,
        assignedAt: now,
        batchId
      }))
    });

    if (assign_unassigned_only && eligibleUserIds.length) {
      await updateAutoAssignConfig(eligibleUserIds, req.user.user_id);
    }

    const leads = await prisma.lead.findMany({
      where: { leadId: { in: targetLeadIds } }
    });

    for (const lead of leads) {
      await ensureResearch(lead);
    }

    const distribution = assignmentPlan.reduce((acc, item) => {
      acc[item.assignedTo] = (acc[item.assignedTo] || 0) + 1;
      return acc;
    }, {});

    const msg = assign_unassigned_only
      ? `${assignmentPlan.length} unassigned leads distributed. Future leads (manual, upload, email) will also be auto-assigned to the selected users.`
      : 'Leads assigned successfully';

    res.json({
      success: true,
      message: msg,
      batch_id: batchId,
      total_assigned: assignmentPlan.length,
      distribution
    });
  } catch (error) {
    console.error('Assign leads error:', error);
    res.status(500).json({ success: false, message: 'Server error assigning leads' });
  }
};

exports.updateLeadStatus = async (req, res) => {
  const { id } = req.params;
  const { status, rejection_reason, notes, brand, processor, generation, ram, storage } = req.body;

  if (!LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid lead status' });
  }
  if (status === 'Rejected' && !rejection_reason) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required' });
  }

  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (req.user.role === 'sales' && lead.assignedUserId !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const configData = {};
    if (brand !== undefined) configData.brand = String(brand || '').trim() || null;
    if (processor !== undefined) configData.processor = String(processor || '').trim() || null;
    if (generation !== undefined) configData.generation = String(generation || '').trim() || null;
    if (ram !== undefined) configData.ram = String(ram || '').trim() || null;
    if (storage !== undefined) configData.storage = String(storage || '').trim() || null;

    const updated = await prisma.lead.update({
      where: { leadId: lead.leadId },
      data: {
        status,
        rejectionReason: status === 'Rejected' ? rejection_reason : null,
        ...configData
      }
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.leadId,
        userId: req.user.user_id,
        action: 'status_updated',
        statusFrom: lead.status,
        statusTo: status,
        notes: notes || rejection_reason || null
      }
    });

    if (status === 'Deal') {
      await ensureCustomerFromLead(lead.leadId);
    }

    res.json({ success: true, lead: updated });
  } catch (error) {
    console.error('Update lead status error:', error);
    res.status(500).json({ success: false, message: 'Server error updating status' });
  }
};

exports.updateFollowUp = async (req, res) => {
  const { id } = req.params;
  const { follow_up_date, notes } = req.body;

  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedUserId !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const updated = await prisma.lead.update({
      where: { leadId: parseInt(id, 10) },
      data: { followUpDate: follow_up_date ? new Date(follow_up_date) : null }
    });

    await prisma.leadActivity.create({
      data: {
        leadId: updated.leadId,
        userId: req.user.user_id,
        action: 'follow_up_set',
        notes: notes || `Follow-up set to ${follow_up_date}`
      }
    });

    res.json({ success: true, lead: updated });
  } catch (error) {
    console.error('Update follow-up error:', error);
    res.status(500).json({ success: false, message: 'Server error updating follow-up' });
  }
};

exports.getFollowUps = async (req, res) => {
  try {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const baseWhere = req.user.role === 'sales'
      ? { assignedUserId: req.user.user_id }
      : {};

    const overdue = await prisma.lead.findMany({
      where: {
        ...baseWhere,
        followUpDate: { lt: now },
        status: { notIn: ['Rejected', 'Gone'] }
      },
      orderBy: { followUpDate: 'asc' },
      include: { assignedUser: { select: { userId: true, name: true } } }
    });

    const todayLeads = await prisma.lead.findMany({
      where: {
        ...baseWhere,
        followUpDate: { gte: now, lte: endOfDay },
        status: { notIn: ['Rejected', 'Gone'] }
      },
      orderBy: { followUpDate: 'asc' },
      include: { assignedUser: { select: { userId: true, name: true } } }
    });

    res.json({ success: true, today: todayLeads, overdue });
  } catch (error) {
    console.error('Follow-up error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching follow-ups' });
  }
};

exports.runResearch = async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedUserId !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Force refresh so API re-searches and updates all research fields
    await ensureResearch(lead, { force: true });
    const research = await prisma.leadCompanyResearch.findUnique({ where: { leadId: lead.leadId } });

    res.json({ success: true, research });
  } catch (error) {
    console.error('Research error:', error);
    res.status(500).json({ success: false, message: 'Server error running research' });
  }
};

exports.updateResearchDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (req.user.role === 'sales' && lead.assignedUserId !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const existing = await prisma.leadCompanyResearch.findUnique({
      where: { leadId: lead.leadId }
    });
    const existingRaw = (existing?.rawResponse && typeof existing.rawResponse === 'object') ? existing.rawResponse : {};

    const payload = {
      industry: req.body.industry ?? existing?.industry ?? null,
      pincode: req.body.pincode ?? existingRaw.pincode ?? null,
      cin: req.body.cin ?? existing?.cin ?? null,
      entityType: req.body.entity_type ?? req.body.entityType ?? existing?.entityType ?? null,
      roc: req.body.roc ?? existing?.roc ?? null,
      revenue: req.body.revenue ?? req.body.annual_revenue ?? existing?.revenue ?? null,
      employees: req.body.employees ?? existing?.employees ?? null,
      gst: req.body.gst ?? existing?.gst ?? null,
      address: req.body.address ?? existing?.address ?? null,
      city: req.body.city ?? existing?.city ?? null,
      state: req.body.state ?? existing?.state ?? null
    };

    const mergedRaw = {
      ...existingRaw,
      ...(req.body || {}),
      departments: normalizeArrayField(req.body.departments ?? existingRaw.departments),
      technologies: normalizeArrayField(req.body.technologies ?? existingRaw.technologies)
    };

    const research = await prisma.leadCompanyResearch.upsert({
      where: { leadId: lead.leadId },
      create: {
        leadId: lead.leadId,
        ...payload,
        rawResponse: mergedRaw
      },
      update: {
        ...payload,
        rawResponse: mergedRaw
      }
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.leadId,
        userId: req.user.user_id,
        action: 'research_updated',
        notes: 'Company research details updated manually'
      }
    });

    res.json({ success: true, research });
  } catch (error) {
    console.error('Update research details error:', error);
    res.status(500).json({ success: false, message: 'Server error updating company research' });
  }
};

exports.createLeadOrder = async (req, res) => {
  const { id } = req.params;
  const { amount, details, order_status } = req.body;

  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

    if (lead.status !== 'Deal') {
      return res.status(400).json({ success: false, message: 'Order can be created only for Deal status' });
    }
    if (req.user.role === 'sales' && lead.assignedUserId !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const order = await prisma.leadOrder.create({
      data: {
        leadId: lead.leadId,
        amount: amount || 0,
        orderStatus: order_status || 'New',
        details: details || null,
        createdBy: req.user.user_id
      }
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.leadId,
        userId: req.user.user_id,
        action: 'order_created',
        notes: `Order ${order.leadOrderId} created`
      }
    });

    res.json({ success: true, order });
  } catch (error) {
    console.error('Create lead order error:', error);
    res.status(500).json({ success: false, message: 'Server error creating order' });
  }
};

exports.updateLeadBasicDetails = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    brand,
    processor,
    generation,
    ram,
    storage,
    company_name,
    companyName,
    email,
    phone,
    city
  } = req.body || {};

  try {
    const leadId = parseInt(id, 10);
    const existing = await prisma.lead.findUnique({ where: { leadId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (!canEditLead(req.user, existing)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    const normalizedCity = city !== undefined ? String(city || '').trim() : undefined;
    const normalizedBrand = brand !== undefined ? String(brand || '').trim() : undefined;
    const normalizedProcessor = processor !== undefined ? String(processor || '').trim() : undefined;
    const normalizedGeneration = generation !== undefined ? String(generation || '').trim() : undefined;
    const normalizedRam = ram !== undefined ? String(ram || '').trim() : undefined;
    const normalizedStorage = storage !== undefined ? String(storage || '').trim() : undefined;
    const nextCompanyName = (company_name ?? companyName ?? existing.companyName ?? null);

    const updated = await prisma.lead.update({
      where: { leadId },
      data: {
        name: (name ?? existing.name)?.trim() || existing.name,
        brand: normalizedBrand !== undefined ? (normalizedBrand || null) : existing.brand,
        processor: normalizedProcessor !== undefined ? (normalizedProcessor || null) : existing.processor,
        generation: normalizedGeneration !== undefined ? (normalizedGeneration || null) : existing.generation,
        ram: normalizedRam !== undefined ? (normalizedRam || null) : existing.ram,
        storage: normalizedStorage !== undefined ? (normalizedStorage || null) : existing.storage,
        companyName: nextCompanyName,
        email: normalizedEmail || null,
        phone: normalizedPhone || null,
        city: normalizedCity !== undefined ? (normalizedCity || null) : existing.city
      }
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: req.user.user_id,
        action: 'lead_basic_updated',
        notes: 'Admin updated lead basic details'
      }
    });

    const companyChanged = (existing.companyName || null) !== (nextCompanyName || null);
    const brandChanged = (existing.brand || null) !== (normalizedBrand !== undefined ? (normalizedBrand || null) : (existing.brand || null));
    if (companyChanged || brandChanged) {
      await ensureResearch(updated, { force: true });
      await prisma.leadActivity.create({
        data: {
          leadId,
          userId: req.user.user_id,
          action: 'research_refreshed',
          notes: `Research auto-refreshed after ${companyChanged ? 'company' : ''}${companyChanged && brandChanged ? ' and ' : ''}${brandChanged ? 'brand' : ''} update`
        }
      });
    }

    res.json({ success: true, lead: updated });
  } catch (error) {
    console.error('Update lead basic details error:', error);
    res.status(500).json({ success: false, message: 'Server error updating lead details' });
  }
};

exports.getLeadAddresses = async (req, res) => {
  const { id } = req.params;
  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (!canEditLead(req.user, lead)) return res.status(403).json({ success: false, message: 'Access denied' });
    const rows = await pool.query(
      `SELECT address_id, concern_person, mobile_no, address, pincode, address_type, created_at
       FROM lead_addresses
       WHERE lead_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    res.json({ success: true, addresses: rows.rows });
  } catch (error) {
    console.error('Get lead addresses error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching addresses' });
  }
};

exports.addLeadAddress = async (req, res) => {
  const { id } = req.params;
  const { concern_person, mobile_no, address, pincode, address_type } = req.body || {};
  if (!address || !String(address).trim()) {
    return res.status(400).json({ success: false, message: 'Address is required' });
  }
  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (!canEditLead(req.user, lead)) return res.status(403).json({ success: false, message: 'Access denied' });
    const inserted = await pool.query(
      `INSERT INTO lead_addresses (lead_id, concern_person, mobile_no, address, pincode, address_type, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING address_id, concern_person, mobile_no, address, pincode, address_type, created_at`,
      [id, concern_person || null, mobile_no || null, String(address).trim(), pincode || null, address_type || 'Shipping', req.user.user_id]
    );
    res.status(201).json({ success: true, address: inserted.rows[0] });
  } catch (error) {
    console.error('Add lead address error:', error);
    res.status(500).json({ success: false, message: 'Server error adding address' });
  }
};

exports.deleteLeadAddress = async (req, res) => {
  const { id, address_id } = req.params;
  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (!canEditLead(req.user, lead)) return res.status(403).json({ success: false, message: 'Access denied' });
    const result = await pool.query(
      `DELETE FROM lead_addresses WHERE lead_id = $1 AND address_id = $2`,
      [id, address_id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    console.error('Delete lead address error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting address' });
  }
};

exports.addLeadRemark = async (req, res) => {
  const { id } = req.params;
  const { note } = req.body || {};
  if (!note || !String(note).trim()) {
    return res.status(400).json({ success: false, message: 'Remark note is required' });
  }
  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (!canEditLead(req.user, lead)) return res.status(403).json({ success: false, message: 'Access denied' });
    const inserted = await pool.query(
      `INSERT INTO lead_remarks (lead_id, user_id, note, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING remark_id, lead_id, user_id, note, created_at`,
      [id, req.user.user_id, String(note).trim()]
    );
    const row = inserted.rows[0];
    res.status(201).json({
      success: true,
      remark: {
        remarkId: row.remark_id,
        leadId: row.lead_id,
        userId: row.user_id,
        note: row.note,
        createdAt: row.created_at,
        userName: req.user.name
      }
    });
  } catch (error) {
    console.error('Add lead remark error:', error);
    res.status(500).json({ success: false, message: 'Server error adding remark' });
  }
};

exports.deleteLeadRemark = async (req, res) => {
  const { id, remark_id } = req.params;
  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (!canEditLead(req.user, lead)) return res.status(403).json({ success: false, message: 'Access denied' });
    const result = await pool.query(
      `DELETE FROM lead_remarks WHERE lead_id = $1 AND remark_id = $2`,
      [id, remark_id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Remark not found' });
    res.json({ success: true, message: 'Remark deleted' });
  } catch (error) {
    console.error('Delete lead remark error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting remark' });
  }
};

exports.getLeadCustomerProfile = async (req, res) => {
  const { id } = req.params;
  try {
    const lead = await prisma.lead.findUnique({ where: { leadId: parseInt(id, 10) } });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    if (!canEditLead(req.user, lead)) return res.status(403).json({ success: false, message: 'Access denied' });

    const customerRes = await pool.query(
      `SELECT customer_id, name, company_name, email, phone, gst_no
       FROM customers
       WHERE source_lead_id = $1
       LIMIT 1`,
      [id]
    );
    if (!customerRes.rows.length) return res.json({ success: true, customer: null, addresses: [] });
    const customer = customerRes.rows[0];
    const addressesRes = await pool.query(
      `SELECT customer_address_id, concern_person, mobile_no, address, pincode, is_head_office, address_type
       FROM customer_addresses
       WHERE customer_id = $1
       ORDER BY is_head_office DESC, customer_address_id ASC`,
      [customer.customer_id]
    );
    res.json({ success: true, customer, addresses: addressesRes.rows });
  } catch (error) {
    console.error('Get lead customer profile error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching customer profile' });
  }
};

exports.getLeadOrders = async (req, res) => {
  const { status } = req.query;

  try {
    const where = status ? { orderStatus: status } : {};
    if (req.user.role === 'sales') {
      where.lead = { assignedUserId: req.user.user_id };
    }
    const orders = await prisma.leadOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        lead: { select: { leadId: true, name: true, companyName: true, status: true } }
      }
    });

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('Get lead orders error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching orders' });
  }
};

exports.getAutoAssignConfig = async (req, res) => {
  try {
    const { getAutoAssignConfig } = require('../services/leadAutoAssignService');
    const config = await getAutoAssignConfig();
    res.json({ success: true, ...config });
  } catch (error) {
    console.error('Get auto-assign config error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getReports = async (req, res) => {
  try {
    const totalLeads = await prisma.lead.count();

    const statusWise = await prisma.lead.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    const teamWise = await prisma.$queryRaw`
      SELECT
        COALESCE(u.name, 'Unassigned') AS team_name,
        COUNT(l.lead_id)::int AS count
      FROM leads l
      LEFT JOIN users u ON l.assigned_user_id = u.user_id
      GROUP BY u.user_id, u.name
      ORDER BY count DESC, team_name
    `;

    const pendingLeads = await prisma.$queryRaw`
      SELECT COUNT(l.lead_id)::int AS count
      FROM leads l
      LEFT JOIN lead_activities a ON a.lead_id = l.lead_id
      WHERE a.lead_id IS NULL
    `;

    const dealCount = await prisma.lead.count({
      where: { status: 'Deal' }
    });

    const ordersCountRes = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM orders`;
    const ordersCount = ordersCountRes[0]?.count || 0;

    res.json({
      success: true,
      totals: {
        totalLeads,
        pendingLeads: pendingLeads[0]?.count || 0,
        deals: dealCount,
        orders: ordersCount
      },
      statusWise: statusWise.map(s => ({ status: s.status, count: s._count.status })),
      teamWise
    });
  } catch (error) {
    console.error('Lead reports error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching reports' });
  }
};
