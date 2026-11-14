import { z } from "zod";

// De URL-controle voor een vindbron (Admin → Sales → Vindbronnen): één bron toevoegen (app/api/admin/sales/sources) en
// meerdere tegelijk plakken (…/sources/plakken) gebruiken precies dezelfde. Een route mag zelf geen losse waarden exporteren.
export const bronUrlSchema = z.string().trim().url().max(400);
