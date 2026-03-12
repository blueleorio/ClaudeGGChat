import express from 'express';

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Placeholder — Phase 2 will add JWT verification and event handling here
app.post('/', (req, res) => {
  console.log('Received event:', JSON.stringify(req.body, null, 2));
  res.status(200).json({ text: 'OK' });
});

// Only start listening when this file is the entry point (not imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
