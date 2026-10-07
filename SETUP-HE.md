# Pure Pour – הוראות הפעלה

## מה יש בתיקייה
| קובץ | תפקיד |
|---|---|
| `index.html` | האתר ללקוחות (תפריט, בחירת בקבוקים, הזמנה, תשלום) |
| `admin/index.html` | עמוד ניהול: היסטוריית הזמנות, שינוי סטטוס, רשימת הכנה, ייצוא CSV |
| `js/config.js` | **כל ההגדרות**: מחירים, קישורי ביט/פייבוקס, מועדי אספקה, חיבור Firebase |
| `js/data.js` | 12 הקוקטיילים (שמות, תיאורים, אחוזי אלכוהול, צבעים) |
| `images/cocktails/` | כאן שמים תמונות: `<slug>.jpg` |
| `firestore.rules` | כללי אבטחה לבסיס הנתונים |

## 1. תמונות של הקוקטיילים
שמים קובץ JPG בתיקייה `images/cocktails/` בשם הנכון והוא יחליף אוטומטית את הרקע הצבעוני:

`margarita.jpg` · `watermelon-margarita.jpg` · `watermelon-sugar.jpg` · `tequila-sunrise.jpg` · `bluebedy.jpg` · `peach-perfect.jpg` · `pineapple-wave.jpg` · `fine-and-dandy.jpg` · `cosmopolitan.jpg` · `israeli-sunset.jpg` · `strawberry-sour.jpg` · `sunset-kiss.jpg`

מומלץ יחס 4:3, רוחב עד 1200 פיקסלים (כדי שהאתר ייטען מהר).

## 2. קישורי תשלום
ב-`js/config.js`, תחת `payment`, מדביקים את הקישור של ביט ושל פייבוקס (חייב להתחיל ב-https://).
כל עוד השדה ריק, הכפתור מציג "בקרוב".

## 3. חיבור Firebase (כדי שההזמנות יגיעו אליך ותוכל לראות היסטוריה)
> **סטטוס (6.10.2026): בוצע.** הפרויקט `pure-pour` נוצר, Firestore בתל אביב, כניסה עם אימייל וסיסמה הופעלה, כללי האבטחה פורסמו, וההגדרות ב-`js/config.js`.
> נשאר: להיכנס פעם אחת ל-`/admin/` ולוודא שההזמנות מופיעות, ובהעלאה לאינטרנט להוסיף את הדומיין ב-Authentication → Settings → Authorized domains.
> ההוראות למטה נשארות למקרה שתרצה לבנות פרויקט חדש.

בלי זה האתר במצב הדגמה: ההזמנות נשמרות רק בדפדפן של מי ששלח אותן.

1. נכנסים ל-https://console.firebase.google.com ויוצרים פרויקט (אפשר בלי Analytics).
2. **Build → Firestore Database → Create database** (אזור קרוב, למשל `europe-west1`), במצב Production.
3. **Build → Authentication → Get started → Email/Password → Enable.**
   אחר כך Users → Add user: האימייל והסיסמה שלך לניהול. מעתיקים את ה-**User UID** שלך.
4. **Firestore → Rules:** מדביקים את התוכן של `firestore.rules`, מחליפים `PUT_ADMIN_UID_HERE` ב-UID מהשלב הקודם, ולוחצים Publish.
5. **Project settings (גלגל שיניים) → Your apps → Web app (`</>`)** ורושמים אפליקציה. מעתיקים את אובייקט ה-`firebaseConfig` אל `js/config.js` בשדה `firebase`.
6. נכנסים ל-`/admin/` עם האימייל והסיסמה.

הערות אבטחה:
- ה-`apiKey` של Firebase אינו סוד. ההגנה האמיתית היא כללי Firestore. הלקוחות יכולים **רק ליצור** הזמנה חדשה (במבנה תקין). קריאה ועדכון – רק לחשבון המנהל.
- הסכום בהזמנה מחושב בדפדפן של הלקוח, אז מי שירצה יוכל לשנות אותו. זה לא מסוכן אצלך, כי אתה מאשר ידנית את ההעברה ורואה בבנק/באפליקציה כמה שולם.
- אפשר להוסיף Firebase App Check בעתיד כדי להקשות על הזמנות זבל.

## 4. הרצה מקומית
דפדפן לא מריץ מודולים מ-`file://`, לכן צריך שרת מקומי:
```
python -m http.server 5190 --directory C:\bot\pure-pour-site
```
ואז לפתוח http://localhost:5190

## 5. העלאה לאינטרנט
האתר סטטי (קבצים בלבד), אפשר להעלות בחינם ל-Cloudflare Pages או ל-GitHub Pages. (לא Netlify, בגלל מה שקרה עם SmartPot.)

## מה כבר נבדק ומה לא
נבדק במצב הדגמה: בחירת בקבוקים, חישוב חבילות, שליחת הזמנה, מסך תשלום, עמוד ניהול, שינוי סטטוס, רשימת הכנה, תצוגת נייד.
**לא נבדק:** חיבור Firebase אמיתי (דורש פרויקט שלך), וקישורי ביט/פייבוקס אמיתיים.
