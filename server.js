const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const UPLOAD_ROOT_DIR = path.join(__dirname, 'uploads');

// Zorg ervoor dat de hoofd upload directory bestaat
if (!fs.existsSync(UPLOAD_ROOT_DIR)) {
    fs.mkdirSync(UPLOAD_ROOT_DIR, { recursive: true });
}

// --- Middleware: CORS ---
// Dit zorgt ervoor dat ANDERE web applicaties data van deze server kunnen ophalen
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // Sta iedereen toe (voor dev)
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// --- Multer Opslag Configuratie ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Door de fix in de frontend zijn req.body.folderName en collectionName nu wel beschikbaar
        const folderName = req.body.folderName ? req.body.folderName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'unsorted';
        const collectionName = req.body.collectionName ? req.body.collectionName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'misc';
        
        const targetDir = path.join(UPLOAD_ROOT_DIR, folderName, collectionName);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        // Sla op met een schone naam. Als frontend 'Mijn Icoon' stuurt, wordt dit 'mijn_icoon.png'
        const rawName = req.body.iconName || file.originalname.split('.')[0];
        const safeName = rawName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const ext = path.extname(file.originalname);
        // We voegen geen timestamp toe zodat de bestandsnaam voorspelbaar blijft voor de externe API
        cb(null, safeName + ext);
    }
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static('public')); 
app.use('/uploads', express.static(UPLOAD_ROOT_DIR));

// --- API: Upload ---
app.post('/api/upload-icon', upload.single('iconFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Geen bestand geüpload.' });
    }
    const relativePath = path.relative(UPLOAD_ROOT_DIR, req.file.path);
    const iconUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;

    res.status(200).json({
        success: true,
        iconUrl: iconUrl
    });
});

// --- API: Zoek Icoon voor Externe Apps ---
// Gebruik: GET /api/serve-icon/mijn_icoon_naam
app.get('/api/serve-icon/:name', (req, res) => {
    const searchName = req.params.name.toLowerCase();
    
    // Hulpfunctie om recursief te zoeken
    const findFileRecursively = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                const found = findFileRecursively(fullPath);
                if (found) return found;
            } else {
                // Check of de bestandsnaam overeenkomt (zonder extensie)
                const baseName = path.basename(file, path.extname(file));
                if (baseName === searchName) {
                    return fullPath;
                }
            }
        }
        return null;
    };

    try {
        const filePath = findFileRecursively(UPLOAD_ROOT_DIR);
        
        if (filePath) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('Icoon niet gevonden');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server fout tijdens zoeken');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 IconVault Backend draait op http://localhost:${PORT}`);
});
