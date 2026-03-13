// Jest global setup: set required environment variables before any module is loaded
// This prevents module-level env guards from throwing in test environments
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-api-key-for-jest';
process.env.GOOGLE_SERVICE_ACCOUNT_KEY =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY ??
  JSON.stringify({ type: 'service_account', project_id: 'test', private_key_id: 'test', private_key: 'test', client_email: 'test@test.iam.gserviceaccount.com', client_id: 'test', auth_uri: '', token_uri: '', auth_provider_x509_cert_url: '', client_x509_cert_url: '' });
process.env.ALLOWED_SPACE_IDS = process.env.ALLOWED_SPACE_IDS ?? 'spaces/X';
