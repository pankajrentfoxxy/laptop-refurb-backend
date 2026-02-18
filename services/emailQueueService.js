const nodemailer = require('nodemailer');
const pool = require('../config/db');

const QUEUE_POLL_INTERVAL_MS = parseInt(process.env.EMAIL_QUEUE_POLL_INTERVAL_MS || '60000', 10);
const FOLLOWUP_SCAN_INTERVAL_MS = parseInt(process.env.FOLLOWUP_SCAN_INTERVAL_MS || '60000', 10);
const FOLLOWUP_WINDOW_MINUTES = parseInt(process.env.FOLLOWUP_EMAIL_WINDOW_MINUTES || '10', 10);
const BATCH_SIZE = parseInt(process.env.EMAIL_QUEUE_BATCH_SIZE || '20', 10);

let queueInterval = null;
let followupInterval = null;

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
};

const enqueueEmail = async ({
  toEmail,
  subject,
  bodyText = null,
  bodyHtml = null,
  scheduledAt = null,
  dedupeKey = null
}) => {
  const result = await pool.query(
    `INSERT INTO email_queue (to_email, subject, body_text, body_html, scheduled_at, dedupe_key)
     VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_TIMESTAMP), $6)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING email_id`,
    [toEmail, subject, bodyText, bodyHtml, scheduledAt, dedupeKey]
  );
  return result.rows.length > 0;
};

const scanAndQueueFollowUpReminderEmails = async () => {
  try {
    const rows = await pool.query(
      `SELECT l.lead_id, l.name, l.company_name, l.follow_up_date, u.email AS assignee_email, u.name AS assignee_name
       FROM leads l
       JOIN users u ON u.user_id = l.assigned_user_id
       WHERE l.follow_up_date IS NOT NULL
         AND l.assigned_user_id IS NOT NULL
         AND u.email IS NOT NULL
         AND l.status NOT IN ('Rejected', 'Gone')
         AND l.follow_up_date BETWEEN CURRENT_TIMESTAMP AND (CURRENT_TIMESTAMP + ($1::text || ' minutes')::interval)
         AND NOT EXISTS (
           SELECT 1 FROM lead_followup_notifications n
           WHERE n.lead_id = l.lead_id
             AND n.follow_up_at = l.follow_up_date
             AND n.recipient_email = u.email
             AND n.channel = 'email'
         )`,
      [FOLLOWUP_WINDOW_MINUTES]
    );

    for (const lead of rows.rows) {
      const followupAt = new Date(lead.follow_up_date).toLocaleString();
      const subject = `Follow-up Reminder: ${lead.name} in ${FOLLOWUP_WINDOW_MINUTES} minutes`;
      const text = `Lead: ${lead.name}\nCompany: ${lead.company_name || '-'}\nFollow-up: ${followupAt}\nPlease contact this lead on time.`;
      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h3>Follow-up Reminder</h3>
          <p><strong>Lead:</strong> ${lead.name}</p>
          <p><strong>Company:</strong> ${lead.company_name || '-'}</p>
          <p><strong>Follow-up Time:</strong> ${followupAt}</p>
          <p>Please contact this lead on time.</p>
        </div>
      `;
      const dedupeKey = `followup:${lead.lead_id}:${new Date(lead.follow_up_date).toISOString()}:${lead.assignee_email}`;

      const queued = await enqueueEmail({
        toEmail: lead.assignee_email,
        subject,
        bodyText: text,
        bodyHtml: html,
        dedupeKey
      });

      if (queued) {
        await pool.query(
          `INSERT INTO lead_followup_notifications (lead_id, follow_up_at, recipient_email, channel)
           VALUES ($1, $2, $3, 'email')
           ON CONFLICT ON CONSTRAINT unique_lead_followup_email_notification DO NOTHING`,
          [lead.lead_id, lead.follow_up_date, lead.assignee_email]
        );
      }
    }
  } catch (error) {
    console.error('Follow-up email scan failed:', error.message);
  }
};

const processQueue = async () => {
  const transporter = getTransporter();
  if (!transporter) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items = await client.query(
      `WITH picked AS (
         SELECT email_id
         FROM email_queue
         WHERE status IN ('pending', 'failed')
           AND attempts < max_attempts
           AND scheduled_at <= CURRENT_TIMESTAMP
         ORDER BY scheduled_at ASC, email_id ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE email_queue q
       SET status = 'processing'
       FROM picked
       WHERE q.email_id = picked.email_id
       RETURNING q.*`,
      [BATCH_SIZE]
    );
    await client.query('COMMIT');

    for (const item of items.rows) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.SMTP_USER,
          to: item.to_email,
          subject: item.subject,
          text: item.body_text || undefined,
          html: item.body_html || undefined
        });

        await pool.query(
          `UPDATE email_queue
           SET status = 'sent', attempts = attempts + 1, sent_at = CURRENT_TIMESTAMP, last_error = NULL
           WHERE email_id = $1`,
          [item.email_id]
        );
      } catch (error) {
        await pool.query(
          `UPDATE email_queue
           SET status = 'failed', attempts = attempts + 1, last_error = $2
           WHERE email_id = $1`,
          [item.email_id, String(error.message || 'Unknown SMTP error').slice(0, 1000)]
        );
      }
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Email queue processing failed:', error.message);
  } finally {
    client.release();
  }
};

const ensureQueueTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_queue (
      email_id SERIAL PRIMARY KEY,
      to_email VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT,
      body_html TEXT,
      dedupe_key VARCHAR(255) UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP WITH TIME ZONE,
      last_error TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lead_followup_notifications (
      notification_id SERIAL PRIMARY KEY,
      lead_id INTEGER REFERENCES leads(lead_id) ON DELETE CASCADE,
      follow_up_at TIMESTAMP WITH TIME ZONE NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'email',
      notified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_lead_followup_email_notification UNIQUE (lead_id, follow_up_at, recipient_email, channel)
    );

    CREATE INDEX IF NOT EXISTS idx_email_queue_status_schedule ON email_queue(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_lead_followup_notifications_lead ON lead_followup_notifications(lead_id);
  `);
};

const startEmailQueueWorker = async () => {
  await ensureQueueTables();

  if (!queueInterval) {
    queueInterval = setInterval(processQueue, QUEUE_POLL_INTERVAL_MS);
  }
  if (!followupInterval) {
    followupInterval = setInterval(scanAndQueueFollowUpReminderEmails, FOLLOWUP_SCAN_INTERVAL_MS);
  }

  await scanAndQueueFollowUpReminderEmails();
  await processQueue();
};

module.exports = {
  startEmailQueueWorker
};
