// תמחור לפי מדרגות: המחיר לבקבוק נקבע לפי החבילה הגדולה ביותר שההזמנה מגיעה אליה,
// וכל הבקבוקים בהזמנה (גם אלה שמעבר לחבילה) נמכרים במחיר הזה.
// prices = {1: 48, 2: 90, 4: 155, 6: 200}  →  3 בקבוקים = 3 × 45 = 135, 5 = 5 × 38.75 ≈ 194.
// הסכום הסופי מעוגל כלפי מטה לשקל שלם (נוח לתשלום בביט/פייבוקס, ולא "עוקץ" את הלקוח).
// ה-1e-6 מונע שגיאת נקודה צפה (למשל 199.99999999 במקום 200).
export function tierPrice(n, prices) {
  if (!(n >= 1)) return null;
  let tier = null;
  for (const s of Object.keys(prices).map(Number).sort((a, b) => a - b)) if (s <= n) tier = s;
  if (tier === null) return null;
  const perBottle = prices[tier] / tier;
  return { tier, perBottle, cost: Math.floor(n * perBottle + 1e-6) };
}

export const fmt = n => `${Number.isInteger(n) ? n : n.toFixed(2)} ₪`;
