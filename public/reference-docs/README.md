# Referans Dokümanları

PDF/EPUB kaynakları bu klasöre ekleyebiliriz. Appwrite env değişkenleri girildiğinde uygulama `reference_documents` ve `reference_chunks` koleksiyonlarını okur.

Appwrite henüz yapılandırılmadıysa uygulama `lib/knowledge/reference-corpus.ts` içindeki gömülü bootstrap kaynak parçalarına döner.

Sonraki adımda bu klasöre eklenecek dosyalar için:

- metin çıkarma,
- sayfa/konum bazlı chunk üretimi,
- embedding,
- kaynak gösterimli ajan yanıtı

katmanı eklenebilir.
