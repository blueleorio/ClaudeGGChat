// Extracted for testability — allows jest.spyOn(process, 'exit')
export function validateEnv(): void {
  const required = ['ANTHROPIC_API_KEY', 'ALLOWED_SPACE_IDS', 'GOOGLE_SERVICE_ACCOUNT_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}
