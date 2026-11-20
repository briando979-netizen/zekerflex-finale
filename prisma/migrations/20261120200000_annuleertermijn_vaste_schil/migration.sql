-- Annuleringstermijn per klus (lib/shifts/annuleertermijn.ts): het bedrijf kiest bij het plaatsen 24, 48, 72 of 168 uur;
-- bestaande klussen houden de 24 uur die altijd al gold (lib/claims/policy.ts, NOTICE_HOURS).
-- Vaste schil (lib/pools/vaste-schil.ts): een pool met autoAccept plant een lid direct in zodra het reageert tegen het
-- geplaatste tarief. Alleen toevoegen, met standaardwaarden: bestaande rijen en de oude code werken ongewijzigd door.

SET lock_timeout = '5s';

ALTER TABLE "Shift" ADD COLUMN "annuleerUren" INTEGER NOT NULL DEFAULT 24;

ALTER TABLE "FavoritePool" ADD COLUMN "autoAccept" BOOLEAN NOT NULL DEFAULT false;
