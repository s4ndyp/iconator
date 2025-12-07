const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const archiver = require('archiver');

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

// --- DATABASE ---
let db = { folders: [], collections: [], icons: [] };

function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
        } catch (e) { console.error("DB Load Error", e); }
    } else {
        // Defaults
        db.folders = [{ id: 'f1', name: "Demo Map", icon: "folder" }];
        db.collections = [{ id: 'c1', folderId: 'f1', name: "General", description: "Start collectie" }];
        saveDB();
    }
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
loadDB();

// --- MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderName = req.body.folderName ? req.body.folderName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'unsorted';
        const collectionName = req.body.collectionName ? req.body.collectionName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'misc';
        const targetDir = path.join(UPLOAD_ROOT_DIR, folderName, collectionName);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        // We slaan op met een tijdelijke naam, de definitieve logica zit in de route handler
        // zodat we duplicates kunnen checken voordat we definitief bevestigen
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- ROUTES ---

app.get('/api/data', (req, res) => res.json(db));

// Upload Route met Unieke Naam Check
app.post('/api/upload-icon', upload.single('iconFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Geen bestand.' });

    const desiredName = req.body.iconName || req.file.originalname;
    
    // CHECK: Unieke naam in de hele database (om verwarring bij API gebruik te voorkomen)
    // Of wil je uniek per collectie? Meestal is uniek per systeem beter voor een API.
    const exists = db.icons.find(i => i.name.toLowerCase() === desiredName.toLowerCase());

    if (exists) {
        // VERWIJDER het bestand direct weer, want we accepteren het niet
        fs.unlinkSync(req.file.path);
        return res.status(409).json({ message: `De naam '${desiredName}' bestaat al. Kies een unieke naam.` });
    }

    // Hernoem bestand naar de nette naam
    const dir = path.dirname(req.file.path);
    const ext = path.extname(req.file.originalname);
    const safeFilename = desiredName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ext;
    const newPath = path.join(dir, safeFilename);

    try {
        fs.renameSync(req.file.path, newPath);
    } catch(e) {
        return res.status(500).json({ message: 'Fout bij opslaan bestand.' });
    }

    const relativePath = path.relative(UPLOAD_ROOT_DIR, newPath);
    const iconUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;

    const newIcon = {
        id: Date.now().toString(),
        collectionId: req.body.collectionId,
        name: desiredName, // De display naam
        filename: safeFilename, // De technische naam
        tags: req.body.iconTags ? req.body.iconTags.split(',') : [],
        url: iconUrl,
        filePath: newPath,
        width: parseInt(req.body.width),
        height: parseInt(req.body.height),
        color: req.body.color,
        size: req.file.size,
        dateAdded: new Date().toISOString()
    };

    db.icons.push(newIcon);
    saveDB();

    res.json({ success: true, icon: newIcon });
});

app.post('/api/folders', (req, res) => {
    const newFolder = { id: `f${Date.now()}`, name: req.body.name, icon: 'folder' };
    db.folders.push(newFolder);
    saveDB();
    res.json(newFolder);
});

app.post('/api/collections', (req, res) => {
    const newCol = { id: `c${Date.now()}`, folderId: req.body.folderId, name: req.body.name, description: req.body.description };
    db.collections.push(newCol);
    saveDB();
    res.json(newCol);
});

app.delete('/api/icons/:id', (req, res) => {
    const idx = db.icons.findIndex(i => i.id === req.params.id);
    if (idx > -1) {
        const icon = db.icons[idx];
        if (fs.existsSync(icon.filePath)) {
            try { fs.unlinkSync(icon.filePath); } catch(e) {}
        }
        db.icons.splice(idx, 1);
        saveDB();
        res.json({ success: true });
    } else {
        res.status(404).json({ message: 'Niet gevonden' });
    }
});

// Serve Icon API (Voor externe apps)
app.get('/api/serve-icon/:name', (req, res) => {
    const searchName = req.params.name.toLowerCase();
    const icon = db.icons.find(i => i.name.toLowerCase().replace(/[^a-z0-9]/gi, '_') === searchName);
    
    if (icon && fs.existsSync(icon.filePath)) {
        res.sendFile(icon.filePath);
    } else {
        res.status(404).send('Icoon niet gevonden.');
    }
});

// Server-side ZIP (alleen voor opgeslagen items als backup)
// De "Smart Generator" doen we in de frontend om server load te besparen
app.get('/api/download-zip/:id', (req, res) => {
    const icon = db.icons.find(i => i.id === req.params.id);
    if (!icon) return res.status(404).send('Niet gevonden');

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment(`${icon.name}_backup.zip`);
    archive.pipe(res);
    archive.file(icon.filePath, { name: path.basename(icon.filePath) });
    archive.finalize();
});

app.listen(PORT, () => {
    console.log(`Server draait op http://localhost:${PORT}`);
});
