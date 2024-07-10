const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

// Electron webpage root
const PAGE_ROOT = `${__dirname}/gui_web/`
const ENTRY = "gui_electron.html";
const PORT = process.env.PORT || 1145;

const app = express();
app.use(express.static(PAGE_ROOT));
app.get('/', (req, res) => {
    res.sendFile(path.join(PAGE_ROOT, ENTRY));
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

