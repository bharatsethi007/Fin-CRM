import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const AKAHU_TOKEN_URL = "https://api.akahu.io/v1/token";

export type RevokeAkahuResult = {
  revokedIds: string[];
  failed: { id: string; message: string }[];
};

/**
 * Loads active Akahu connections for a firm, revokes each user token at Akahu,
 * then sets status to `revoked` in `akahu_connections`.
 * Expects columns: id, akahu_user_token, firm_id, status.
 */
export async function revokeAkahuTokensForFirm(
  supabase: SupabaseClient,
  firmId: string,
  akahuAppToken: string,
): Promise<RevokeAkahuResult> {
  const { data: rows, error } = await supabase
    .from("akahu_connections")
    .select("id, akahu_user_token")
    .eq("firm_id", firmId)
    .eq("status", "active");

  if (error) throw error;

  const revokedIds: string[] = [];
  const failed: { id: string; message: string }[] = [];

  for (const row of rows ?? []) {
    const id = row.id as string;
    const token = row.akahu_user_token as string | null;
    if (!token?.trim()) {
      failed.push({ id, message: "Missing akahu_user_token" });
      continue;
    }

    const res = await fetch(AKAHU_TOKEN_URL, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Akahu-Id": akahuAppToken,
      },
    });

    const bodyText = await res.text();
    const okToMarkRevoked =
      res.ok ||
      res.status === 404 ||
      res.status === 401;

    if (!okToMarkRevoked) {
      failed.push({ id, message: `${res.status} ${bodyText}` });
      continue;
    }

    const { error: upErr } = await supabase
      .from("akahu_connections")
      .update({ status: "revoked" })
      .eq("id", id);

    if (upErr) {
      failed.push({ id, message: upErr.message });
    } else {
      revokedIds.push(id);
    }
  }

  return { revokedIds, failed };
}
