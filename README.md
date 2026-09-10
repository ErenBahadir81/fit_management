# FitFloow v2 🏋️‍♂️

Antrenman + kas yenilenme + vücut ölçümü + yağ oranı hedefi + beslenme (fotoğraftan yemek tanıma) takibi.
Üç yüzey, tek doğruluk kaynağı:

| Yüzey | Teknoloji | Kimin için |
|---|---|---|
| **API** `apps/api` | Fastify 5 · TypeScript · Mongoose 9 (MongoDB) · zod 4 | mobil + admin |
| **Vision** `apps/vision` | Python 3.11 · FastAPI · onnxruntime (Swin Food-101, CLIP kapısı) | API |
| **Mobil** `apps/mobile` | Expo SDK 57 · React Native 0.86 · Reanimated 4 · expo-router · Skia | kullanıcılar |
| **Admin** `apps/admin` | Next.js 16 · Tailwind 4 · motion · TanStack Query | yöneticiler |

Paylaşılan paketler: `packages/core` (saf alan mantığı + zod şemaları: Navy, yenilenme, hedef motoru, haftalık rapor, beslenme,
maskot) ve `packages/api-client` (iki ön yüzün kullandığı tipli istemci).

## Özellikler
- **Antrenman & yenilenme**: değişken uzunluklu döngü, set-set kayıt, kas başına yenilenme eğrisi (0 → yarı sürede %70 → tam sürede %100),
  haftalık hacim vs hedef. Kaslar ve hareket→kas yükleri artık **admin panelden düzenlenen veri**.
- **Vücut**: US Navy yağ oranı, hızlı tartım, EWMA ile yumuşatılmış kilo trendi, yağsız kütle, bel.
- **Hedef motoru**: yalnızca hedef yağ oranı girilir. Motor; verilecek yağ (kg), toplam açık (kcal), mevcut yağ bandına göre güvenli haftalık
  hız (admin tablosu + Alpert sınırı + TDEE'nin %30'u + kalori tabanı), hafta sayısı, günlük kalori ve haftalık yol haritasını hesaplar.
  Gerçek alım + trend kilo ile haftalık TDEE yeniden kalibrasyonu.
- **Beslenme & AI tarama**: fotoğraf → tespit edilen yemekler (güven skoru) → gram düzenle → öğüne kaydet. 417 hazır yemek (317 Türk mutfağı +
  Food-101), Open Food Facts barkod, USDA içe aktarma.
- **Haftalık rapor**: hafta ölçüm gününde başlar (varsayılan Pazar, seçilebilir). Ekside kalınan kalori, beklenen vs gerçek kilo, hedefe uzaklık,
  antrenman hacmi, puan; veri girdikçe canlı yenilenir.
- **Maskot Floo**: tüm motivasyon metinleri (admin panelden düzenlenebilir katalog) mor alev-damla Floo'dan gelir.

## Hızlı başlangıç
```bash
pnpm install                    # Node 22+, pnpm 10 (kök .npmrc: hoisted)
pnpm dev:api                    # http://localhost:4000/api/v1  (MONGO_URI yoksa MONGO_MEMORY=1 ile bellek içi Mongo)
pnpm dev:vision                 # http://localhost:8100 (model yoksa VISION_MOCK=1)
pnpm dev:admin                  # http://localhost:3000
pnpm dev:mobile                 # Expo (EXPO_PUBLIC_API_URL=http://<ip>:4000/api/v1)
bash scripts/dev-all.sh         # hepsi birden
docker compose up               # mongo + api + vision + admin
```
Seed kullanıcıları: **eren** (admin) ve **inci** — şifre `Asd*123`. Seed/migration her açılışta idempotent çalışır (`SEED_ON_BOOT`), v1 verileri korunur.

## Test
```bash
pnpm check                      # typecheck + tüm testler
pnpm test:core | test:api | test:client | test:admin | test:mobile | test:vision
```
API testleri gerçek (bellek içi) MongoDB'ye karşı çalışır; `apps/api/test/e2e-flow.test.ts` tüm modülleri birlikte doğrular
(ölçüm → hedef → otomatik kalori → öğün → antrenman → tartım → haftalık rapor → tarama → admin özet).

## Dokümantasyon
- `docs/plan/00-master-plan.md` … `10-testing-quality.md`: mimari, veri modeli, API sözleşmesi, hedef motoru matematiği, rapor, mobil/admin tasarım.
- `docs/research/`: yemek tanıma, yağ kaybı bilimi ve 2026 yığın araştırmaları (kaynaklı).
- `docs/plan/agents/`: uygulamayı yazan ajan brifleri ve durum notları.
- Modül README'leri: `apps/api`, `apps/vision`, `apps/mobile`, `apps/admin`.

## Formüller (özet)
- **Navy**: erkek `495/(1.0324−0.19077·log10(bel−boyun)+0.15456·log10(boy))−450`; kadın `495/(1.29579−0.35004·log10(bel+kalça−boyun)+0.221·log10(boy))−450`
- **Verilecek yağ** (yağsız kütle korunur): `kilo × (bf − hedef) / (100 − hedef)`
- **Haftalık hız**: `min(tablo % × kilo, bant üst sınırı, yağKütlesi × 69.3 × 0.75 × 7 / 7700, 0.30 × TDEE × 7 / 7700)`
- **TDEE**: Katch-McArdle `370 + 21.6 × yağsız kütle` (yaş varsa Mifflin ile %50 karışım) × aktivite çarpanı; haftalık kalibrasyon
  `TDEE = ortalama alım − Δtrend(kg) × 7700 / gün`
- **Yenilenme**: yarı sürede %70, tam sürede %100 (`small` 48 s, `large` 24 s; admin panelden kas bazında)

v1 (Next.js monolit) kodu `v1-legacy` etiketiyle git geçmişinde durur: `pnpm legacy --ls`.
