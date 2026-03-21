const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// --- נתיב בדיקה: כדי לראות שהשרת עובד ולא נותן 404 ---
app.get('/', (req, res) => {
  res.send("השרת באוויר ועובד! כעת ניתן לפנות לכתובות ה-API.");
});

// הגדרות חיבור לגוגל
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("שגיאה בפענוח ה-JSON של גוגל. וודא שהדבקת אותו נכון ב-Vercel.");
}

const auth = new JWT({
  email: serviceAccount?.client_email,
  key: serviceAccount?.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.SHEET_ID, auth);

// --- חלק 1: קבלת שאלה ושליחה ל-AI ---
app.get('/api/ymotAskAI', async (req, res) => {
  const phone = req.query.ApiPhone;
  const question = req.query.question_text;

  if (!question) {
    return res.send("id_list_message=t-לא זוהתה הקשה");
  }

  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle["מענה AI"];

    // פנייה ל-Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }]
      })
    });

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0]) {
        throw new Error("No response from AI");
    }

    const aiAnswer = data.candidates[0].content.parts[0].text;
    // ניקוי תווים מיוחדים שיכולים לשבש את ימות המשיח
    const cleanAnswer = aiAnswer.replace(/[^\u0590-\u05FF0-9 ,.?!"']/g, '');

    // רישום בגיליון
    await sheet.addRow({
      "זמן": new Date().toLocaleString('he-IL'),
      "מספר שורה": phone,
      "טקסט השאלה": question,
      "טקסט מסונן": cleanAnswer
    });

    res.send("id_list_message=t-שאלתך התקבלה, אנא המתן למענה");
  } catch (error) {
    console.error(error);
    res.send("id_list_message=t-חלה שגיאה בעיבוד השאלה");
  }
});

// --- חלק 2: קריאת התשובה מהגיליון ---
app.get('/api/ymotReadAI', async (req, res) => {
  const phone = req.query.ApiPhone;

  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle["מענה AI"];
    const rows = await sheet.getRows();

    // מחפש את השורה האחרונה של המשתמש לפי מספר טלפון
    const userRow = [...rows].reverse().find(row => row.get("מספר שורה") === phone);

    if (userRow && userRow.get("טקסט מסונן")) {
      const answer = userRow.get("טקסט מסונן");
      res.send(`id_list_message=t-${answer}`);
    } else {
      res.send("id_list_message=t-טרם התקבל מענה, נסה שנית בעוד רגע");
    }
  } catch (error) {
    console.error(error);
    res.send("id_list_message=t-שגיאה בקריאת הנתונים מהגיליון");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
