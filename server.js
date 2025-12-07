const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
// De hoofdmap voor alle uploads, relatief ten opzichte van dit script
const UPLOAD_ROOT_DIR = path.join(__dirname, 'uploads');

// Zorg ervoor dat de hoofd upload directory bestaat
if (!fs.existsSync(UPLOAD_ROOT_DIR)) {
    fs.mkdirSync(UPLOAD_ROOT_DIR, { recursive: true });
}

// --- Multer Opslag Configuratie ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // We halen de namen op uit de request body.
        // Let op: Multer verwerkt de body pas na de destination functie,
        // maar Multer maakt de tekstvelden beschikbaar in 'req.body' (als middleware)
        const folderName = req.body.folderName || 'Onbekende_Map';
        const collectionName = req.body.collectionName || 'Onbekende_Collectie';
        
        // Construeer de dynamische mapstructuur: /uploads/<folderName>/<collectionName>
        const targetDir = path.join(UPLOAD_ROOT_DIR, folderName, collectionName);

        // Maak de map(pen) recursief aan als deze nog niet bestaan
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        // Geef Multer de doellocatie
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        // Gebruik de originele bestandsnaam (of pas deze aan als je unieke namen wilt)
        // We gebruiken de veldnaam (iconFile) en voegen een timestamp toe om conflicten te voorkomen
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
        
        cb(null, baseName + '_' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// Middleware voor het parsen van JSON bodies
app.use(express.json());

// 1. Route om de statische frontend bestanden te serveren (index.html, etc.)
app.use(express.static('public')); 

// 2. Route om de geüploade bestanden te serveren
// De frontend zal deze route gebruiken om de iconen te tonen
app.use('/uploads', express.static(UPLOAD_ROOT_DIR));

// 3. De UPLOAD API ENDPOINT
app.post('/api/upload-icon', upload.single('iconFile'), (req, res) => {
    // Multer heeft het bestand opgeslagen en info toegevoegd aan req.file
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Geen bestand geüpload.' });
    }

    // Het pad van het bestand op de server
    const relativePath = path.relative(UPLOAD_ROOT_DIR, req.file.path);
    // De URL waarmee de client het bestand kan opvragen
    const iconUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;

    // Stuur een succesreactie terug met de publieke URL van het icoon
    res.status(200).json({
        success: true,
        message: 'Bestand succesvol geüpload en opgeslagen.',
        iconUrl: iconUrl,
        iconData: {
            name: req.body.iconName,
            folder: req.body.folderName,
            collection: req.body.collectionName,
        }
    });
});

// Start de server
app.listen(PORT, () => {
    console.log(`🚀 IconVault Backend draait op http://localhost:${PORT}`);
    console.log(`Uploads worden opgeslagen in: ${UPLOAD_ROOT_DIR}`);
});
