const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fetch = require('node-fetch');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// פונקציית חיבור לגוגל שיטס
async function getDoc() {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID, auth);
    await doc.loadInfo();
    return doc;
}

// --- ממשק אינטרנטי (Frontend) ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head><meta charset="UTF-8"><title>AI Bridge</title></head>
    <body style="font-family:sans-serif; display:flex; justify-content:center; padding-top:50px; background:#f4f7f6;">
        <div style="background:white; padding:30px; border-radius:15px; box-shadow:0 4px 15px rgba(0,0,0,0.1); width:350px; text-align:center;">
            <h2>AI WhatsApp Bridge 🚀</h2>
            <p>המערכת מחוברת לגיליון ול-Twilio</p>
            <div id="st" style="font-weight:bold; color:green;">סטטוס: פעיל ✅</div>
        </div>
    </body>
    </html>
    `);
});

// --- נתיב ל-WhatsApp (Twilio Webhook) ---
app.post('/api/whatsapp', async (req, res) => {
    const twiml = new MessagingResponse();
    const userMessage = req.body.Body; // הטקסט מהוואטסאפ
    const userPhone = req.body.From;   // מספר השולח

    try {
        // 1. פנייה ל-Gemini API
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=\${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: userMessage }] }] })
        });
        
        const data = await aiResponse.json();
        const aiAnswer = data.candidates[0].content.parts[0].text;

        // 2. שמירה בגיליון גוגל
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["DataAI"];
        if (sheet) {
            await sheet.addRow([
                new Date().toLocaleString('he-IL'), 
                userPhone, 
                userMessage, 
                aiAnswer
            ]);
        }

        // 3. החזרת תשובה לוואטסאפ
        twiml.message(aiAnswer);
        res.set('Content-Type', 'text/xml');
        res.send(twiml.toString());

    } catch (error) {
        console.error("Error:", error);
        twiml.message("אופס, משהו השתבש בחיבור ל-AI. נסה שוב מאוחר יותר.");
        res.set('Content-Type', 'text/xml');
        res.send(twiml.toString());
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port \${PORT}`));
module.exports = app;
