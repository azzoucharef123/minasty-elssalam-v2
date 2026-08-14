تشخيص Google Picker — 2026-08-14

- API key 1 من مشروع My Project 40067 يطابق مشروع OAuth، وهو مقيّد بـ Google Picker API وGoogle Drive API.
- اختبار Drive API باستخدام Referer https://dr.africacold.fr/teacher-dashboard.html وصل إلى Google وأعاد insufficientFilePermissions، ما يؤكد أن المفتاح نفسه مقبول.
- أضيفت قيود المواقع: https://dr.africacold.fr وhttps://dr.africacold.fr/teacher-dashboard.html وhttps://minasaty-production-22f8.up.railway.app/.
- استُبدل Google Picker المتعطل بمنتقي داخلي في الالتزام 6f06e6e، لكنه يحتاج OAuth scope drive.metadata.readonly لعرض قائمة الملفات.
- تم تعديل teacher-dashboard.js محليًا لطلب drive.file + drive.metadata.readonly، ولم يُنشر هذا التعديل بعد.
- في Google Auth Platform → Data Access أُضيفت drive.metadata.readonly إلى جدول Drive scopes، لكن زر Save النهائي لم يُتحقق من ضغطه بعد.
- الخطوة التالية: حفظ Data Access، نشر التعديل الجديد، ثم اختبار القائمة الداخلية في لوحة الأستاذ.
