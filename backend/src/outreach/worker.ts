import { db } from '../config/database.js';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

interface SequenceStep {
  id: string;
  step_order: number;
  wait_days: number;
  template_id: string;
  channel: 'email' | 'whatsapp' | 'sms';
  subject?: string;
  body: string;
}

let cachedTransporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    console.log(`[SMTP Config] Using custom SMTP server: ${host}:${port} (${user})`);
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user, pass }
    });
  } else {
    console.log('[SMTP Config] Credentials missing. Creating ephemeral Ethereal testing account...');
    const testAccount = await nodemailer.createTestAccount();
    console.log(`[Ethereal Account Created] User: ${testAccount.user}`);
    cachedTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  }
  return cachedTransporter;
}

async function dispatchMessage(
  channel: 'email' | 'whatsapp' | 'sms',
  recipient: string,
  subject?: string,
  body?: string
): Promise<{ providerMsgId?: string; errorDetail?: string; status: 'sent' | 'failed' }> {
  try {
    if (channel === 'email') {
      const emailTransporter = await getTransporter();
      const fromEmail = process.env.SMTP_USER || 'no-reply@leadstreampro.com';
      
      const mailOptions = {
        from: `"LeadStream Pro Outreach" <${fromEmail}>`,
        to: recipient,
        subject: subject || 'Outreach from LeadStream Pro',
        text: body || '',
        headers: {
          'mld-track-opens': 'false',
          'mld-track-inbox': 'true',
          'mld-track-campaign-id': process.env.MAILERCLOUD_CAMPAIGN_ID || 'leadstream-outreach'
        }
      };

      const info = await emailTransporter.sendMail(mailOptions);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`\n======================================================`);
        console.log(`[ETHEREAL PREVIEW] Email sent to ${recipient}! View it here:`);
        console.log(`${previewUrl}`);
        console.log(`======================================================\n`);
      }
      return { providerMsgId: info.messageId, status: 'sent' };
    }

    if (channel === 'sms' || channel === 'whatsapp') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = channel === 'sms' 
        ? (process.env.TWILIO_FROM_NUMBER || '+1234567890')
        : (process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886');

      if (accountSid && authToken) {
        console.log(`[Twilio Client] Sending real ${channel} message to ${recipient} via ${fromNumber}...`);
        const client = twilio(accountSid, authToken);
        const toVal = channel === 'whatsapp' && !recipient.startsWith('whatsapp:')
          ? `whatsapp:${recipient}`
          : recipient;

        const message = await client.messages.create({
          body: body || '',
          from: fromNumber,
          to: toVal
        });

        return { providerMsgId: message.sid, status: 'sent' };
      } else {
        const mockSid = `mock_twilio_${channel}_` + Math.random().toString(36).substring(7);
        console.log(`\n======================================================`);
        console.log(`[TWILIO SIMULATOR] Credentials missing. Mocking ${channel} send:`);
        console.log(`From: ${fromNumber}`);
        console.log(`To: ${recipient}`);
        console.log(`Body: ${body}`);
        console.log(`Mock SID: ${mockSid}`);
        console.log(`======================================================\n`);
        return { providerMsgId: mockSid, status: 'sent' };
      }
    }

    return { errorDetail: 'Unsupported channel', status: 'failed' };
  } catch (e: any) {
    console.error(`[Dispatch Error] Failed to send ${channel} message:`, e);
    return { errorDetail: e.message || String(e), status: 'failed' };
  }
}

export async function processOutreachQueue() {
  console.log('[Outreach Worker] Running outreach queue processing...');

  try {
    // 1. Fetch all active enrollments (not completed and not paused)
    const enrollmentsQuery = await db.query(`
      SELECT 
        e.id AS enrollment_id,
        e.business_id,
        e.current_step,
        e.sequence_id,
        b.name AS business_name,
        b.category AS business_category,
        b.city AS business_city
      FROM outreach_enrollments e
      JOIN businesses b ON e.business_id = b.id
      WHERE e.completed_at IS NULL AND e.is_paused = false
    `);

    const enrollments = enrollmentsQuery.rows;
    console.log(`[Outreach Worker] Found ${enrollments.length} active enrollments to review.`);

    for (const enrollment of enrollments) {
      const nextStepOrder = enrollment.current_step + 1;

      // 2. Fetch the next step in the sequence
      const stepQuery = await db.query(`
        SELECT 
          s.id AS step_id,
          s.step_order,
          s.wait_days,
          t.id AS template_id,
          t.channel,
          t.subject,
          t.body
        FROM outreach_sequence_steps s
        JOIN outreach_templates t ON s.template_id = t.id
        WHERE s.sequence_id = $1 AND s.step_order = $2
      `, [enrollment.sequence_id, nextStepOrder]);

      if (stepQuery.rows.length === 0) {
        // No more steps remaining — mark enrollment as complete
        await db.query(`
          UPDATE outreach_enrollments 
          SET completed_at = now() 
          WHERE id = $1
        `, [enrollment.enrollment_id]);
        console.log(`[Outreach Worker] Enrollment ${enrollment.enrollment_id} completed sequence (no more steps).`);
        continue;
      }

      const step: SequenceStep = stepQuery.rows[0];

      // 3. Verify wait_days constraints. Check when the last message was sent for this enrollment.
      const lastMessageQuery = await db.query(`
        SELECT sent_at FROM outreach_messages
        WHERE enrollment_id = $1
        ORDER BY sent_at DESC LIMIT 1
      `, [enrollment.enrollment_id]);

      const lastSentTime = lastMessageQuery.rows[0]?.sent_at 
        ? new Date(lastMessageQuery.rows[0].sent_at).getTime()
        : null;

      const currentTime = Date.now();
      const waitTimeMs = step.wait_days * 24 * 60 * 60 * 1000;

      if (lastSentTime && (currentTime - lastSentTime < waitTimeMs)) {
        // Wait period has not expired yet
        const remainingHours = Math.ceil((waitTimeMs - (currentTime - lastSentTime)) / (1000 * 60 * 60));
        console.log(`[Outreach Worker] Enrollment ${enrollment.enrollment_id} step ${step.step_order} waiting. ${remainingHours} hours remaining.`);
        continue;
      }

      // 4. Parse the template with business context variables
      const renderedSubject = step.subject 
        ? replaceVariables(step.subject, enrollment) 
        : undefined;
      const renderedBody = replaceVariables(step.body, enrollment);

      // 5. Fetch recipient contact details
      const contactType = step.channel === 'email' ? 'email' : 'phone';
      const contactQuery = await db.query(`
        SELECT value FROM contacts
        WHERE business_id = $1 AND contact_type = $2
        ORDER BY is_primary DESC LIMIT 1
      `, [enrollment.business_id, contactType]);

      const contactValue = contactQuery.rows[0]?.value;

      if (!contactValue) {
        const errorMsg = `No primary ${contactType} contact found for business "${enrollment.business_name}"`;
        console.warn(`[Outreach Worker] ${errorMsg}`);
        
        // Log a failed message in the database
        await db.query(`
          INSERT INTO outreach_messages (
            enrollment_id, business_id, channel, template_id, rendered_body, status, error_detail, sent_at
          ) VALUES ($1, $2, $3, $4, $5, 'failed', $6, now())
        `, [
          enrollment.enrollment_id,
          enrollment.business_id,
          step.channel,
          step.template_id,
          renderedBody,
          errorMsg
        ]);
        
        // Increment current step order in the enrollment record to avoid locking the queue
        await db.query(`
          UPDATE outreach_enrollments
          SET current_step = $1
          WHERE id = $2
        `, [step.step_order, enrollment.enrollment_id]);
        continue;
      }

      // 6. Send message using the dispatcher helper
      console.log(`[Outreach Worker] Dispatching Step ${step.step_order} via [${step.channel.toUpperCase()}] to ${contactValue} for "${enrollment.business_name}"`);
      const dispatchResult = await dispatchMessage(step.channel, contactValue, renderedSubject, renderedBody);

      // 7. Log message delivery in the database
      const messageIdQuery = await db.query(`
        INSERT INTO outreach_messages (
          enrollment_id, business_id, channel, template_id, rendered_body, status, provider_msg_id, error_detail, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
        RETURNING id
      `, [
        enrollment.enrollment_id,
        enrollment.business_id,
        step.channel,
        step.template_id,
        renderedBody,
        dispatchResult.status,
        dispatchResult.providerMsgId || null,
        dispatchResult.errorDetail || null
      ]);

      const messageId = messageIdQuery.rows[0].id;

      // 8. Increment current step order in the enrollment record
      await db.query(`
        UPDATE outreach_enrollments
        SET current_step = $1
        WHERE id = $2
      `, [step.step_order, enrollment.enrollment_id]);

      console.log(`[Outreach Worker] Successfully processed message ${messageId} (status=${dispatchResult.status}) and advanced enrollment to step ${step.step_order}.`);
    }

  } catch (error) {
    console.error('[Outreach Worker] Error during worker run:', error);
  }
}

function replaceVariables(text: string, context: any): string {
  return text
    .replace(/\{\{\s*business_name\s*\}\}/g, context.business_name || 'Business')
    .replace(/\{\{\s*category\s*\}\}/g, context.business_category || 'industry')
    .replace(/\{\{\s*city\s*\}\}/g, context.business_city || 'your area');
}
