const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ממשק דפדפן מעוצב ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>מערכת AI - שליחת שאלה</title>
        <style>
            body { font-family: sans-serif; background: #f0f4f8; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 8px 20px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
            h2 { color: #2c3e50; margin-bottom: 20px; }
            input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #cbd5e0; border-radius: 8px; box-sizing: border-box; font-size: 16px; }
            button { width: 100%; padding: 12px; background: #3182ce; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; transition: background 0.2s; }
            button:hover { background: #2b6cb0; }
            #status { margin-top: 20px; font-weight: bold; color: #4a5568; font-size: 14px; min-height: 40px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>שאל את ה-AI</h2>
            <input type="text" id="phone" placeholder="מספר טלפון">
            <input type="text" id="question" placeholder="הקלד את שאלתך...">
            <button onclick="sendQuestion()">שלח שאלה</button>
            <div id="status">סטטוס: מחובר ✅</div>
        </div>
        <script>
            async function sendQuestion() {
                const p = document.getElementById('phone').value;
                const q = document.getElementById('question').value;
                const s = document.getElementById('status');
                if(!p || !q) { alert("נא למלא את כל השדות"); return; }
                s.innerText = "מעבד נתונים... אנא המתן";
                try {
                    const response = await fetch(\`/api/ymotAskAI?ApiPhone=\${p}&question_text=\${q}\`);
                    const text = await response.text();
                    s.innerHTML = "<b>תשובה מהשרת:</b><br>" + text;
                } catch (err) {
                    s.innerText = "שגיאה בתקשורת עם השרת";
                }
            }
        </script>
    </body>
    </html>
    `);
});

// --- פונקציית עזר לגוגל שיטס ---
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

// --- API לימות המשיח ולדפדפן ---
app.all('/api/ymotAskAI', async (req, res) => {
    const phone = req.query.ApiPhone || "web-user";
    const question = req.query.question_text;

    if (!question) return res.send("id_list_message=t-נא_להקיש_שאלה");

    try {
        // שימוש בכתובת v1 היציבה
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: question }] }] })
        });
        
        const data = await aiResponse.json();

        if (data.error) {
            console.error("Gemini API Error:", data.error.message);
            return res.send("id_list_message=t-error_api_connection");
        }

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            return res.send("id_list_message=t-error_no_content");
        }

        const aiAnswer = data.candidates[0].content.parts[0].text;
        // ניקוי טקסט עבור ימות המשיח
        const cleanAnswer = aiAnswer.replace(/[^\u0590-\u05FF0-9 ,.?!"']/g, '');

        // הוספה לגוגל שיטס
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        if (!sheet) throw new Error("Sheet tab 'מענה AI' not found");

        await sheet.addRow([
            new Date().toLocaleString('he-IL'), 
            phone, 
            question, 
            cleanAnswer
        ]);

        res.set('Content-Type', 'text/plain');
        res.send("id_list_message=t-שאלתך התקבלה, אנא המתן למענה");
    } catch (error) {
        console.error("Critical System Error:", error.message);
        res.send("id_list_message=t-error_general_failure");
    }
});

// --- API לקריאת התשובה ---
app.all('/api/ymotReadAI', async (req, res) => {
    try {
        const phone = req.query.ApiPhone;
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        const rows = await sheet.getRows();

        const userRow = [...rows].reverse().find(row => row.get("מספר שורה") === String(phone));

        res.set('Content-Type', 'text/plain');
        if (userRow && userRow.get("טקסט מסונן")) {
            res.send(`id_list_message=t-${userRow.get("טקסט מסונן")}`);
        } else {
            res.send("id_list_message=t-טרם_התקבל_מענה_נסה_שוב_בעוד_רגע");
        }
    } catch (error) {
        res.send("id_list_message=t-error_reading_data");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Running"));

module.exports = app;
