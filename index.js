const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Status Check
app.get('/', (req, res) => {
    res.send("Server Status: Online");
});

// Google Authentication Helper
async function getDoc() {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        const auth = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(process.env.SHEET_ID, auth);
        await doc.loadInfo();
        return doc;
    } catch (err) {
        console.error("Auth Error:", err.message);
        throw err;
    }
}

// Route 1: ymotAskAI (שליחת שאלה)
app.all('/api/ymotAskAI', async (req, res) => {
    const phone = req.query.ApiPhone || "unknown";
    const question = req.query.question_text;

    if (!question) {
        return res.send("id_list_message=t-no_question");
    }

    try {
        // 1. Fetch response from Gemini AI
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: question }] }]
            })
        });
        
        const data = await aiResponse.json();
        const aiAnswer = data.candidates[0].content.parts[0].text;
        
        // Clean Hebrew text for Yemot Hamashiah
        const cleanAnswer = aiAnswer.replace(/[^\u0590-\u05FF0-9 ,.?!"']/g, '');

        // 2. Add to Google Sheets (Using Array for stability)
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        
        if (!sheet) {
            console.error("Sheet tab 'מענה AI' not found!");
            return res.status(500).send("id_list_message=t-error_no_sheet");
        }

        // שימוש במערך לפי סדר העמודות: זמן, מספר שורה, טקסט השאלה, טקסט מסונן
        await sheet.addRow([
            new Date().toLocaleString('he-IL'), 
            phone, 
            question, 
            cleanAnswer
        ]);

        console.log("Success: Row added to sheet");
        res.send("id_list_message=t-שאלתך התקבלה, אנא המתן למענה");
    } catch (error) {
        console.error("AskAI Error:", error.message);
        res.send("id_list_message=t-חלה שגיאה בעיבוד השאלה");
    }
});

// Route 2: ymotReadAI (קבלת תשובה)
app.all('/api/ymotReadAI', async (req, res) => {
    try {
        const phone = req.query.ApiPhone;
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        const rows = await sheet.getRows();

        // Find last record by phone number
        const userRow = [...rows].reverse().find(row => row.get("מספר שורה") === String(phone));

        if (userRow && userRow.get("טקסט מסונן")) {
            const answer = userRow.get("טקסט מסונן");
            res.send(`id_list_message=t-${answer}`);
        } else {
            res.send("id_list_message=t-טרם התקבל מענה, נסה שוב בעוד רגע");
        }
    } catch (error) {
        console.error("ReadAI Error:", error.message);
        res.send("id_list_message=t-שגיאה בקריאת הנתונים");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
