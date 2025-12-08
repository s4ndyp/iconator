const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

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
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- ROUTES ---

// 1. GET DATA
app.get('/api/data', (req, res) => res.json(db));

// 2. UPLOAD ICON
app.post('/api/upload-icon', upload.single('iconFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Geen bestand.' });

    const desiredName = req.body.iconName || req.file.originalname;
    
    // Check duplicate
    const exists = db.icons.find(i => i.name.toLowerCase() === desiredName.toLowerCase());
    if (exists) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(409).json({ message: `De naam '${desiredName}' bestaat al.` });
    }

    const dir = path.dirname(req.file.path);
    const ext = path.extname(req.file.originalname);
    const safeFilename = desiredName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ext;
    const newPath = path.join(dir, safeFilename);

    try { fs.renameSync(req.file.path, newPath); } catch(e) { return res.status(500).json({ message: 'Fout bij opslaan.' }); }

    const relativePath = path.relative(UPLOAD_ROOT_DIR, newPath);
    const iconUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;

    const newIcon = {
        id: Date.now().toString(),
        collectionId: req.body.collectionId,
        name: desiredName,
        filename: safeFilename,
        tags: req.body.iconTags ? req.body.iconTags.split(',') : [],
        url: iconUrl,
        filePath: newPath,
        width: parseInt(req.body.width),
        height: parseInt(req.body.height),
        size: req.file.size,
        dateAdded: new Date().toISOString()
    };

    db.icons.push(newIcon);
    saveDB();
    res.json({ success: true, icon: newIcon });
});

// 3. FOLDERS
app.post('/api/folders', (req, res) => {
    const newFolder = { id: `f${Date.now()}`, name: req.body.name, icon: 'folder' };
    db.folders.push(newFolder);
    saveDB();
    res.json(newFolder);
});

// NIEUW: Hernoem map
app.put('/api/folders/:id', (req, res) => {
    const folder = db.folders.find(f => f.id === req.params.id);
    if (folder) {
        folder.name = req.body.name;
        saveDB();
        res.json(folder);
    } else {
        res.status(404).json({ message: 'Map niet gevonden' });
    }
});

// NIEUW: Verwijder map (Cascade delete: collecties + iconen)
app.delete('/api/folders/:id', (req, res) => {
    const folderId = req.params.id;
    const folderIndex = db.folders.findIndex(f => f.id === folderId);
    
    if (folderIndex > -1) {
        // Verwijder folder
        db.folders.splice(folderIndex, 1);

        // Vind alle collecties in deze folder
        const collectionsToDelete = db.collections.filter(c => c.folderId === folderId);
        const collectionIds = collectionsToDelete.map(c => c.id);

        // Verwijder collecties uit DB
        db.collections = db.collections.filter(c => c.folderId !== folderId);

        // Verwijder alle iconen in deze collecties (en hun bestanden)
        const iconsToDelete = db.icons.filter(i => collectionIds.includes(i.collectionId));
        iconsToDelete.forEach(icon => {
            if (fs.existsSync(icon.filePath)) {
                try { fs.unlinkSync(icon.filePath); } catch(e) {}
            }
        });
        db.icons = db.icons.filter(i => !collectionIds.includes(i.collectionId));

        saveDB();
        res.json({ success: true });
    } else {
        res.status(404).json({ message: 'Map niet gevonden' });
    }
});

// 4. COLLECTIONS
app.post('/api/collections', (req, res) => {
    const newCol = { id: `c${Date.now()}`, folderId: req.body.folderId, name: req.body.name, description: req.body.description };
    db.collections.push(newCol);
    saveDB();
    res.json(newCol);
});

// NIEUW: Hernoem collectie
app.put('/api/collections/:id', (req, res) => {
    const col = db.collections.find(c => c.id === req.params.id);
    if (col) {
        col.name = req.body.name;
        saveDB();
        res.json(col);
    } else {
        res.status(404).json({ message: 'Collectie niet gevonden' });
    }
});

// NIEUW: Verwijder collectie
app.delete('/api/collections/:id', (req, res) => {
    const colId = req.params.id;
    const colIndex = db.collections.findIndex(c => c.id === colId);

    if (colIndex > -1) {
        db.collections.splice(colIndex, 1);

        // Verwijder iconen
        const iconsToDelete = db.icons.filter(i => i.collectionId === colId);
        iconsToDelete.forEach(icon => {
            if (fs.existsSync(icon.filePath)) {
                try { fs.unlinkSync(icon.filePath); } catch(e) {}
            }
        });
        db.icons = db.icons.filter(i => i.collectionId !== colId);

        saveDB();
        res.json({ success: true });
    } else {
        res.status(404).json({ message: 'Collectie niet gevonden' });
    }
});

// 5. ICONS
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

app.get('/api/serve-icon/:name', (req, res) => {
    const searchName = req.params.name.toLowerCase();
    const icon = db.icons.find(i => i.name.toLowerCase().replace(/[^a-z0-9]/gi, '_') === searchName);
    
    if (icon && fs.existsSync(icon.filePath)) {
        res.sendFile(icon.filePath);
    } else {
        res.status(404).send('Icoon niet gevonden.');
    }
});

app.listen(PORT, () => {
    console.log(`Server draait op http://localhost:${PORT}`);
});
