import { validateEnv } from './env.schema';

const BASE = {
  DATABASE_URL: 'postgresql://app:app@localhost:5440/sports',
  JWT_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('sin STORAGE_PROVIDER usa el stub y el bucket por defecto', () => {
    const env = validateEnv({ ...BASE });
    expect(env.STORAGE_PROVIDER).toBe('stub');
    expect(env.SUPABASE_STORAGE_BUCKET).toBe('complex-logos');
  });

  it('STORAGE_PROVIDER=supabase sin credenciales no arranca', () => {
    expect(() =>
      validateEnv({ ...BASE, STORAGE_PROVIDER: 'supabase' }),
    ).toThrow(/SUPABASE_URL/);
    expect(() =>
      validateEnv({
        ...BASE,
        STORAGE_PROVIDER: 'supabase',
        SUPABASE_URL: 'https://abcdefgh.supabase.co',
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('con las dos credenciales, parsea', () => {
    const env = validateEnv({
      ...BASE,
      STORAGE_PROVIDER: 'supabase',
      SUPABASE_URL: 'https://abcdefgh.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(40),
      SUPABASE_STORAGE_BUCKET: 'logos',
    });
    expect(env.STORAGE_PROVIDER).toBe('supabase');
    expect(env.SUPABASE_STORAGE_BUCKET).toBe('logos');
  });
});
