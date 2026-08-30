# نتائج تشخيص YouTube Error 153

## تاريخ الفحص
2026-08-16

## الفيديو المختبر
- Video ID: `bZ_uV-dYkx0`
- عنوان الفيديو: `حصة الرياضيات — السنة الأولى`

## النتيجة
- صفحة YouTube العادية `https://www.youtube.com/watch?v=bZ_uV-dYkx0` حمّلت المشغل وأظهرت مدة `0:46`، ما يؤكد أن الفيديو موجود وقابل للتشغيل على YouTube.
- رابط التضمين المباشر `https://www.youtube.com/embed/bZ_uV-dYkx0?...&origin=https://minasaty-app-2026.azurewebsites.net` أظهر `Error 153 — Video player configuration error` قبل فتحه من منصة الأكاديمية.
- لذلك فالخلل ليس في صلاحية الطالب أو مستودع الدروس فقط، وليس مجرد مشكلة CSS في نافذة المشاهدة. الخلل مرتبط بمسار التضمين/هوية المشغل أو إعدادات الفيديو/YouTube API.

## ملاحظة مهمة
تشغيل صفحة YouTube العادية لا يثبت أن التضمين مسموح. يجب فحص إعداد `status.embeddable` فعلياً عبر YouTube Data API أو اختبار إعدادات المشغل من نفس أصل المنصة، وعدم الاكتفاء برسالة `FIXED` من مسار الصيانة.

## الملفات ذات الصلة
- `services/youtubeService.js`
- `controllers/lessonVideoController.js`
- `controllers/scheduleController.js`
- `public/js/parent-dashboard.js`
- `public/js/class-registry-parent.js`

## الخطوة التالية
فحص HTML/DOM الفعلي للـ iframe، سياسة `referrerpolicy`، رابط التضمين النهائي من API، وإعدادات YouTube API للفيديو، ثم اختيار حل موثوق بديل إذا استمر Error 153.

## قرينة إضافية من الكود والإرشادات
- `server.js` يضبط Helmet على `referrerPolicy: { policy: "no-referrer" }`.
- نتائج البحث المتخصصة حول Error 153 تشير إلى أن مشغل YouTube يحتاج HTTP Referer صالحاً، وأن `no-referrer` يسبب الخطأ. راجع [YouTube Error 153 — BoldDesk](https://support.bolddesk.com/kb/article/23115/troubleshooting-youtube-error-153-issues-in-bolddesk)، [Chromium discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/OUJad0q-d_g)، و[University of Michigan guidance](https://teamdynamix.umich.edu/TDClient/30/Portal/KB/Article/14491/Fixing-YouTube-Player-Error-153-with-Referrer-Policy-Settings).
- هذا يفسر لماذا يعمل الفيديو في صفحة YouTube العادية لكنه يفشل داخل التضمين: الموقع يمنع إرسال الـ Referer، وإضافة `origin=` في URL لا تعوض عن HTTP Referer المطلوب للمشغل.
- الإصلاح المرجح: تغيير سياسة HTTP إلى `strict-origin-when-cross-origin`، وإضافة `referrerpolicy="strict-origin-when-cross-origin"` إلى iframe، مع إبقاء `origin=https://minasaty-app-2026.azurewebsites.net` في URL.
