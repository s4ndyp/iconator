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
        db.folders = [{ id: 'f1', name: "Demo Map", icon: "folder" }];
        db.collections = [{ id: 'c1', folderId: 'f1', name: "General", description: "Start collectie" }];
        saveDB();
    }
}
function saveDB() {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.error("DB Save Error", e); }
}

loadDB();

// --- MULTER CONFIG ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const colId = req.body.collectionId || 'default';
        const dir = path.join(UPLOAD_ROOT_DIR, colId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

// --- API ROUTES ---

// 1. GET DATA
app.get('/api/data', (req, res) => {
    res.json(db);
});

// 2. FOLDERS
app.post('/api/folders', (req, res) => {
    const newFolder = { id: 'f' + Date.now(), name: req.body.name, icon: 'folder' };
    db.folders.push(newFolder);
    saveDB();
    res.json(newFolder);
});
app.put('/api/folders/:id', (req, res) => {
    const f = db.folders.find(x => x.id === req.params.id);
    if(f) { f.name = req.body.name || f.name; saveDB(); res.json(f); } 
    else res.status(404).json({error: "Niet gevonden"});
});
app.delete('/api/folders/:id', (req, res) => {
    const id = req.params.id;
    // Verwijder folder, collecties en iconen cascade
    const cols = db.collections.filter(c => c.folderId === id);
    cols.forEach(c => {
        const icons = db.icons.filter(i => i.collectionId === c.id);
        icons.forEach(i => { if(fs.existsSync(i.filePath)) fs.unlinkSync(i.filePath); });
    });
    db.icons = db.icons.filter(i => !cols.find(c => c.id === i.collectionId));
    db.collections = db.collections.filter(c => c.folderId !== id);
    db.folders = db.folders.filter(f => f.id !== id);
    saveDB();
    res.json({success: true});
});

// 3. COLLECTIONS
app.post('/api/collections', (req, res) => {
    const newCol = { id: 'c' + Date.now(), folderId: req.body.folderId, name: req.body.name };
    db.collections.push(newCol);
    saveDB();
    res.json(newCol);
});
app.put('/api/collections/:id', (req, res) => {
    const c = db.collections.find(x => x.id === req.params.id);
    if(c) { c.name = req.body.name || c.name; saveDB(); res.json(c); }
    else res.status(404).json({error: "Niet gevonden"});
});
app.delete('/api/collections/:id', (req, res) => {
    const id = req.params.id;
    const icons = db.icons.filter(i => i.collectionId === id);
    icons.forEach(i => { if(fs.existsSync(i.filePath)) fs.unlinkSync(i.filePath); });
    db.icons = db.icons.filter(i => i.collectionId !== id);
    db.collections = db.collections.filter(c => c.id !== id);
    saveDB();
    res.json({success: true});
});

// 4. UPLOAD
app.post('/api/upload-icon', upload.single('iconFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Geen bestand' });

    const collectionId = req.body.collectionId;
    const folderId = req.body.folderId;
    const width = parseInt(req.body.width) || 0;
    const height = parseInt(req.body.height) || 0;
    const tags = req.body.iconTags ? req.body.iconTags.split(',') : [];

    const newIcon = {
        id: 'i' + Date.now() + Math.random().toString(36).substr(2, 5),
        collectionId: collectionId,
        folderId: folderId, // Denormalisatie voor sneller filteren
        name: req.body.iconName || req.file.originalname,
        originalName: req.file.originalname,
        fileName: req.file.filename,
        filePath: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype,
        width: width,
        height: height,
        tags: tags,
        dateAdded: new Date().toISOString(),
        url: `/uploads/${collectionId}/${req.file.filename}` 
    };

    db.icons.push(newIcon);
    saveDB();
    res.json(newIcon);
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

// --- NIEUWE SLIMME SERVE FUNCTIE ---
app.get('/api/serve-icon/:query', (req, res) => {
    const query = req.params.query.toLowerCase();
    
    // 1. Probeer extensie te detecteren (bijv. "huis.svg")
    const parts = query.split('.');
    let requestedExt = null;
    let searchName = query;
    
    if (parts.length > 1) {
        requestedExt = '.' + parts.pop(); // haal laatste deel weg (.svg)
        searchName = parts.join('.'); // de rest is de naam
    }

    // 2. Score alle iconen
    const candidates = db.icons.map(icon => {
        let score = 0;
        const dbName = icon.name.toLowerCase();
        const dbExt = path.extname(icon.originalName).toLowerCase();

        // SCORING LOGICA
        if (dbName === searchName) score += 100;           // Exacte naam match
        else if (dbName === query) score += 100;           // Exacte match inclusief extensie input
        else if (dbName.startsWith(searchName)) score += 50; // Begint met...
        else if (dbName.includes(searchName)) score += 20;   // Bevat...

        if (requestedExt && dbExt === requestedExt) score += 50; // Gebruiker vroeg specifiek formaat (bijv .svg)
        
        // Bonus voor vectoren als er geen specifieke extensie gevraagd is
        if (!requestedExt && dbExt === '.svg') score += 10; 

        return { icon, score };
    });

    // 3. Filter alleen relevante resultaten en sorteer op score
    // We willen alleen resultaten die enige relevantie hebben (score > 0)
    const bestMatches = candidates
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score);

    // 4. Serveer de winnaar
    if (bestMatches.length > 0) {
        const winner = bestMatches[0].icon;
        
        // Optioneel: Logica als er twijfel is (bijv. logging)
        // console.log(`Served ${winner.name} (Score: ${bestMatches[0].score}) for query "${query}"`);

        if (fs.existsSync(winner.filePath)) {
            res.sendFile(path.resolve(winner.filePath));
        } else {
            res.status(404).send('Bestand fysiek niet gevonden');
        }
    } else {
        // Fallback: Misschien een standaard placeholder?
        res.status(404).send('Geen icoon gevonden dat matcht met: ' + query);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`- API: http://localhost:${PORT}/api/data`);
    console.log(`- Smart Serve: http://localhost:${PORT}/api/serve-icon/:name`);
});
