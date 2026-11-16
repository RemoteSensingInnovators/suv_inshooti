# Suv inshooti yorilishi — 3D toshqin simulyatsiyasi

Samarqanddagi **Cho'pon ota** va **Dagbit** suv inshootlari uchun veb-xarita: inshoot yorilsa, suv qancha joyni bosishini 3D relyef ustida ko'rsatadi.

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
| Cho'pon ota suv inshooti | 39.681374 | 67.052460 | 6 000 m³ (ochiq manbalardan) |
| Dagbit suv inshooti | 39.711825 | 66.954249 | 0,5 mln m³ (**taxminiy**) |

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
| `public/vendor/` | MapLibre GL JS 4.7.1 |

## Litsenziya eslatmasi

Asos xarita sifatida Google sun'iy yo'ldosh plitkalari to'g'ridan-to'g'ri ulangan; bu rasmiy litsenziyalangan yo'l emas. Ommaviy foydalanish uchun Esri qatlamiga o'ting yoki Google Maps API kalitidan foydalaning.
