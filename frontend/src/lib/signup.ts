/**
 * Optional sign-up allowlist. Set SIGNUP_ALLOWED_DOMAINS to a comma-separated list
 * (e.g. "acme.com,acme.co.th") to restrict who can CREATE an account, both with a
 * password and through Google. Unset or empty keeps sign-up open. People who already
 * have an account are never blocked by it, and subdomains are not implied.
 */
export function allowedSignupDomains(): string[] {
  return (process.env.SIGNUP_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function isSignupAllowed(email: string): boolean {
  const domains = allowedSignupDomains();
  if (domains.length === 0) return true;
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  return domains.includes(email.slice(at + 1).trim().toLowerCase());
}

export const SIGNUP_RESTRICTED_MESSAGE = 'Sign-up is restricted to approved email domains.';
