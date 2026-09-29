import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The API layer reads these lazily at request time; tests never touch real services.
    env: {
      SECRET_KEY: 'test-secret-key-0123456789-0123456789-abcdef',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.test',
      APP_URL: 'https://app.test',
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      SMTP_HOST: 'smtp.test',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
    },
    restoreMocks: true,
  },
});
