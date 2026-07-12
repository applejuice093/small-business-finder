-- Seed data for Outreach Sequences, Templates, and Steps

-- 1. Create Default Operator User if it doesn't exist
INSERT INTO users (id, email, name, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'operator@example.com', 'Dashboard Operator', 'operator')
ON CONFLICT (id) DO NOTHING;

-- 2. Create Outreach Templates (without 'variables' column)
INSERT INTO outreach_templates (id, name, channel, subject, body)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Initial Cold Email', 'email', 'Interested in a modern website for {{ business_name }}?', 'Hi there,\n\nI noticed that {{ business_name }} doesn''t have a website yet, or it''s currently offline. A custom website can help you get discovered by more customers in {{ city }}.\n\nI''d love to help you build one! Are you available for a quick chat?\n\nBest regards,\nLeadStream Pro Team'),
  ('22222222-2222-2222-2222-222222222222', 'WhatsApp Follow-up', 'whatsapp', NULL, 'Hello! Following up on our email to {{ business_name }}. We design high-performance websites for businesses in the {{ category }} sector. Would you be open to seeing a free mockup we created for you?'),
  ('33333333-3333-3333-3333-333333333333', 'Final SMS Follow-up', 'sms', NULL, 'Hi! This is the LeadStream Team. We''d love to help {{ business_name }} build a custom website. Reply YES if you''re interested in a free consultation call!')
ON CONFLICT (id) DO NOTHING;

-- 3. Create Default Sequence matching the frontend dummy id (without 'is_active' column)
INSERT INTO outreach_sequences (id, name, description)
VALUES ('c3b9b4f6-8c9e-4e4f-b4e6-8c9e4e4fb4e6', 'Standard Cold Outreach Sequence', 'A standard multi-channel sequence featuring a cold email, followed by WhatsApp and SMS check-ins.')
ON CONFLICT (id) DO NOTHING;

-- 4. Create Sequence Steps
INSERT INTO outreach_sequence_steps (id, sequence_id, step_order, wait_days, template_id)
VALUES 
  ('44444444-4444-4444-4444-444444444444', 'c3b9b4f6-8c9e-4e4f-b4e6-8c9e4e4fb4e6', 1, 0, '11111111-1111-1111-1111-111111111111'),
  ('55555555-5555-5555-5555-555555555555', 'c3b9b4f6-8c9e-4e4f-b4e6-8c9e4e4fb4e6', 2, 2, '22222222-2222-2222-2222-222222222222'),
  ('66666666-6666-6666-6666-666666666666', 'c3b9b4f6-8c9e-4e4f-b4e6-8c9e4e4fb4e6', 3, 4, '33333333-3333-3333-3333-333333333333')
ON CONFLICT (id) DO NOTHING;
