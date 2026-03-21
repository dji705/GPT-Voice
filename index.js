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
        <title>ממשק שליחת שאלות AI</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .container { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
            h1 { color: #2c3e50; font-size: 24px; margin-bottom: 20px; }
            input, button { width: 100%; padding: 12px; margin-top: 10px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box; font-size: 16px; }
            button { background-color: #3498db; color: white; border: none; cursor: pointer; font-weight: bold; transition: background 0.3s; }
            button:hover { background-color: #2980b9; }
            #status { margin-top: 15px; font-size: 14px; color: #7f8c8d; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>שאל את ה-AI</h1>
            <input type="text" id="phone" placeholder="מספר טלפון (למשל 0527635348)">
            <input type="text" id="question" placeholder="מה השאלה שלך?">
            <button onclick="sendQuestion()">שלח שאלה</button>
            <div id="status">סטטוס שרת: מחובר ✅</div>
        </div>

        <script>
            async function sendQuestion() {
                const phone = document.getElementById('phone').value;
                const question = document.getElementById('question').value;
                const status = document.getElementById('status');
                
                if(!phone || !question) { alert("נא למלא את כל השדות"); return; }
                
                status.innerText = "מעבד נתונים... אנא המתן";
                try {
                    const response = await fetch(\`/api/ymotAskAI?ApiPhone=\${phone}&question_text=\${question}\`);
                    const text = await response.text();
                    status.innerHTML = "<b>תשובה מהשרת:</b> " + text;
                } catch (err) {
                    status.innerText = "שגיאה בשליחה";
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

// --- ה-API לימות המשיח ולדפדפן ---
app.all('/api/ymotAskAI', async (req, res) => {
    const phone = req.query.ApiPhone || "web-user";
    const question = req.query.question_text;

    if (!question) return res.send("id_list_message=t-no_question");

    try {
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: question }] }] })
        });
        const data = await aiResponse.json();
        const aiAnswer = data.candidates[0].content.parts[0].text;
        const cleanAnswer = aiAnswer.replace(/[^\u0590-\u05FF0-9 ,.?!"']/g, '');

        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        
        // הוספה לגיליון
        await sheet.addRow([new Date().toLocaleString('he-IL'), phone, question, cleanAnswer]);

        res.send("id_list_message=t-שאלתך התקבלה, אנא המתן למענה");
    } catch (error) {
        console.error(error);
        res.send("id_list_message=t-error");
    }
});

app.all('/api/ymotReadAI', async (req, res) => {
    try {
        const phone = req.query.ApiPhone;
        const doc = await getDoc();
        const sheet = doc.sheetsByTitle["מענה AI"];
        const rows = await sheet.getRows();
        const userRow = [...rows].reverse().find(row => row.get("מספר שורה") === String(phone));

        if (userRow && userRow.get("טקסט מסונן")) {
            res.send(`id_list_message=t-\${userRow.get("טקסט מסונן")}`);
        } else {
            res.send("id_list_message=t-no_answer_yet");
        }
    } catch (error) {
        res.send("id_list_message=t-error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Running"));
module.exports = app;
