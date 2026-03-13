// RED tests for INFRA-03: startup env validation
// validateEnv module does not exist yet — these tests will fail until Plan 02 implements it

import { validateEnv } from '../utils/validateEnv';

describe('validateEnv', () => {
  const REQUIRED_VARS = ['ANTHROPIC_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_KEY', 'ALLOWED_SPACE_IDS'];

  let exitSpy: jest.SpyInstance;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Save current env values
    savedEnv = {};
    for (const key of REQUIRED_VARS) {
      savedEnv[key] = process.env[key];
    }
    // Spy on process.exit and throw instead of actually exiting to prevent Jest termination
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((_code?: string | number | null | undefined) => {
        throw new Error('process.exit called');
      });
  });

  afterEach(() => {
    // Restore env
    for (const key of REQUIRED_VARS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    exitSpy.mockRestore();
  });

  it('calls process.exit(1) when ANTHROPIC_API_KEY is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when ALLOWED_SPACE_IDS is missing', () => {
    delete process.env.ALLOWED_SPACE_IDS;
    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when GOOGLE_SERVICE_ACCOUNT_KEY is missing', () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does NOT call process.exit when all required vars are present', () => {
    // All vars set by setup.ts — ensure they are present
    process.env.ANTHROPIC_API_KEY = 'test-api-key-for-jest';
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ type: 'service_account' });
    process.env.ALLOWED_SPACE_IDS = 'spaces/X';
    expect(() => validateEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
