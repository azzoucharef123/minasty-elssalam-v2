# حالة تكامل فيديوهات Google Drive

## النتيجة النهائية

تم استبدال Google Picker API بمنتقي داخلي داخل لوحة الأستاذ. الزر **اختيار فيديو من Google Drive** يطلب OAuth عبر Google Identity Services، ثم يقرأ ملفات الفيديو مباشرة من Drive API v3 ويعرضها في نافذة عربية RTL داخل الموقع.

عند اختيار ملف، يملأ النظام عنوان الفيديو ورابطه تلقائيًا، ثم يحفظه مباشرة في مستودع الدروس للمستوى المحدد.

## سبب الإصلاح

نافذة Google Picker كانت تتوقف عند رسالة `Missing required parameter: developerKey` رغم وجود مفتاح API صحيح، لذلك لم يعد المسار الجديد يستدعي `google.picker.PickerBuilder` أو `setDeveloperKey` أو مكتبة Google Picker.

## الصلاحيات المستخدمة

- `https://www.googleapis.com/auth/drive.file` لحفظ التسجيلات في Google Drive.
- `https://www.googleapis.com/auth/drive.metadata.readonly` لقراءة قائمة الفيديوهات الموجودة في Drive.

## الاختبار الحي

تم نشر الإصلاح في الالتزام `cb36645` على `main`، وتحقق نشره على `https://dr.africacold.fr/teacher-dashboard.html` بحساب الأستاذ. ظهرت داخل النافذة خمسة ملفات فيديو من Google Drive، مع الاسم والتاريخ والحجم، دون ظهور خطأ Developer Key.

## ملاحظة Google Cloud

قد تظهر الصلاحية `drive.metadata.readonly` في صفحة Data Access قبل تأكيد زر Save النهائي. هذا التسجيل الرسمي لا يمنع الاختبار الحالي؛ OAuth وDrive API يعملان بالفعل. إذا احتاج Google لاحقًا إلى إعادة شاشة الموافقة، يُستكمل حفظ الصلاحية من Google Auth Platform → Data Access → Add or remove scopes → Save.
