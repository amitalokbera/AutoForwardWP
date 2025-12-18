const express = require('express');
const path = require('path');
const WhatsAppForwardService = require('./whatsappService');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

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

app.post('/set-last-check-time', (req, res) => {
    whatsappService.setLastCheckTime(req.body.time);
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

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app;