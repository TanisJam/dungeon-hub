'use server';

// buyShopItem — Server Action wrapping POST /characters/:id/shop/buy.
// market-shop-buy-ui slice 3c. Price is server-authoritative (no `price` field in the
// request body — see ShopBuyBody, apps/api/src/http/routes/characters.ts:509).
//
// 201 { character, currency, addedInstanceId, warnings } → { ok: true, ... }
// 400 { error: 'VALIDATION_FAILED', issues: [...] } → { ok: false, issues }

import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export interface BuyItemRef {
  slug: string;
  source: string;
}

interface ShopBuySuccessBody {
  character: unknown;
  currency: unknown;
  addedInstanceId: string;
  warnings: unknown;
}

export type BuyShopItemResult =
  | ({ ok: true } & ShopBuySuccessBody)
  | { ok: false; issues: Array<{ code: string; [key: string]: unknown }> };

/**
 * buyShopItem — purchases a mundane item for the given character.
 * Never sends `price` — the API resolves cost server-side from the DB (REQ-PRICE-AUTH-01).
 */
export async function buyShopItem(
  characterId: string,
  item: BuyItemRef,
  quantity?: number,
): Promise<BuyShopItemResult> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, issues: [{ code: 'UNAUTHORIZED' }] };
  }

  try {
    const body: Record<string, unknown> = { item };
    if (quantity !== undefined) body.quantity = quantity;

    const res = await api.post<ShopBuySuccessBody>(
      `/characters/${characterId}/shop/buy`,
      body,
      session.access_token,
    );
    return { ok: true, ...res };
  } catch (err) {
    if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'issues' in err.body) {
      const issues = (err.body as { issues: Array<{ code: string; [key: string]: unknown }> }).issues;
      return { ok: false, issues };
    }
    return { ok: false, issues: [{ code: 'UNKNOWN_ERROR' }] };
  }
}
