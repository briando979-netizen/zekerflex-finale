-- Echte productfoto's voor 4 PBM-producten (self-hosted in /public/shop/),
-- ter vervanging van de generieke /shifts/*.jpg die eerder als productfoto
-- werd hergebruikt. De overige producten blijven ongewijzigd.
-- Bron/licentie: zie public/shop/CREDITS.md (3x CC BY-SA, 1x CC0).
UPDATE "ShopProduct" SET "imageUrl" = '/shop/veiligheidsschoenen-s3.jpg', "modelPhotoUrl" = NULL, "imageUploadId" = NULL WHERE "slug" = 'veiligheidsschoenen-s3';
UPDATE "ShopProduct" SET "imageUrl" = '/shop/snijbestendige-handschoenen.jpg', "modelPhotoUrl" = NULL, "imageUploadId" = NULL WHERE "slug" = 'snijbestendige-handschoenen';
UPDATE "ShopProduct" SET "imageUrl" = '/shop/gehoorbescherming-oordoppen.jpg', "modelPhotoUrl" = NULL, "imageUploadId" = NULL WHERE "slug" = 'gehoorbescherming-oordoppen';
UPDATE "ShopProduct" SET "imageUrl" = '/shop/veiligheidsbril-helder.jpg', "modelPhotoUrl" = NULL, "imageUploadId" = NULL WHERE "slug" = 'veiligheidsbril-helder';
