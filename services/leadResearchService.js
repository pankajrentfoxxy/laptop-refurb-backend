const prisma = require('../prisma/client');
const { researchLeadCompany } = require('./perplexityService');

const getDomainFromEmail = (email) => {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return null;
  return normalized.split('@')[1] || null;
};
const isLikelyCompanyDomain = (value) => !!value && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);

/**
 * Run company research for a lead if not already done.
 * @param {object} lead - Lead object with leadId, companyName, email, brand, name, isDuplicate
 * @param {{ force?: boolean }} options - force: re-run even if completed
 */
const ensureResearch = async (lead, options = {}) => {
  const { force = false } = options;
  if (!lead || lead.isDuplicate) return;

  const existing = await prisma.leadCompanyResearch.findUnique({
    where: { leadId: lead.leadId }
  });
  if (!force && (existing || lead.researchStatus === 'completed')) return;

  const emailDomain = getDomainFromEmail(lead.email);
  const companyName = (
    (lead.companyName && lead.companyName.trim()) ||
    (isLikelyCompanyDomain(emailDomain) ? emailDomain : null) ||
    (lead.name && lead.name.trim()) ||
    'Unknown Company'
  );
  const researchTarget = [companyName, lead.brand].filter(Boolean).join(' ').trim();
  try {
    const data = await researchLeadCompany(researchTarget || companyName);
    await prisma.leadCompanyResearch.upsert({
      where: { leadId: lead.leadId },
      create: {
        leadId: lead.leadId,
        industry: data.industry,
        pincode: data.pincode,
        cin: data.cin,
        entityType: data.entity_type,
        roc: data.roc,
        revenue: data.revenue,
        employees: data.employees,
        gst: data.gst,
        address: data.address,
        city: data.city,
        state: data.state,
        rawResponse: data
      },
      update: {
        industry: data.industry,
        pincode: data.pincode,
        cin: data.cin,
        entityType: data.entity_type,
        roc: data.roc,
        revenue: data.revenue,
        employees: data.employees,
        gst: data.gst,
        address: data.address,
        city: data.city,
        state: data.state,
        rawResponse: data
      }
    });
    await prisma.lead.update({
      where: { leadId: lead.leadId },
      data: { researchStatus: 'completed', researchRequestedAt: new Date() }
    });
  } catch (error) {
    await prisma.lead.update({
      where: { leadId: lead.leadId },
      data: { researchStatus: 'failed', researchRequestedAt: new Date() }
    });
  }
};

module.exports = { ensureResearch };
