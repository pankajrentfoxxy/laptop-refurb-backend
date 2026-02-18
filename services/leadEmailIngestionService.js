const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const pool = require('../config/db');

const LEAD_EMAIL_POLL_INTERVAL_MS = parseInt(process.env.LEAD_EMAIL_POLL_INTERVAL_MS || '120000', 10);
const LEAD_EMAIL_LOOKBACK_DAYS = parseInt(process.env.LEAD_EMAIL_LOOKBACK_DAYS || '14', 10);
const LEAD_EMAIL_MAILBOXES = (process.env.LEAD_EMAIL_MAILBOXES || 'Sent,INBOX,[Gmail]/Sent Mail')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const PERSONAL_EMAIL_DOMAINS = new Set(
    (process.env.LEAD_PERSONAL_EMAIL_DOMAINS
        || 'gmail.com,yahoo.com,outlook.com,hotmail.com,live.com,msn.com,icloud.com,aol.com,proton.me,protonmail.com,zoho.com,gmx.com,yandex.com,rediffmail.com,mail.com')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
);

let intervalRef = null;
let running = false;
let lastSuccessfulSyncAt = null;

const normalizeText = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text.length ? text : null;
};

const truncateText = (value, maxLength) => {
    const text = normalizeText(value);
    if (!text) return null;
    if (!maxLength || text.length <= maxLength) return text;
    return text.slice(0, maxLength);
};

const normalizePhone = (value) => {
    const text = normalizeText(value);
    if (!text) return null;
    const digits = text.replace(/\D/g, '');
    return digits.length ? digits : null;
};

const sanitizeCity = (value) => {
    const text = normalizeText(value);
    if (!text) return null;
    return normalizeText(
        text
            .replace(/\bnew\s+enquiry\b/ig, '')
            .replace(/\bnew\s+inquiry\b/ig, '')
            .replace(/\s+/g, ' ')
            .trim()
    );
};

const extractDomain = (email) => {
    const value = normalizeText(email);
    if (!value || !value.includes('@')) return null;
    return value.split('@')[1].toLowerCase();
};

const isPersonalEmail = (email) => {
    const domain = extractDomain(email);
    if (!domain) return false;
    return PERSONAL_EMAIL_DOMAINS.has(domain);
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractFieldFromText = (bodyText, labels, allLabels) => {
    if (!bodyText) return null;
    const labelGroup = allLabels.map((label) => escapeRegExp(label)).join('|');
    for (const label of labels) {
        const pattern = new RegExp(
            `${escapeRegExp(label)}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${labelGroup})\\s*:|$)`,
            'i'
        );
        const match = bodyText.match(pattern);
        if (match?.[1]) {
            const value = normalizeText(match[1].replace(/\s+/g, ' '));
            if (value) return value;
        }
    }
    return null;
};

const isLeadEnquiryMessage = ({ fromAddress, subject, bodyText, parsedFields }) => {
    const normalizedFrom = (fromAddress || '').toLowerCase();
    const normalizedSubject = (subject || '').toLowerCase();
    const normalizedBody = (bodyText || '').toLowerCase();
    const hasCoreFields = !!(
        normalizeText(parsedFields?.name) &&
        (normalizeText(parsedFields?.email) || normalizeText(parsedFields?.phone))
    );
    return (
        hasCoreFields ||
        normalizedFrom.includes('leads@rentfoxxy.com') ||
        normalizedSubject.includes('product enquiry') ||
        normalizedBody.includes('new product enquiry') ||
        (normalizedBody.includes('name:') && normalizedBody.includes('email:') && normalizedBody.includes('phone:'))
    );
};

const parseEnquiryBody = (bodyText) => {
    const fields = {};
    const original = String(bodyText || '');
    const normalized = original.replace(/\r/g, '\n');
    const flattened = normalized.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    const searchable = `${normalized}\n${flattened}`.trim();

    const fieldDefs = [
        { key: 'first_name', labels: ['First Name', 'Firstname'] },
        { key: 'last_name', labels: ['Last Name', 'Lastname', 'Surname'] },
        { key: 'name', labels: ['Name'] },
        { key: 'email', labels: ['Email', 'Email Address'] },
        { key: 'phone', labels: ['Phone', 'Phone Number', 'Mobile', 'Mobile Number'] },
        { key: 'city', labels: ['City'] },
        { key: 'product_name', labels: ['Product Name'] },
        { key: 'model', labels: ['Model'] },
        { key: 'ram', labels: ['RAM'] },
        { key: 'cpu', labels: ['CPU', 'Processor'] },
        { key: 'storage', labels: ['Storage'] },
        { key: 'page_url', labels: ['Page Url', 'Page URL'] }
    ];

    const allLabels = fieldDefs.flatMap((definition) => definition.labels);
    for (const definition of fieldDefs) {
        if (definition.key === 'name' && (fields.first_name || fields.last_name)) {
            continue;
        }
        const value = extractFieldFromText(searchable, definition.labels, allLabels);
        if (value) fields[definition.key] = value;
    }

    return fields;
};

const findExistingLeadId = async ({ email, phone }) => {
    const normalizedEmail = normalizeText(email)?.toLowerCase() || null;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedEmail && !normalizedPhone) return null;

    if (normalizedEmail && normalizedPhone) {
        const result = await pool.query(
            `SELECT lead_id
             FROM leads
             WHERE source IN ('Google', 'Website Email')
               AND (
                    LOWER(COALESCE(email, '')) = $1
                    OR regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2
               )
             ORDER BY lead_id ASC
             LIMIT 1`,
            [normalizedEmail, normalizedPhone]
        );
        return result.rows[0]?.lead_id || null;
    }

    if (normalizedEmail) {
        const result = await pool.query(
            `SELECT lead_id
             FROM leads
             WHERE source IN ('Google', 'Website Email')
               AND LOWER(COALESCE(email, '')) = $1
             ORDER BY lead_id ASC
             LIMIT 1`,
            [normalizedEmail]
        );
        return result.rows[0]?.lead_id || null;
    }

    const result = await pool.query(
        `SELECT lead_id
         FROM leads
         WHERE source IN ('Google', 'Website Email')
           AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
         ORDER BY lead_id ASC
         LIMIT 1`,
        [normalizedPhone]
    );
    return result.rows[0]?.lead_id || null;
};

const buildLeadNotes = ({ parsedFields, subject, fromAddress, sentAt }) => {
    const excluded = new Set(['name', 'email', 'phone', 'city']);
    const detailLines = [];

    for (const [key, rawValue] of Object.entries(parsedFields)) {
        if (excluded.has(key)) continue;
        const value = normalizeText(rawValue);
        if (!value) continue;
        const label = key
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
        detailLines.push(`${label}: ${value}`);
    }

    const metaLines = [
        `Source Email: ${fromAddress || '-'}`,
        `Subject: ${subject || '-'}`,
        `Received At: ${sentAt ? new Date(sentAt).toISOString() : '-'}`
    ];

    if (!detailLines.length) {
        return `Lead imported from enquiry email.\n${metaLines.join('\n')}`;
    }

    return `Lead imported from enquiry email.\n${metaLines.join('\n')}\n\nRequirement Details:\n${detailLines.join('\n')}`;
};

const ensureIngestionTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS email_lead_ingestion_log (
            ingestion_id SERIAL PRIMARY KEY,
            message_id TEXT UNIQUE NOT NULL,
            mailbox VARCHAR(255),
            subject TEXT,
            lead_id INTEGER REFERENCES leads(lead_id) ON DELETE SET NULL,
            processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_email_lead_ingestion_processed ON email_lead_ingestion_log(processed_at DESC);
    `);
};

const hasMessageProcessed = async (messageId) => {
    const result = await pool.query(
        `SELECT ingestion_id FROM email_lead_ingestion_log WHERE message_id = $1 LIMIT 1`,
        [messageId]
    );
    return result.rows.length > 0;
};

const insertLeadFromEmail = async ({ parsedFields, subject, fromAddress, sentAt }) => {
    const combinedName = normalizeText(
        `${normalizeText(parsedFields.first_name) || ''} ${normalizeText(parsedFields.last_name) || ''}`.trim()
    );
    const name = truncateText(combinedName || parsedFields.name, 255) || 'Website Enquiry';
    const email = truncateText(normalizeText(parsedFields.email)?.toLowerCase(), 255) || null;
    const phone = truncateText(normalizePhone(parsedFields.phone), 50);
    const city = truncateText(sanitizeCity(parsedFields.city), 100);
    const companyName = truncateText(extractDomain(email), 255);
    const notes = buildLeadNotes({ parsedFields, subject, fromAddress, sentAt });
    const safeNotes = truncateText(notes, 255);

    const existingLeadId = await findExistingLeadId({ email, phone });
    if (existingLeadId) {
        await pool.query(
            `INSERT INTO lead_activities (lead_id, user_id, action, status_from, status_to, notes, created_at)
             VALUES ($1, NULL, 'email_reingested', NULL, NULL, $2, CURRENT_TIMESTAMP)`,
            [existingLeadId, safeNotes]
        );
        return existingLeadId;
    }

    const receivedAt = sentAt ? new Date(sentAt) : new Date();
    const safeReceivedAt = Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt;

    const leadResult = await pool.query(
        `INSERT INTO leads (name, company_name, email, phone, city, source, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'Google', 'Pending', $6, $6)
         RETURNING lead_id`,
        [name, companyName, email, phone, city, safeReceivedAt]
    );

    const leadId = leadResult.rows[0].lead_id;

    await pool.query(
        `INSERT INTO lead_activities (lead_id, user_id, action, status_from, status_to, notes, created_at)
         VALUES ($1, NULL, 'email_imported', NULL, 'Pending', $2, CURRENT_TIMESTAMP)`,
        [leadId, safeNotes]
    );

    return leadId;
};

const markMessageProcessed = async ({ messageId, mailbox, subject, leadId }) => {
    await pool.query(
        `INSERT INTO email_lead_ingestion_log (message_id, mailbox, subject, lead_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (message_id) DO NOTHING`,
        [
            messageId,
            truncateText(mailbox, 255),
            truncateText(subject, 255),
            leadId || null
        ]
    );
};

const getAvailableMailboxes = async (client) => {
    const available = [];
    for (const mailbox of LEAD_EMAIL_MAILBOXES) {
        try {
            await client.mailboxOpen(mailbox);
            available.push(mailbox);
        } catch {
            // Try next mailbox option.
        }
    }
    if (!available.length) {
        throw new Error(`Unable to open any mailbox from: ${LEAD_EMAIL_MAILBOXES.join(', ')}`);
    }
    return available;
};

const getSyncSinceDate = () => {
    if (!lastSuccessfulSyncAt) {
        return new Date(Date.now() - LEAD_EMAIL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    }
    // Keep a small overlap so delayed emails are still captured.
    return new Date(lastSuccessfulSyncAt.getTime() - 5 * 60 * 1000);
};

const runLeadEmailSync = async () => {
    const host = process.env.LEAD_EMAIL_IMAP_HOST;
    const user = process.env.LEAD_EMAIL_IMAP_USER;
    const pass = process.env.LEAD_EMAIL_IMAP_PASS;
    const port = parseInt(process.env.LEAD_EMAIL_IMAP_PORT || '993', 10);
    const secure = String(process.env.LEAD_EMAIL_IMAP_SECURE || 'true').toLowerCase() !== 'false';

    if (!host || !user || !pass) {
        console.warn('⚠️ Lead email sync skipped: IMAP credentials are missing');
        return;
    }

    const client = new ImapFlow({
        host,
        port,
        secure,
        auth: { user, pass },
        logger: false
    });
    client.on('error', (error) => {
        console.error(`⚠️ Lead email IMAP connection issue: ${error.message}`);
    });

    try {
        await client.connect();
        const mailboxes = await getAvailableMailboxes(client);

        const sinceDate = getSyncSinceDate();

        let created = 0;
        let deduped = 0;
        let skipped = 0;
        for (const mailbox of mailboxes) {
            try {
                await client.mailboxOpen(mailbox);
                const uids = await client.search({ since: sinceDate });
                if (!uids.length) continue;

                for await (const message of client.fetch(uids, { envelope: true, source: true })) {
                    try {
                        const messageId = normalizeText(message.envelope?.messageId);
                        if (!messageId) {
                            skipped++;
                            continue;
                        }

                        if (await hasMessageProcessed(messageId)) {
                            skipped++;
                            continue;
                        }

                        const parsed = await simpleParser(message.source);
                        const fromAddress = parsed.from?.value?.[0]?.address || '';
                        const subject = parsed.subject || '';
                        const bodyText = parsed.text || '';
                        const fields = parseEnquiryBody(bodyText);

                        if (!isLeadEnquiryMessage({ fromAddress, subject, bodyText, parsedFields: fields })) {
                            await markMessageProcessed({ messageId, mailbox, subject, leadId: null });
                            skipped++;
                            continue;
                        }

                        if (isPersonalEmail(fields.email)) {
                            await markMessageProcessed({ messageId, mailbox, subject, leadId: null });
                            skipped++;
                            continue;
                        }

                        const beforeInsertLeadId = await findExistingLeadId({
                            email: fields.email,
                            phone: fields.phone
                        });

                        const leadId = await insertLeadFromEmail({
                            parsedFields: fields,
                            subject,
                            fromAddress,
                            sentAt: message.envelope?.date || parsed.date || null
                        });
                        await markMessageProcessed({ messageId, mailbox, subject, leadId });
                        if (beforeInsertLeadId) deduped++;
                        else created++;
                    } catch (messageError) {
                        console.error(`⚠️ Lead sync message skipped in "${mailbox}": ${messageError.message}`);
                        skipped++;
                    }
                }
            } catch (mailboxError) {
                console.error(`⚠️ Lead sync mailbox "${mailbox}" failed: ${mailboxError.message}`);
            }
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log(`Lead email sync: created=${created}, deduped=${deduped}, skipped=${skipped}`);
        }
        lastSuccessfulSyncAt = new Date();
    } finally {
        try {
            await client.logout();
        } catch {
            // Ignore logout errors.
        }
    }
};

const startLeadEmailIngestionWorker = async () => {
    await ensureIngestionTable();

    if (!running) {
        running = true;
        await runLeadEmailSync().catch((error) => {
            console.error('❌ Lead email sync failed:', error.message);
        });
        running = false;
    }

    if (!intervalRef) {
        intervalRef = setInterval(async () => {
            if (running) return;
            running = true;
            try {
                await runLeadEmailSync();
            } catch (error) {
                console.error('❌ Lead email sync failed:', error.message);
            } finally {
                running = false;
            }
        }, LEAD_EMAIL_POLL_INTERVAL_MS);
    }
};

module.exports = {
    startLeadEmailIngestionWorker,
    runLeadEmailSync
};
