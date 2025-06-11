require('dotenv').config();
const express = require('express');
const os = require('os');
const rateLimit = require('express-rate-limit');
const app = express();
const port = process.env.WEBHOOK_PORT || 3001;

// Replace with actual bot instance export
const { client } = require('./main'); // Import your Discord bot client

// Allowed IPs and Auth Key
const ALLOWED_IPS = ['127.0.0.1', '::1']; // Add trusted server IPs here
const AUTH_KEY = process.env.WEBHOOK_AUTH_KEY; // Set this in .env

// Rate limiter: max 5 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many requests, please try again later.' }
});

app.use(limiter);
app.use(express.json());

// IP and Auth check middleware
app.use('*', (req, res, next) => {
  const ip = req.ip;
  const authHeader = req.headers['auth-key'];

  if (!ALLOWED_IPS.includes(ip)) {
    return res.status(403).json({ error: 'Forbidden: IP not allowed.' });
  }

  if (!authHeader || authHeader !== AUTH_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Auth Key.' });
  }

  next();
});

// System Info API Endpoint
app.post('/api/system', async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuLoad = os.loadavg();
    const uptime = process.uptime();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const arch = os.arch();
    const cpuCount = os.cpus().length;

    // Discord bot info
    const guildCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const shard = client.shard ? client.shard.ids : ['No Sharding'];
    
    res.json({
      bot: {
        tag: client.user.tag,
        id: client.user.id,
        uptime: `${Math.floor(uptime / 60)} minutes`,
        shard,
        guildCount,
        userCount
      },
      system: {
        platform,
        arch,
        cpuCount,
        cpuLoad,
        totalMem,
        freeMem,
        memoryUsage,
        uptime: `${Math.floor(uptime / 60)} minutes`
      }
    });
  } catch (err) {
    console.error('Error generating system info:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`✅ Discord API server listening on port ${port}`);
});
