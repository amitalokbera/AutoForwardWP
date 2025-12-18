const express = require('express');
const path = require('path');
const WhatsAppForwardService = require('./whatsappService');
const app = express();
const port = 3000;

// Security middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Set secure headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

const whatsappService = new WhatsAppForwardService();

app.get('/status', (req, res) => {
    res.json(whatsappService.getStatus());
});

app.post('/set-tracker-numbers', (req, res) => {
    whatsappService.setTrackerNumbers(req.body.numbers);
    res.json({ success: true });
});

app.post('/set-forward-number', (req, res) => {
    whatsappService.setForwardNumber(req.body.number);
    res.json({ success: true });
});

app.post('/set-start-time-range', (req, res) => {
    whatsappService.setStartTimeRange(req.body.time);
    res.json({ success: true });
});

app.post('/set-end-time-range', (req, res) => {
    whatsappService.setEndTimeRange(req.body.time);
    res.json({ success: true });
});

app.post('/set-timezone', (req, res) => {
    whatsappService.setTimezone(req.body.timezone);
    res.json({ success: true });
});

app.post('/set-country-code', (req, res) => {
    whatsappService.setCountryCode(req.body.code);
    res.json({ success: true });
});

app.post('/initialize', async (req, res) => {
    try {
        await whatsappService.initialize();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/test', (req, res) => {
    const testResult = whatsappService.testConnection();
    res.json(testResult);
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app;