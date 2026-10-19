/** Business fields available to outreach templates. */
export interface TemplateContext {
  business_name?: string | null;
  business_category?: string | null;
  business_city?: string | null;
}

/**
 * Renders an outreach template.
 *
 * Supported placeholders (whitespace inside the braces is optional):
 *   {{ business_name }}, {{ category }}, {{ city }}
 *
 * Literal "\n" sequences (as stored by seed.sql) are converted to real
 * newlines. Missing values fall back to neutral wording so a message never
 * goes out with an empty gap or a raw placeholder.
 */
export function renderTemplate(text: string, context: TemplateContext): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\{\{\s*business_name\s*\}\}/g, () => context.business_name || 'Business')
    .replace(/\{\{\s*category\s*\}\}/g, () => context.business_category || 'industry')
    .replace(/\{\{\s*city\s*\}\}/g, () => context.business_city || 'your area');
}
