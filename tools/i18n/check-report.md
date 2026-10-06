# App translations: meaning check (2026-10-06)

Every string Vox2 shows (287) was machine-translated into each language and then translated back into English. The back-translation is compared with what was meant, using the same model and scale as Vox2's match score. A string scores under 70 when its round trip says something noticeably different; those are listed in `check-flagged.json` for a person to read, and corrected in `fixes/<code>.json`.

This catches wrong-sense words ("clear" read as "transparent") and mangled phrases. It can't catch a translation that is wrong in a way that translates back correctly, so a native speaker's read is still worth more. Corrections are welcome: edit `fixes/<code>.json` and run `translate.mjs`.

| Language | Avg. score | Under 70 | Fixed by hand | Hand fixes total |
|---|---|---|---|---|
| Afrikaans (`af`) | 97 | 10 | 0 | 0 |
| Albanian (`sq`) | 95 | 15 | 0 | 0 |
| Amharic (`am`) | 89 | 41 | 0 | 0 |
| Arabic (`ar`) | 93 | 21 | 8 | 10 |
| Armenian (`hy`) | 95 | 15 | 0 | 0 |
| Assamese (`as`) | 97 | 13 | 0 | 0 |
| Aymara (`ay`) | 78 | 82 | 0 | 0 |
| Azerbaijani (`az`) | 93 | 25 | 0 | 0 |
| Bambara (`bm`) | 80 | 72 | 0 | 0 |
| Basque (`eu`) | 95 | 18 | 0 | 0 |
| Belarusian (`be`) | 95 | 17 | 0 | 0 |
| Bengali (`bn`) | 96 | 14 | 0 | 0 |
| Bhojpuri (`bho`) | 95 | 22 | 0 | 0 |
| Bosnian (`bs`) | 97 | 9 | 0 | 0 |
| Bulgarian (`bg`) | 96 | 13 | 0 | 0 |
| Catalan (`ca`) | 95 | 18 | 0 | 0 |
| Cebuano (`ceb`) | 97 | 13 | 0 | 0 |
| Chichewa (`ny`) | 79 | 72 | 0 | 0 |
| Chinese (Simplified) (`zh-CN`) | 95 | 19 | 7 | 8 |
| Chinese (Traditional) (`zh-TW`) | 95 | 19 | 8 | 9 |
| Corsican (`co`) | 96 | 19 | 0 | 0 |
| Croatian (`hr`) | 96 | 13 | 0 | 0 |
| Czech (`cs`) | 95 | 19 | 0 | 0 |
| Danish (`da`) | 96 | 15 | 0 | 0 |
| Dhivehi (`dv`) | 93 | 27 | 0 | 0 |
| Dogri (`doi`) | 94 | 21 | 0 | 0 |
| Dutch (`nl`) | 97 | 13 | 0 | 0 |
| Esperanto (`eo`) | 98 | 8 | 0 | 0 |
| Estonian (`et`) | 95 | 19 | 0 | 0 |
| Ewe (`ee`) | 84 | 55 | 0 | 0 |
| Filipino (`tl`) | 98 | 8 | 3 | 3 |
| Finnish (`fi`) | 95 | 17 | 0 | 0 |
| French (`fr`) | 96 | 12 | 2 | 3 |
| Frisian (`fy`) | 97 | 9 | 0 | 0 |
| Galician (`gl`) | 96 | 18 | 0 | 0 |
| Georgian (`ka`) | 92 | 27 | 0 | 0 |
| German (`de`) | 95 | 17 | 5 | 7 |
| Greek (`el`) | 95 | 19 | 0 | 0 |
| Guarani (`gn`) | 83 | 61 | 0 | 0 |
| Gujarati (`gu`) | 97 | 9 | 0 | 0 |
| Haitian Creole (`ht`) | 94 | 18 | 0 | 0 |
| Hausa (`ha`) | 88 | 41 | 0 | 0 |
| Hawaiian (`haw`) | 76 | 89 | 0 | 0 |
| Hebrew (`iw`) | 93 | 24 | 0 | 0 |
| Hindi (`hi`) | 97 | 11 | 5 | 5 |
| Hmong (`hmn`) | 81 | 69 | 0 | 0 |
| Hungarian (`hu`) | 94 | 24 | 0 | 0 |
| Icelandic (`is`) | 96 | 15 | 0 | 0 |
| Igbo (`ig`) | 84 | 55 | 0 | 0 |
| Ilocano (`ilo`) | 94 | 19 | 0 | 0 |
| Indonesian (`id`) | 96 | 16 | 0 | 0 |
| Irish (`ga`) | 97 | 9 | 0 | 0 |
| Italian (`it`) | 96 | 16 | 1 | 2 |
| Japanese (`ja`) | 96 | 15 | 2 | 3 |
| Javanese (`jw`) | 95 | 16 | 0 | 0 |
| Kannada (`kn`) | 96 | 19 | 0 | 0 |
| Kazakh (`kk`) | 93 | 24 | 0 | 0 |
| Khmer (`km`) | 87 | 46 | 0 | 0 |
| Kinyarwanda (`rw`) | 72 | 96 | 0 | 0 |
| Konkani (`gom`) | 93 | 27 | 0 | 0 |
| Korean (`ko`) | 95 | 19 | 3 | 5 |
| Krio (`kri`) | 95 | 16 | 0 | 0 |
| Kurdish (Kurmanji) (`ku`) | 91 | 26 | 0 | 0 |
| Kurdish (Sorani) (`ckb`) | 94 | 23 | 0 | 0 |
| Kyrgyz (`ky`) | 93 | 26 | 0 | 0 |
| Lao (`lo`) | 92 | 30 | 0 | 0 |
| Latin (`la`) | 87 | 47 | 0 | 0 |
| Latvian (`lv`) | 98 | 6 | 0 | 0 |
| Lingala (`ln`) | 87 | 47 | 0 | 0 |
| Lithuanian (`lt`) | 94 | 19 | 0 | 0 |
| Luganda (`lg`) | 86 | 52 | 0 | 0 |
| Luxembourgish (`lb`) | 97 | 13 | 0 | 0 |
| Macedonian (`mk`) | 95 | 17 | 0 | 0 |
| Maithili (`mai`) | 96 | 15 | 0 | 0 |
| Malagasy (`mg`) | 85 | 50 | 0 | 0 |
| Malay (`ms`) | 97 | 10 | 0 | 0 |
| Malayalam (`ml`) | 97 | 11 | 0 | 0 |
| Maltese (`mt`) | 98 | 10 | 0 | 0 |
| Maori (`mi`) | 82 | 65 | 0 | 0 |
| Marathi (`mr`) | 97 | 13 | 0 | 0 |
| Meiteilon (Manipuri) (`mni-Mtei`) | 91 | 30 | 0 | 0 |
| Mizo (`lus`) | 92 | 24 | 0 | 0 |
| Mongolian (`mn`) | 92 | 26 | 0 | 0 |
| Myanmar (Burmese) (`my`) | 94 | 20 | 0 | 0 |
| Nepali (`ne`) | 97 | 9 | 0 | 0 |
| Norwegian (`no`) | 96 | 13 | 0 | 0 |
| Odia (Oriya) (`or`) | 94 | 17 | 0 | 0 |
| Oromo (`om`) | 88 | 47 | 0 | 0 |
| Pashto (`ps`) | 94 | 20 | 0 | 0 |
| Persian (`fa`) | 95 | 16 | 0 | 0 |
| Polish (`pl`) | 95 | 16 | 0 | 0 |
| Portuguese (`pt`) | 97 | 11 | 1 | 2 |
| Punjabi (`pa`) | 96 | 15 | 0 | 0 |
| Quechua (`qu`) | 83 | 60 | 0 | 0 |
| Romanian (`ro`) | 95 | 15 | 0 | 0 |
| Russian (`ru`) | 94 | 18 | 5 | 7 |
| Samoan (`sm`) | 83 | 55 | 0 | 0 |
| Sanskrit (`sa`) | 92 | 31 | 0 | 0 |
| Scots Gaelic (`gd`) | 91 | 31 | 0 | 0 |
| Sepedi (`nso`) | 88 | 40 | 0 | 0 |
| Serbian (`sr`) | 96 | 12 | 0 | 0 |
| Sesotho (`st`) | 86 | 49 | 0 | 0 |
| Shona (`sn`) | 84 | 57 | 0 | 0 |
| Sindhi (`sd`) | 91 | 32 | 0 | 0 |
| Sinhala (`si`) | 96 | 13 | 0 | 0 |
| Slovak (`sk`) | 96 | 15 | 0 | 0 |
| Slovenian (`sl`) | 96 | 13 | 0 | 0 |
| Somali (`so`) | 89 | 43 | 0 | 0 |
| Spanish (`es`) | 96 | 12 | 2 | 3 |
| Sundanese (`su`) | 95 | 15 | 0 | 0 |
| Swahili (`sw`) | 88 | 47 | 0 | 0 |
| Swedish (`sv`) | 96 | 16 | 0 | 0 |
| Tajik (`tg`) | 93 | 21 | 0 | 0 |
| Tamil (`ta`) | 94 | 23 | 0 | 0 |
| Tatar (`tt`) | 90 | 31 | 0 | 0 |
| Telugu (`te`) | 97 | 11 | 0 | 0 |
| Thai (`th`) | 94 | 22 | 0 | 0 |
| Tigrinya (`ti`) | 88 | 40 | 0 | 0 |
| Tsonga (`ts`) | 87 | 43 | 0 | 0 |
| Turkish (`tr`) | 95 | 17 | 0 | 0 |
| Turkmen (`tk`) | 87 | 47 | 0 | 0 |
| Twi (`ak`) | 84 | 57 | 0 | 0 |
| Ukrainian (`uk`) | 93 | 24 | 0 | 0 |
| Urdu (`ur`) | 95 | 19 | 0 | 0 |
| Uyghur (`ug`) | 87 | 43 | 0 | 0 |
| Uzbek (`uz`) | 93 | 26 | 0 | 0 |
| Vietnamese (`vi`) | 95 | 22 | 16 | 212 |
| Welsh (`cy`) | 98 | 5 | 0 | 0 |
| Xhosa (`xh`) | 89 | 36 | 0 | 0 |
| Yiddish (`yi`) | 97 | 10 | 0 | 0 |
| Yoruba (`yo`) | 86 | 49 | 0 | 0 |
| Zulu (`zu`) | 93 | 21 | 0 | 0 |
