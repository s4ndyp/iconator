const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto'); // Voor hash/duplicaat check
const archiver = require('archiver'); // Voor ZIP downloads

const app = express();
const PORT = 3000;
const UPLOAD_ROOT_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// --- SETUP ---
if (!fs.existsSync(UPLOAD_ROOT_DIR)) fs.mkdirSync(UPLOAD_ROOT_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_ROOT_DIR));

// --- SIMPLE JSON DATABASE SYSTEM (Feature 1) ---
let db = { folders: [], collections: [], icons: [] };

// Initialiseer DB met default data als hij leeg is
function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
        } catch (e) {
            console.error("Fout bij laden DB, start nieuw.", e);
        }
    } else {
        // Default structuur
        db.folders = [
            { id: 'f1', name: "Design System", icon: "monitor" },
            { id: 'f2', name: "Marketing", icon: "megaphone" }
        ];
        db.collections = [
            { id: 'c1', folderId: 'f1', name: "General UI", description: "Basis elementen" }
        ];
        saveDB();
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

loadDB(); // Starten

// --- HELPER: Bereken File Hash (Feature 14) ---
function getFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// --- MULTER CONFIG ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderName = req.body.folderName ? req.body.folderName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'unsorted';
        const collectionName = req.body.collectionName ? req.body.collectionName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'misc';
        const targetDir = path.join(UPLOAD_ROOT_DIR, folderName, collectionName);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        const rawName = req.body.iconName || file.originalname.split('.')[0];
        const safeName = rawName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const ext = path.extname(file.originalname);
        cb(null, `${safeName}-${Date.now()}${ext}`);
    }
});

// SVG Toestaan (Feature 2)
const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'image/svg+xml') {
            cb(null, true);
        } else {
            cb(new Error('Alleen afbeeldingen (JPG, PNG, SVG) zijn toegestaan.'));
        }
    }
});

// --- API ROUTES ---

// 1. Data Ophalen
app.get('/api/data', (req, res) => {
    res.json(db);
});

// 2. Uploaden (Met Hash check & DB update)
app.post('/api/upload-icon', upload.single('iconFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Geen bestand.' });

    try {
        const hash = await getFileHash(req.file.path);

        // Feature 14: Duplicaat Check
        const existing = db.icons.find(i => i.hash === hash && i.collectionId === req.body.collectionId);
        if (existing) {
            // Verwijder het zojuist geuploade bestand weer, want we hebben hem al
            fs.unlinkSync(req.file.path);
            return res.status(409).json({ success: false, message: 'Dit bestand bestaat al in deze collectie.', existingIcon: existing });
        }

        const relativePath = path.relative(UPLOAD_ROOT_DIR, req.file.path);
        const iconUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;

        const newIcon = {
            id: Date.now().toString(),
            collectionId: req.body.collectionId,
            name: req.body.iconName,
            tags: req.body.iconTags ? req.body.iconTags.split(',') : [],
            url: iconUrl,
            filePath: req.file.path, // Voor interne bewerkingen/zipping
            hash: hash,
            width: req.body.width,
            height: req.body.height,
            color: req.body.color, // Feature 18
            size: req.file.size,
            mime: req.file.mimetype,
            dateAdded: new Date().toISOString()
        };

        db.icons.push(newIcon);
        saveDB();

        res.json({ success: true, icon: newIcon });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server fout.' });
    }
});

// 3. Nieuwe Map/Collectie
app.post('/api/folders', (req, res) => {
    const newFolder = { id: `f${Date.now()}`, name: req.body.name, icon: 'folder' };
    db.folders.push(newFolder);
    saveDB();
    res.json(newFolder);
});

app.post('/api/collections', (req, res) => {
    const newCol = { 
        id: `c${Date.now()}`, 
        folderId: req.body.folderId, 
        name: req.body.name, 
        description: req.body.description || '' 
    };
    db.collections.push(newCol);
    saveDB();
    res.json(newCol);
});

// 4. Verwijderen
app.delete('/api/icons/:id', (req, res) => {
    const iconIndex = db.icons.findIndex(i => i.id === req.params.id);
    if (iconIndex > -1) {
        const icon = db.icons[iconIndex];
        // Feature 6 (Prullenbak) - Voor nu doen we een hard delete van disk om ruimte te besparen
        // In productie zou je een 'deletedAt' veld zetten.
        try {
            if (fs.existsSync(icon.filePath)) fs.unlinkSync(icon.filePath);
        } catch(e) { console.error("Kon bestand niet wissen", e); }
        
        db.icons.splice(iconIndex, 1);
        saveDB();
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// Feature 5: Download ZIP pakket
app.get('/api/download-zip/:iconId', (req, res) => {
    const icon = db.icons.find(i => i.id === req.params.iconId);
    if (!icon || !fs.existsSync(icon.filePath)) return res.status(404).send('Icoon niet gevonden');

    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment(`${icon.name.replace(/\s+/g, '_')}_package.zip`);
    archive.pipe(res);

    // Voeg origineel toe
    archive.file(icon.filePath, { name: `original${path.extname(icon.filePath)}` });

    // In een echte app zou je hier 'sharp' gebruiken om te resizen.
    // Omdat we geen native modules willen, voegen we een readme toe.
    archive.append('Gegenereerd door IconVault.\n', { name: 'info.txt' });

    archive.finalize();
});

// Serve Icon Route (Externe API)
app.get('/api/serve-icon/:name', (req, res) => {
    const searchName = req.params.name.toLowerCase();
    const icon = db.icons.find(i => i.name.toLowerCase().replace(/\s+/g, '_') === searchName);
    if (icon && fs.existsSync(icon.filePath)) {
        res.sendFile(icon.filePath);
    } else {
        res.status(404).send('Niet gevonden');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 IconVault Server v2.0 draait op http://localhost:${PORT}`);
    console.log(`📂 Opslag: ${UPLOAD_ROOT_DIR}`);
    console.log(`💾 Database: ${DB_FILE}`);
});
