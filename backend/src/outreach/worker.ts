import { db } from '../config/database.js';

interface SequenceStep {
  id: string;
  step_order: number;
  wait_days: number;
  template_id: string;
  channel: 'email' | 'whatsapp' | 'sms';
  subject?: string;
  body: string;
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

      // 5. Send message (Mock implementation showcasing integrations)
      console.log(`[Outreach Worker] Dispatching Step ${step.step_order} via [${step.channel.toUpperCase()}] for "${enrollment.business_name}"`);
      const providerMsgId = await sendMockMessage(step.channel, renderedSubject, renderedBody);

      // 6. Log sent message in the database
      const messageIdQuery = await db.query(`
        INSERT INTO outreach_messages (
          enrollment_id, business_id, channel, template_id, rendered_body, status, provider_msg_id, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        RETURNING id
      `, [
        enrollment.enrollment_id,
        enrollment.business_id,
        step.channel,
        step.template_id,
        renderedBody,
        'sent',
        providerMsgId
      ]);

      const messageId = messageIdQuery.rows[0].id;

      // 7. Increment current step order in the enrollment record
      await db.query(`
        UPDATE outreach_enrollments
        SET current_step = $1
        WHERE id = $2
      `, [step.step_order, enrollment.enrollment_id]);

      console.log(`[Outreach Worker] Successfully sent message ${messageId} and advanced enrollment to step ${step.step_order}.`);
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

async function sendMockMessage(channel: string, subject?: string, body?: string): Promise<string> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (channel === 'email') {
    return 'gmail_msg_' + Math.random().toString(36).substring(7);
  } else if (channel === 'whatsapp') {
    return 'whatsapp_sid_' + Math.random().toString(36).substring(7);
  } else {
    return 'twilio_sms_sid_' + Math.random().toString(36).substring(7);
  }
}
