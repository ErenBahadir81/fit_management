import { resetSeed } from "../src/lib/seed";

// Kullanım:
//   npm run reset            -> eren, 1. gün
//   npm run reset 4          -> eren, 4. gün
//   npm run reset inci       -> inci, 1. gün
//   npm run reset inci 2     -> inci, 2. gün
const a2 = process.argv[2];
const a3 = process.argv[3];

let user = "eren";
let dayArg = a2;
if (a2 === "eren" || a2 === "inci") {
  user = a2;
  dayArg = a3;
}
const dayNum = Number(dayArg);
const startDay = Number.isInteger(dayNum) && dayNum >= 1 ? dayNum : 1;

resetSeed(user, startDay - 1)
  .then((r) => {
    console.log(
      `✅ ${r.user} sıfırlandı. Program ${r.startDay}. günden (${r.dayTitle}) başlıyor.\n   Giriş: ${r.user} / Asd*123`
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Reset başarısız:", e);
    process.exit(1);
  });
