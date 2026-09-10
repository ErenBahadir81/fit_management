import type { Mood } from "../schemas/common";
import type { MascotKey } from "../schemas/mascot";
import { hash32 } from "../utils/index";

export interface MascotTemplate {
  key: MascotKey;
  mood: Mood;
  variants: string[];
}

/**
 * Floo's default voice (Turkish). Warm, short, concrete, never shaming. ≤ 2 sentences, ≤ 1 emoji.
 * Placeholders: {name} {kcal} {weeks} {kg} {pct} {sessions} {streak} {day} {muscle} {food} {score}
 */
export const DEFAULT_MASCOT_MESSAGES: MascotTemplate[] = [
  { key: "home.morning", mood: "happy", variants: ["Günaydın {name}! Bugün küçük bir adım, büyük bir fark. ☀️", "Kahve hazır mı? Ben hazırım {name}.", "Yeni gün, temiz sayfa. Başlayalım mı?"] },
  { key: "home.afternoon", mood: "happy", variants: ["Öğleden sonra enerjisi düşerse ben buradayım.", "Günün yarısı geçti, hâlâ vaktin var {name}.", "Bir bardak su iç, sonra devam. 💧"] },
  { key: "home.evening", mood: "sleepy", variants: ["Akşam oldu; bugünü kapatmadan bir şey unuttun mu?", "Yarın için hazırlık: uyku da antrenmandır.", "Günü değerlendirelim, sonra dinlen {name}."] },
  { key: "home.noData", mood: "think", variants: ["Henüz hiç veri yok. İlk ölçümünle başlayalım mı?", "Beni tanımak için önce seni tanımalıyım: bir ölçüm gir.", "Boş sayfa güzeldir; ilk kaydı at, gerisi gelir."] },
  { key: "home.workoutDue", mood: "flex", variants: ["Bugün {day} günü — hazır mısın?", "{day} seni bekliyor. Isınmayı atlama!", "Program diyor ki: {day}. Ben diyorum ki: yaparsın."] },
  { key: "home.workoutDone", mood: "cheer", variants: ["Bugünkü antrenman tamam! Kaslar şimdi şarj oluyor. ⚡", "Bitti mi? Bitti. Şimdi protein ve dinlenme.", "İşte bu! {sessions}. seans bu hafta."] },
  { key: "home.restDay", mood: "sleepy", variants: ["Bugün dinlenme günü. Yenilenme de programın parçası.", "Kaslar dinlenirken büyür. Bugün rahat ol.", "Hafif bir yürüyüş, bol su ve iyi uyku — bugünün planı bu."] },
  { key: "home.caloriesLeft", mood: "happy", variants: ["{kcal} kcal hakkın kaldı, akıllı harca.", "Bugün için {kcal} kcal daha var. Protein öncelik!", "{kcal} kcal kaldı; akşam yemeği için güzel bir alan."] },
  { key: "home.caloriesOver", mood: "think", variants: ["Bugün hedefi {kcal} kcal aştın. Bir gün trendi bozmaz — yarın devam.", "Fazla kaçtı ama panik yok; hafta ortalaması önemli.", "Hedefin üstündesin. Yarın biraz daha yürü, dengelenir."] },
  { key: "report.empty", mood: "sleepy", variants: ["Bu hafta henüz veri yok. Bir tartım, bir öğün — hemen dolmaya başlar.", "Rapor boş görünüyor; ilk kaydı atınca canlanırım.", "Sessiz bir hafta. Küçük bir kayıtla başlayalım mı?"] },
  { key: "report.onTrack", mood: "happy", variants: ["Tam planda gidiyorsun. {kcal} kcal ekside kaldın, bu ≈ {kg} kg yağ.", "Bu hafta rotadasın. Aynen böyle devam!", "Plan ile gerçek üst üste bindi. Bu iş ciddi. 👌"] },
  { key: "report.ahead", mood: "cheer", variants: ["Planın önündesin! Ama acele etme, kas koruması öncelik.", "Beklenenden hızlı ilerliyorsun. Uyku ve protein tam mı?", "Öndesin! Hızı biraz düşürsen de olur — sürdürülebilirlik kazanır."] },
  { key: "report.behind", mood: "think", variants: ["Bu hafta planın biraz gerisinde kaldık. Sorun değil, sonraki hafta yakalarız.", "Hedeften {kg} kg uzaktayız; günlük kaloriye biraz daha yakın kalalım.", "Küçük sapmalar normal. Ölçüm gününde yeniden bakarız."] },
  { key: "report.stalled", mood: "worried", variants: ["Kilo iki haftadır yerinde. Su tutulumu olabilir; ölçüleri de karşılaştıralım.", "Trend durdu. Yeniden kalibre edelim mi?", "Plato olabilir. Bir hafta daha sabır, sonra ayar yaparız."] },
  { key: "report.perfectWeek", mood: "flex", variants: ["Mükemmel hafta! Puan: {score}. Bunu çerçeveletmeliyiz.", "{sessions} antrenman, tam kayıt, hedefte kalori. Efsane.", "Bu hafta her şey yerli yerinde. Gurur duyuyorum."] },
  { key: "goal.created", mood: "cheer", variants: ["Yola çıktık! Yaklaşık {weeks} haftada %{pct} hedefi — adım adım.", "Hedef kilitlendi: %{pct}. Ben yol haritasını çizdim, sen yürü.", "{weeks} hafta, {kg} kg. Birlikte hallederiz."] },
  { key: "goal.halfway", mood: "cheer", variants: ["Yolun yarısı geride! {kg} kg gitti.", "Yarıladık! Şimdi en kritik kısım: tutarlılık.", "Yarı yol. Aynaya bir bak, fark orada."] },
  { key: "goal.completed", mood: "flex", variants: ["HEDEF TAMAM! %{pct} artık gerçek. 🏆", "Başardın. Bunu sen yaptın; ben sadece alkışladım.", "Hedefe ulaştın. Yeni bir hedef mi, yoksa koruma dönemi mi?"] },
  { key: "goal.recalibrated", mood: "think", variants: ["Gerçek verine göre planı güncelledim. Yeni günlük hedef: {kcal} kcal.", "Metabolizman konuştu, ben dinledim: {kcal} kcal.", "Kalibrasyon tamam; plan artık daha isabetli."] },
  { key: "goal.none", mood: "think", variants: ["Henüz bir hedefin yok. Bir yağ oranı belirle, gerisini ben hesaplayayım.", "Nereye gidiyoruz? Bir hedef seç, rotayı çizeyim.", "Hedefsiz yol uzun görünür. Bir % belirleyelim mi?"] },
  { key: "scan.start", mood: "think", variants: ["Bakalım tabakta ne var…", "Hmm, güzel görünüyor. Analiz ediyorum.", "Fotoğrafı inceliyorum, bir saniye."] },
  { key: "scan.done", mood: "happy", variants: ["Buldum: {food}. Gramajı kontrol et, sonra ekleyelim.", "Bu {food} olmalı. Miktarı ayarla, ben hesaplarım.", "{food} gibi görünüyor. Doğru mu?"] },
  { key: "scan.lowConfidence", mood: "think", variants: ["Tam emin olamadım. Aşağıdakilerden biri mi, yoksa arayalım mı?", "Işık biraz az; en yakın tahminlerimi listeledim.", "Bu tabak beni zorladı. Sen seç, ben öğrenirim."] },
  { key: "scan.failed", mood: "worried", variants: ["Görüntüyü analiz edemedim. Yemeği aramayı deneyelim mi?", "Bağlantı koptu sanki. Manuel arama her zaman var.", "Şu an göremiyorum; ama arama kutusu hâlâ çalışıyor."] },
  { key: "body.newMeasurement", mood: "happy", variants: ["Ölçüm kaydedildi: %{pct} yağ. Trend grafiğe işlendi.", "Yeni ölçüm tamam. Bel çevresi en dürüst göstergedir.", "Kaydettim. Haftaya aynı saatte tekrar ölçelim."] },
  { key: "body.weighInStreak", mood: "cheer", variants: ["{streak} gündür tartılıyorsun. Trend böyle netleşir.", "Tartı serisi: {streak} gün. Veri = güç.", "{streak} gün üst üste! Sabah tartısı alışkanlık oldu."] },
  { key: "body.noMeasurement7d", mood: "sleepy", variants: ["Bir haftadır ölçüm yok. Mezuranı bul, 2 dakika sürer.", "Ölçüm günü geçti. Bel ve boyun ölçüsü girelim mi?", "Trend için taze ölçüm lazım. Hazır mısın?"] },
  { key: "workout.start", mood: "flex", variants: ["Isın, nefes al, başla. Ben set sayıyorum.", "Bugünkü hedef: {sessions} hareket. Tek tek gideceğiz.", "Hadi bakalım. İlk set en zoru."] },
  { key: "workout.finished", mood: "cheer", variants: ["Antrenman tamam! {muscle} artık yenileniyor.", "Bitti. Su, protein, dinlenme — sırayla.", "Harika iş. Kaslar mesajı aldı."] },
  { key: "workout.pr", mood: "flex", variants: ["Yeni rekor! Bunu kutlamak lazım. 🎉", "PR! Geçen haftaki sen bunu yapamazdı.", "Rekor kırdın. Sessiz bir 'evet' hak ettin."] },
  { key: "workout.skipped", mood: "think", variants: ["Bugün atlandı; takvim kaydı, yorgunluk değişmedi.", "Off day işlendi. Yarın kaldığımız yerden.", "Bazen dinlenmek de doğru karar. Program kayarak devam eder."] },
  { key: "recovery.allReady", mood: "flex", variants: ["Tüm kaslar hazır. Bugün iyi bir gün.", "Yenilenme %100. Tam gaz."] },
  { key: "recovery.fatigued", mood: "sleepy", variants: ["{muscle} hâlâ yorgun. Bugün başka bir bölgeye yüklenelim.", "{muscle} dinleniyor; program ona göre ayarlanabilir."] },
];

/** Stable variant choice: same user + day + key → same sentence. */
export function pickVariant(variants: string[], seed: string): string {
  if (variants.length === 0) return "";
  return variants[hash32(seed) % variants.length];
}

/** Replace {placeholders}; unknown placeholders are removed gracefully. */
export function renderTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = vars[k];
      return v === null || v === undefined ? "" : String(v);
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function findTemplate(key: MascotKey, catalog: MascotTemplate[] = DEFAULT_MASCOT_MESSAGES): MascotTemplate | undefined {
  return catalog.find((t) => t.key === key);
}
