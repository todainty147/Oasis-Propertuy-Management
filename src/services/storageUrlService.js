import { supabase } from "../lib/supabase";

export async function createSignedStorageUrl(bucket, storagePath, expiresIn = 600) {
  if (!bucket) throw new Error("Missing storage bucket");
  if (!storagePath) throw new Error("Missing storage path");

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw error;
  return data?.signedUrl || null;
}
