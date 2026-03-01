const express = require('express');
const cors = require('cors');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const { startEmailQueueWorker } = require('./services/emailQueueService');
const { startInventorySyncWorker } = require('./services/inventoryErpSyncService');
const { startLeadEmailIngestionWorker } = require('./services/leadEmailIngestionService');

const app = express();

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5001',
  'https://rentfoxxy.vercel.app'
];

if (process.env.FRONTEND_URL) {
  try {
    // Remove trailing slash if present
    const url = process.env.FRONTEND_URL.replace(/\/$/, '');
    allowedOrigins.push(url);
  } catch (e) {
    console.error('Invalid FRONTEND_URL:', e);
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Test database connection
const pool = require('./config/db');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/procurement', require('./routes/procurement'));
app.use('/api/warehouse', require('./routes/warehouse'));


app.use('/api/stages', require('./routes/stages'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/parts', require('./routes/parts'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/diagnosis', require('./routes/diagnosis'));
app.use('/api/chip-repair', require('./routes/chipLevel'));
app.use('/api/leads', require('./routes/leads'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API health with DB check
app.get('/api/health', async (req, res) => {
  try {
    const pool = require('./config/db');
    await pool.query('SELECT 1');
    res.json({
      success: true,
      message: 'Server and database OK',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Laptop Refurbishment API',
    version: '1.1.0',
    status: 'Bulk Move Feature Active',
    endpoints: {
      auth: '/api/auth',
      tickets: '/api/tickets',
      stages: '/api/stages',
      teams: '/api/teams',
      parts: '/api/parts',
      analytics: '/api/analytics'
    }
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  }

  startEmailQueueWorker().catch((err) => console.error('Email queue worker failed:', err.message));
  startInventorySyncWorker().catch((err) => console.error('ERP inventory sync worker failed:', err.message));
  startLeadEmailIngestionWorker().catch((err) => console.error('Lead email ingestion worker failed:', err.message));
});

module.exports = app;