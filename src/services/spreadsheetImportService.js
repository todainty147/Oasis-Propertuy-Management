import { supabase } from "../lib/supabase";

/**
 * Submit parsed rows for one tab to the import RPC.
 *
 * @param {object} params
 * @param {string} params.accountId
 * @param {string} params.tab  'properties' | 'tenancies' | 'compliance' | 'maintenance'
 * @param {object[]} params.rows  Parsed row objects from spreadsheetParser
 * @param {string} params.sourceFilename  Original file name for the audit record
 * @param {string} [params.sourceFileHash]  SHA-256 hex of the file for idempotency
 * @returns {Promise<object>}  RPC result: { batch_id, total, imported, skipped, needs_review, error, rows }
 */
export async function processImportBatch({
  accountId,
  tab,
  rows,
  sourceFilename,
  sourceFileHash,
}) {

  try {
    const { data, error } = await supabase.rpc("process_import_batch", {
      p_account_id: accountId,
      p_tab: tab,
      p_rows: rows,
      p_source_filename: sourceFilename,
      p_source_file_hash: sourceFileHash ?? null,
    });

    if (error) throw error;
    return data;
  } catch (err) {
    throw err;
  }
}

/**
 * List recent import batches for an account.
 *
 * @param {object} params
 * @param {string} params.accountId
 * @param {number} [params.limit=20]
 * @returns {Promise<object[]>}
 */
export async function listImportBatches({ accountId, limit = 20 }) {

  try {
    const { data, error } = await supabase
      .from("import_batches")
      .select(
        "id, tab, source_filename, status, total_rows, imported_rows, skipped_rows, review_rows, error_rows, completed_at, created_at"
      )
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    throw err;
  }
}

/**
 * List row-level results for a specific batch.
 *
 * @param {object} params
 * @param {string} params.accountId
 * @param {string} params.batchId
 * @returns {Promise<object[]>}
 */
export async function listImportBatchRows({ accountId, batchId }) {

  try {
    const { data, error } = await supabase
      .from("import_batch_rows")
      .select("id, row_number, status, entity_type, entity_id, raw_row, review_reason, error_message")
      .eq("account_id", accountId)
      .eq("batch_id", batchId)
      .order("row_number", { ascending: true });

    if (error) throw error;
    return data ?? [];
  } catch (err) {
    throw err;
  }
}
