# Suv inshooti yorilishi — 3D toshqin simulyatsiyasi

Samarqanddagi **Cho'pon ota** va **Dagbit** suv inshootlari uchun veb-xarita: inshoot yorilsa, suv qancha joyni bosishini 3D relyef ustida ko'rsatadi.

Skrinshotli to'liq qo'llanma: [docs/Suv_inshooti_qollanma.docx](docs/Suv_inshooti_qollanma.docx).

## Ishga tushirish

[Node.js](https://nodejs.org) (18 yoki undan yangi) kerak. Qo'shimcha kutubxona o'rnatish shart emas.

- **Windows:** `start.bat` ni ikki marta bosing — server yonadi va brauzer ochiladi. To'xtatish uchun `stop.bat`.
- **Boshqa tizimlar:** `npm start`, keyin brauzerda `http://localhost:8080`.

Sun'iy yo'ldosh tasviri va relyef plitkalari internetdan yuklanadi.

## Foydalanish

1. Inshootni tanlang (ro'yxatdan yoki xaritadagi belgini bosib).
2. Suv hajmi, to'g'on balandligi, yorilish ulushi va davomiylikni kiriting.
3. «Simulyatsiyani boshlash» ni bosing. Hisob tugagach, toshqin sekin animatsiya qilinadi.
4. Pastki panelda tezlikni tanlang, kadrma-kadr yuring yoki «Maksimal» va «Yetib kelish vaqti» xaritalariga o'ting.
5. Natijani Google Earth Pro uchun KMZ yoki jadval uchun CSV qilib eksport qilish mumkin.

## Inshootlar

| Inshoot | Kenglik | Uzunlik | Standart hajm |
|---|---|---|---|
| Cho'pon ota suv inshooti | 39.682269 | 67.059071 | 6 000 m³ (pasport: 2×2 000 + 2×1 000 m³) |
| Dagbit suv inshooti | 39.712479 | 66.956325 | 6 000 m³ (pasport: 2×3 000 m³) |

To'g'on balandligi ikkalasida ham 8 m deb olingan — bu **taxminiy** qiymat. Hisobdan oldin pasport ma'lumotlarini kiriting. Qiymatlar `public/app.js` boshidagi `SITES` ichida turadi.

## Model va cheklovlar

- **Relyef:** AWS Terrain Tiles (SRTM, ~30 m). Binolar, kanal dambalari va yo'l ko'tarmalari hisobga olinmaydi.
- **Oqim:** soddalashtirilgan 2D sayoz suv modeli (Bates va b., 2010 usuli), `public/sim-core.js`.
- **Yorilish gidrografi:** Froehlich (2008) empirik formulasi bo'yicha cho'qqi sarf, uchburchak gidrograf.

Natija dastlabki baholash uchun mo'ljallangan va rasmiy xavf xaritasi yoki loyihaviy hisob o'rnini bosmaydi.

## Tuzilishi

| Fayl | Vazifasi |
|---|---|
| `server.mjs` | statik fayl serveri |
| `public/index.html` | sahifa va uslublar |
| `public/app.js` | xarita, boshqaruv, animatsiya, eksport |
| `public/sim-core.js`, `public/sim-worker.js` | toshqin modeli (Web Worker'da ishlaydi) |
| `public/export.js` | KMZ/CSV yordamchilari |
| `public/info.js`, `public/data.js` | Pasport va Statistika bo'limlari, ularning ma'lumotlari |
| `public/vendor/` | MapLibre GL JS 4.7.1 |
| `docs/` | Word qo'llanma (skrinshotlar bilan) |

## Rasmlar

Inshoot sxemalari va pasport surati (`public/img/`) repozitoriyga kiritilmagan — ular qo'riqlanadigan obyektga tegishli. Dashboardning Pasport bo'limida ko'rinishi uchun fayllarni shu papkaga qo'lda qo'ying: `choponota-texnologik-karta.jpg`, `choponota-pasport-stend.jpg`, `samarqand-sxema.jpg`.

Manba jadvallar `data/` papkasida; `public/data.js` ulardan yaratilgan.

## Litsenziya eslatmasi

Asos xarita sifatida Google sun'iy yo'ldosh plitkalari to'g'ridan-to'g'ri ulangan; bu rasmiy litsenziyalangan yo'l emas. Ommaviy foydalanish uchun Esri qatlamiga o'ting yoki Google Maps API kalitidan foydalaning.
