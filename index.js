const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fetch = require('node-fetch'); // חובה לוודא שזה מופיע ב-package.json

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function getDoc() {
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
    const serviceAccountAuth = new JWT({
        email: credentials.client_email,
        key: credentials.private_key.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    return doc;
}

// פונקציית עזר לפנייה ל-Gemini
async function callGemini(question) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ענה בקצרה ובשפה פשוטה: " + question }] }] })
    });
    const json = await response.json();
    return json.candidates[0].content.parts[0].text;
}

// שלוחה 1: קבלת השאלה ועיבודה המיידי
app.all('/api/ymotAskAI', async (req, res) => {
    try {
        const question = req.query.question_text || "אין שאלה";
        const phone = req.query.ApiPhone || "לא ידוע";
        
        // פנייה ל-AI וניקוי סימנים להקראה טלפונית
        const aiRawAnswer = await callGemini(question);
        const cleanAnswer = aiRawAnswer.replace(/[*#_`]/g, "").trim();

        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["معנה AI"]; // וודא שזה שם הטאב
        
        await sheet.addRow({ 
            "זמן": new Date().toLocaleString('he-IL'), 
            "מספר שורה": phone, 
            "טקסט השאלה": question,
            "טקסט מסונן": cleanAnswer 
        });
        
        res.send("id_list_message=t-שאלתך עובדה, המתן להקראה");
    } catch (error) {
        res.send("id_list_message=t-חלה שגיאה בעיבוד");
    }
});

// שלוחה 2: הקראת התשובה (נשארת ללא שינוי)
app.all('/api/ymotReadAI', async (req, res) => {
    try {
        const phone = req.query.ApiPhone;
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        const rows = await sheet.getRows();
        let userRow = rows.reverse().find(r => r.get("מספר שורה") === String(phone));
        
        if (userRow && userRow.get("טקסט מסונן")) {
            res.send(`id_list_message=t-${userRow.get("טקסט מסונן")}`);
        } else {
            res.send("id_list_message=t-התשובה עדיין לא מוכנה");
        }
    } catch (error) { res.send("id_list_message=t-שגיאה במשיכת נתונים"); }
});

module.exports = app;
