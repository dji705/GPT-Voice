const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT;

async function getDoc() {
    if (!GOOGLE_SERVICE_ACCOUNT || !SHEET_ID) {
        throw new Error("שגיאת קונפיגורציה: חסרים סודות במשתני הסביבה");
    }
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

// שלוחה 1: קבלת השאלה
app.all('/api/ymotAskAI', async (req, res) => {
    try {
        const question = req.query.question_text || req.body.question_text;
        const phone = req.query.ApiPhone || "לא ידוע";
        if (!question) return res.send("id_list_message=t-לא זוהתה הקשה");
        
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        await sheet.addRow({ "זמן": new Date().toLocaleString(), "מספר שורה": phone, "טקסט השאלה": question });
        
        res.send("id_list_message=t-שאלתך התקבלה המתן מספר שניות לתשובה");
    } catch (error) { res.send("id_list_message=t-חלה שגיאה ברישום"); }
});

// שלוחה 2: הקראת התשובה
app.all('/api/ymotReadAI', async (req, res) => {
    try {
        const phone = req.query.ApiPhone;
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        const rows = await sheet.getRows();
        let userRow = null;
        for (let i = rows.length - 1; i >= 0; i--) {
            if (String(rows[i].get("מספר שורה")) === String(phone)) {
                userRow = rows[i];
                break;
            }
        }
        if (userRow && userRow.get("טקסט מסונן")) {
            res.send(`id_list_message=t-${userRow.get("טקסט מסונן")}`);
        } else {
            res.send("id_list_message=t-התשובה עדיין לא מוכנה");
        }
    } catch (error) { res.send("id_list_message=t-שגיאה במשיכת הנתונים"); }
});

// ייצוא האפליקציה עבור Vercel
module.exports = app;