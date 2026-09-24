# Floo v2 — uzuvsuz damla maskot (parametrik model) — tasarım

Tarih: 2026-09-21. Kapsam: `apps/mobile/src/mascot/model/` (yeni alt klasör; mevcut `Floo.tsx` ve `moods.ts` DOKUNULMAZ) + `app/mascot-playground.tsx`.

## 1. Silüet (referans: `Gemini_Generated_Image_pgiob1pgiob1pgio.jpg`, uzuvlar hariç)

- Klasik gözyaşı damlası: büyük yuvarlak taban (r≈62, merkez ≈(100,158)), tabana teğet neredeyse düz iki yan, **sivri kıvrık uç**. Boyun/ampul/soğan YOK. Yükseklik ≈ 1.45 × genişlik.
- Uç merkezin soluna (≈(86,30)) yatar, en ucu alev gibi sola-aşağı kıvrılır. `tipBend` kıvrılma miktarı (−1 sarkık, +1 dik), `tipLength` uç yüksekliği.
- Kalın koyu mavi kontur (`#3A7FC4`, ~3.5 birim). Düz çizgi film gölgelemesi: gövde `#63A9E8`, sol-alt gölge `#4F92D6` (tek düz şekil), sağ-üst açık `#7EC0F2`. Sağ-üst yanda kontura paralel iki uzun parlak highlight (`#D8F0FF`), taban sol-altta ve uçta küçük birer highlight.
- Kol/bacak yok. Gövde zıplar, yatar, squash/stretch yapar. Yer gölgesi düz elips.
- Yüz: iri dik oval gözler (rx≈18, ry≈21), iç köşeler aşağıda (±6° dönük), merkez ≈(76,118)/(124,112). İris koyu lacivert `#1B2A4A`, sağ-üstte büyük parıltı. Kaşlar kısa kalın lacivert çizgi (y≈90). Ağız: dişli açık gülümseme (beyaz diş bandı + `#E4636E` dil), altında küçük çene çizgisi. Yanaklar **açık mavi-beyaz** `#C9E6F8` (pembe değil).
- Idle süsü: 5–9 s'de bir uçtan sol-üste iki küçük damlacık fırlar, 500 ms'de söner (referanstaki uçan damlalar). `waterLogged`'da da tetiklenir.
- **Hidrasyon ekseni** (`hydration` 0..1): 0 → gövde %8 küçük, renk %30 desatüre/mat, highlight zayıf, uç sarkık; 1 → tam boy, canlı renk, güçlü parıltı, uç dik.

## 2. Parametreler (`FlooParams`)

| param | aralık | anlam |
|---|---|---|
| squash | −0.35..0.35 | + basık/geniş, − uzun/ince; hacim korunur (`scaleX = 1/scaleY`) |
| lean | −15..15 deg | gövde eğimi (tabandan pivot) |
| hop | 0..30 px | yerden yükseklik |
| tipBend | −1..1 | anten: − sola/arkaya sarkar, + dik/ileri |
| tipLength | 0.6..1.3 | anten uzunluğu çarpanı |
| eyeOpen | 0..1 | üst kapak |
| eyeSquint | 0..1 | alt kapak yukarı (gerçek gülümseme) |
| lookX/lookY | −1..1 | bakış (max 8px pupil kayması) |
| browY | −8..6 px | − kalkık |
| browAngle | −20..20 deg | + iç uçlar YUKARI (üzgün/endişeli), − dış uçlar yukarı (neşeli). İç uçlar aşağı = kızgın; hiçbir preset kullanmaz |
| mouthCurve | −12..16 | + gülümseme, − somurtma |
| mouthOpen | 0..16 | dudak aralığı |
| mouthWidth | 10..28 | yarı genişlik |
| blush | 0..1 | allık opaklığı |
| brightness | 0..1 | spekülar + doygunluk (hidrasyon buradan geçer) |
| tempo | 0.5..1.8 | idle hız çarpanı |

## 3. Duygu preset'leri (6)

| | squash | lean | tipBend | tipLen | eyeOpen | squint | browY | browAng | mCurve | mOpen | mWidth | blush | bright | tempo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| idle | 0 | 0 | −0.25 | 1.0 | 1.0 | 0.1 | −1 | −3 | 11 | 9 | 20 | 0.4 | 0.7 | 1.0 |
| happy | −0.03 | 0 | 0.5 | 1.05 | 0.95 | 0.35 | −2 | −4 | 12 | 6 | 22 | 0.8 | 0.9 | 1.15 |
| celebrate | −0.08 | −3 | 1.0 | 1.2 | 0.9 | 0.5 | −6 | −10 | 15 | 14 | 26 | 1.0 | 1.0 | 1.6 |
| sad | 0.07 | 3 | −0.8 | 0.85 | 0.75 | 0 | 4 | 16 | −10 | 3 | 16 | 0.15 | 0.45 | 0.7 |
| worried | 0.02 | −2 | −0.5 | 0.95 | 1.0 | 0 | −3 | 8 | −7 | 5 | 15 | 0.2 | 0.6 | 1.1 |
| sleepy | 0.05 | 8 | −0.6 | 0.9 | 0.15 | 0 | 3 | 4 | 4 | 4 | 12 | 0.3 | 0.55 | 0.55 |

Geçiş: her parametre `withSpring` (gentle: damping 20/stiffness 140; yüz için). Gövde (squash/lean/hop) bouncy (damping 12/stiffness 220).

## 4. Katman modeli

1. **Idle (her zaman altta)**: nefes = squash sinüsü ±0.025, periyot 2.8 s / tempo (nefes verirken basık, alırken uzun). Göz kırpma 2.6–5.2 s rastgele, %22 çift kırpma, kapanış 60 ms / açılış 130 ms. Mikro-hareket: 6–10 s'de bir küçük lean (±2°) + anten sallanması; saccade 1.8–4.6 s'de bir, 90 ms, ease-out.
2. **Mood**: preset hedefleri; idle üstüne toplanır (additive).
3. **Trigger** (tek seferlik, bitince mood'a düşer): `mealLogged` (küçük zıplama + kalp), `goalHit` (büyük zıplama + konfeti), `streakUp` (çift zıplama + "+★"), `missedDay` (sad'e 1.5 s, sonra worried→idle: "üzülür, hemen toparlar", asla ceza yok), `overTarget` (worried 1.2 s, ufak geri çekilme), `waterLogged` (stretch + parıltı + damlacık sıçraması, hydration +), `tap` (squash pop + göz kısma).
4. **Bakış**: `lookX/lookY` dışarıdan (pointer/touch) beslenir; idle saccade üstüne eklenir, 8 px'e clamp.
5. **Efektler**: maskot dışında ayrı Reanimated katmanı (`Effects.tsx`): kalp, konfeti (12–20 parça), damlacık, +★. Kozmetik slotu: `accessory?: ReactNode` (Skia Group, anten/baş bölgesine bağlı) — boş bırakılır.

## 5. Animasyon ilkeleri

- Squash-stretch hacim korur; zıplamada: anticipation crouch (squash +0.14, 110 ms ease-out) → havada stretch (−0.10) → inişte squash (+0.12) → spring'le 0'a (bouncy). Sıfırdan teleport yok.
- Easing: fiziksel şeyler spring; opaklık/renk ease-out cubic 200–320 ms. Lineer yok.
- Anten, gövdeye göre 1 kare geciken ikincil hareket (follow-through): lean değiştiğinde anten ters yönde ~%40 sallanıp yerleşir.
- Tepki süreleri: pop 180 ms, hop 450–600 ms, konfeti 900 ms, üzülme 1.5 s. Juice geçicidir; her tetik sonunda dinlenme durumuna döner.
- Reduced motion: her spring → 150 ms timing, idle döngüler kapanır, efektler yalnızca fade.

## 6. API

```ts
type Mood = "idle"|"happy"|"celebrate"|"sad"|"worried"|"sleepy";
type Trigger = "mealLogged"|"goalHit"|"streakUp"|"missedDay"|"overTarget"|"waterLogged"|"tap";
<FlooModel mood size hydration look={{x,y}} trigger={key} onTriggerEnd accessory />
useFlooModel(): { mood, hydration, look, fire(trigger), setMood, setHydration, setLook, triggerKey }
```

## 7. Playground (`/mascot-playground`)

Auth guard dışında, `expo start --web --port 3000` → `localhost:3000/mascot-playground`. 6 mood butonu, 7 trigger butonu, hidrasyon slider'ı, bakış takibi (pointer/touch alanı), reduced-motion anahtarı. Skia web için `WithSkiaWeb` + CDN canvaskit (0.41.0).

## 8. Doğrulama

Playwright: her mood'da 3 frame (0 / 300 / 900 ms), her trigger'da 6 frame (0–900 ms). Görsel inceleme: robotik/ölü görünen (simetrik metronom, lineer hareket, teleport) reddedilir.
