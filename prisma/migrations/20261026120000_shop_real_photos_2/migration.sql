-- Echte productfoto's voor 4 extra PBM-producten (self-hosted in /public/shop/),
-- bron Pixabay (royalty-vrij, commercieel toegestaan, geen bronvermelding nodig).
-- Vervangt de generieke /shifts/*.jpg. De overige producten blijven ongewijzigd.
UPDATE "ShopProduct" SET "imageUrl" = '/shop/antislip-werkschoenen-ob.jpg', "modelPhotoUrl" = NULL, "imageUploadId" = NULL WHERE "slug" = 'antislip-werkschoenen-ob';
UPDATE "ShopProduct" SET "imageUrl" = '/shop/werkhandschoenen-grip.jpg', "modelPhotoUrl" = NULL, "imageUploadId" = NULL WHERE "slug" = 'werkhandschoenen-grip';
UPDATE "ShopProduct" SET "imageUrl" = '/shop/werk-tshirt-2pack.jpg', "modelPhotoUrl" = NULL, "imageUploadId" = NULL WHERE "slug" = 'werk-tshirt-2pack';
UPDATE "ShopProduct" SET "imageUrl" = '/shop/werkbroek-kniezakken.jpg', "modelPhotoUrl" = NULL, "imageUploadId" = NULL WHERE "slug" = 'werkbroek-kniezakken';
