const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Database
if (!fs.existsSync(DB_FILE)) {
    const initialData = { users: [], emissions: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE);
        return JSON.parse(data);
    } catch (err) {
        return { users: [], emissions: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Helper: Generate simple token
const generateToken = () => Math.random().toString(36).substr(2);

// ================= ROUTES =================

// 1. REGISTER
app.post('/api/auth/register', (req, res) => {
    const { name, email, username, password, accountType, gender } = req.body;
    const db = readDB();

    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    const newUser = {
        id: Date.now().toString(),
        name,
        email,
        username,
        password, // In a real app, hash this!
        accountType,
        gender,
        ecoCoins: 100, // Sign up bonus
        joinedDate: new Date().toISOString()
    };

    db.users.push(newUser);
    writeDB(db);

    res.status(201).json({ message: 'User registered successfully' });
});

// 2. LOGIN
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();

    const user = db.users.find(u => u.username === username && u.password === password);

    if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Return user info (excluding password)
    const { password: _, ...userWithoutPass } = user;
    res.json({
        token: generateToken(), // Mock token
        ...userWithoutPass
    });
});

// MIDDLEWARE to mimic auth check (using token presence)
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'No token provided' });
    // In a real app, verify token. Here we just accept it.
    next();
};

// 3. DASHBOARD SUMMARY
app.get('/api/dashboard/summary', authenticate, (req, res) => {
    const db = readDB();
    const history = db.emissions;

    // Calculate summary
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const daily = history.filter(e => e.date.startsWith(today))
        .reduce((sum, e) => sum + e.totalEmissions, 0);

    const monthly = history.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).reduce((sum, e) => sum + e.totalEmissions, 0);

    const yearly = history.filter(e => new Date(e.date).getFullYear() === currentYear)
        .reduce((sum, e) => sum + e.totalEmissions, 0);

    // Find highest contributor category
    const categoryTotals = {};
    history.forEach(e => {
        if (!categoryTotals[e.category]) categoryTotals[e.category] = 0;
        categoryTotals[e.category] += e.totalEmissions;
    });
    let highestContributor = 'none';
    let maxVal = 0;
    for (const [cat, val] of Object.entries(categoryTotals)) {
        if (val > maxVal) {
            maxVal = val;
            highestContributor = cat;
        }
    }

    res.json({
        summary: { daily, monthly, yearly },
        highestContributor,
        isEstimated: history.length === 0
    });
});

// 4. DASHBOARD STATS
app.get('/api/dashboard/stats', authenticate, (req, res) => {
    const db = readDB();
    res.json({
        completedTasks: 3, // Mock value
        daysTracked: new Set(db.emissions.map(e => e.date.split('T')[0])).size || 1
    });
});

// 5. EMISSIONS HISTORY
app.get('/api/emissions/history', authenticate, (req, res) => {
    const db = readDB();
    const { category } = req.query;

    let history = db.emissions;
    if (category) {
        history = history.filter(e => e.category.toLowerCase() === category.toLowerCase());
    }

    // Sort newest first
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(history);
});

// 6. CALCULATE & SAVE
app.post('/api/emissions/calculate', authenticate, (req, res) => {
    const { type, data, accountType } = req.body;

    let emissions = 0;
    const COF = { // Carbon Emission Factors
        electricity: 0.85, // kg CO2 per kWh (India avg)
        gas: 2.98, // kg CO2 per kg LPG
        grocery: 2.5 // Avg kg CO2 per item (Simplified)
    };

    if (type === 'electricity') {
        emissions = data.units * COF.electricity;
    } else if (type === 'gas') {
        emissions = data.kg * COF.gas;
    } else if (type === 'grocery') {
        if (data.items && Array.isArray(data.items)) {
            data.items.forEach(item => {
                emissions += (item.quantity * 0.5);
            });
        }
    } else {
        return res.status(400).json({ message: 'Invalid type' });
    }

    // --- ENHANCED ANALYSIS ---
    let isFamily = (accountType === 'family');
    let limit = isFamily ? 150 : 50; // Dynamic thresholds
    let statusLabel = 'Safe';
    let suggestions = [];

    if (emissions > limit) {
        statusLabel = 'Danger - High Impact';

        if (type === 'electricity') {
            suggestions = [
                "Switch to LED bulbs immediately to cut lighting costs by 50%.",
                "Unplug devices like TVs and computers when not in use (Vampire Power).",
                "Consider servicing your AC units; clogged filters increase power by 15%."
            ];
        } else if (type === 'gas') {
            suggestions = [
                "Use pressure cookers to speed up cooking and save gas.",
                "Ensure the flame is blue; yellow flame indicates wastage.",
                "Cover pans while cooking to retain heat and cook faster."
            ];
        } else if (type === 'grocery') {
            suggestions = [
                "Avoid single-use plastics; they add significant hidden carbon costs.",
                "Buy local and seasonal produce to cut transport emissions.",
                "Reduce meat consumption; plant-based diets have lower footprints."
            ];
        }
    } else {
        statusLabel = 'Ok - Within Efficient Limits';
        suggestions = [
            "Great job! Keep maintaining this efficiency.",
            "Share your tips with friends to earn extra Eco Coins.",
            "Try to reduce by another 5% next time to reach 'Super Saver' status."
        ];
    }

    const newRecord = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        category: type,
        totalEmissions: emissions,
        details: data,
        analysis: { statusLabel, suggestions }
    };

    const db = readDB();
    db.emissions.push(newRecord);

    // Award coins
    if (db.users.length > 0) {
        db.users[0].ecoCoins += 20;
    }

    writeDB(db);

    res.json({
        totalEmissions: emissions,
        breakdown: { [type]: emissions },
        record: newRecord,
        statusLabel,
        suggestions
    });
});

// 7. ANALYZE BILL (AI MOCK)
app.post('/api/emissions/analyze-bill', authenticate, (req, res) => {
    const { billText } = req.body;
    const lowerText = billText.toLowerCase();

    let type = 'Unknown';
    if (lowerText.includes('electricity') || lowerText.includes('kwh')) type = 'Electricity';
    else if (lowerText.includes('gas') || lowerText.includes('lpg')) type = 'Gas';
    else if (lowerText.includes('food') || lowerText.includes('market') || lowerText.includes('store') || lowerText.includes('grocery')) type = 'Grocery';

    // Enhanced Randomized Mock Analysis
    let detectedItems = [];
    let carbonEmissions = 0;
    let reductionTips = [];

    if (type === 'Grocery') {
        detectedItems = [
            { name: 'Organic Apples', quantity: '1 kg', co2Impact: 0.4 },
            { name: 'Milk (Dairy)', quantity: '2 L', co2Impact: 3.8 },
            { name: 'Rice (Basmati)', quantity: '5 kg', co2Impact: 13.5 },
            { name: 'Chicken Breast', quantity: '500 g', co2Impact: 6.1 },
            { name: 'Single-Use Plastic Bags', quantity: '3 pcs', co2Impact: 0.9 }
        ];
        carbonEmissions = detectedItems.reduce((acc, item) => acc + item.co2Impact, 0);
        reductionTips = [
            "Opt for loose produce without plastic packaging.",
            "Consider plant-based milk alternatives like Oat or Soy.",
            "Bring your own reusable cloth bags to save ~1kg CO2 per trip."
        ];
    } else if (type === 'Electricity') {
        const units = Math.floor(Math.random() * 200) + 100;
        detectedItems = [{ name: 'Energy Consumption', quantity: `${units} kWh`, co2Impact: units * 0.85 }];
        carbonEmissions = units * 0.85;
        reductionTips = [
            "Shift high-energy usage to off-peak hours.",
            "Install a smart meter to monitor real-time consumption.",
            "Replace old appliances with 5-star rated energy efficient ones."
        ];
    } else {
        // Generic fallback
        type = 'Grocery';
        detectedItems = [
            { name: 'Assorted Vegetables', quantity: '2 kg', co2Impact: 1.5 },
            { name: 'Snacks & Processed Food', quantity: '4 packs', co2Impact: 2.8 }
        ];
        carbonEmissions = 4.3;
        reductionTips = ["Buy in bulk to reduce packaging waste."];
    }

    // Add randomization
    carbonEmissions = parseFloat((carbonEmissions * (0.9 + Math.random() * 0.2)).toFixed(2));

    let statusLabel = 'Fair';
    if (carbonEmissions < 10) statusLabel = 'Excellent - Low Impact';
    else if (carbonEmissions < 25) statusLabel = 'Good - Sustainable';
    else if (carbonEmissions < 50) statusLabel = 'Fair - Average Usage';
    else statusLabel = 'High - Attention Needed';

    const result = {
        billType: type,
        carbonEmissions,
        statusLabel,
        dominantContributor: { name: detectedItems[0].name, impact: detectedItems[0].co2Impact },
        detectedItems,
        reductionTips
    };

    res.json(result);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
