import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

const BUCKET = "maintenance-request-attachments";

function attachmentBlob(label) {
  return new Blob([`maintenance attachment: ${label}`], { type: "text/plain" });
}

function attachmentPath({ accountId, requestId, filename = `${randomUUID()}.txt` }) {
  return `account/${accountId}/maintenance_requests/${requestId}/${filename}`;
}

function expectStorageDenied(result) {
  expect(result.data === null || result.data === undefined || Array.isArray(result.data)).toBe(true);
  if (Array.isArray(result.data)) {
    expect(result.data).toEqual([]);
  }
  expect(result.error).toBeTruthy();
}

describe.skipIf(!isIntegrationHarnessConfigured())("maintenance request attachment storage security", () => {
  const admin = getIntegrationAdminClient();
  const createdPaths = new Set();
  const createdRequestIds = new Set();

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdPaths.size > 0) {
      const paths = Array.from(createdPaths);
      createdPaths.clear();
      await admin.storage.from(BUCKET).remove(paths);
    }

    if (createdRequestIds.size > 0) {
      const ids = Array.from(createdRequestIds);
      createdRequestIds.clear();
      const { error } = await admin.from("maintenance_requests").delete().in("id", ids);
      expect(error).toBeNull();
    }
  });

  async function seedStorageObject(path) {
    createdPaths.add(path);
    await admin.storage.from(BUCKET).remove([path]);

    const upload = await admin.storage.from(BUCKET).upload(path, attachmentBlob(path), {
      contentType: "text/plain",
      upsert: false,
    });

    expect(upload.error).toBeNull();
  }

  async function createClosedTenantRequest() {
    const id = randomUUID();
    const insert = await admin.from("maintenance_requests").insert({
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      title: "Closed attachment request",
      description: "Closed request used by attachment policy tests",
      priority: "normal",
      status: "closed",
    });

    expect(insert.error).toBeNull();
    createdRequestIds.add(id);
    return id;
  }

  it("allows a tenant to upload, read, sign, and remove attachments for their own open request", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");
    const path = attachmentPath({
      accountId: isolationFixtures.accounts.accountA.id,
      requestId: isolationSeedIds.requestIds.accountA,
      filename: "tenant-own-request.txt",
    });
    createdPaths.add(path);

    const upload = await client.storage.from(BUCKET).upload(path, attachmentBlob("tenant-own"), {
      contentType: "text/plain",
      upsert: false,
    });

    expect(upload.error).toBeNull();

    const download = await client.storage.from(BUCKET).download(path);
    expect(download.error).toBeNull();
    expect(download.data).toBeTruthy();

    const signed = await client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toContain(BUCKET);

    const removed = await client.storage.from(BUCKET).remove([path]);
    expect(removed.error).toBeNull();
    createdPaths.delete(path);
  });

  it("allows account managers to manage attachments for in-account maintenance requests", async () => {
    const { client } = await signInAsFixtureUser("staffA");
    const path = attachmentPath({
      accountId: isolationFixtures.accounts.accountA.id,
      requestId: isolationSeedIds.requestIds.accountA,
      filename: "staff-request.txt",
    });
    createdPaths.add(path);

    const upload = await client.storage.from(BUCKET).upload(path, attachmentBlob("staff"), {
      contentType: "text/plain",
      upsert: false,
    });
    expect(upload.error).toBeNull();

    const signed = await client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();

    const removed = await client.storage.from(BUCKET).remove([path]);
    expect(removed.error).toBeNull();
    createdPaths.delete(path);
  });

  it("allows assigned contractors to read but not upload or delete request attachments", async () => {
    const path = attachmentPath({
      accountId: isolationFixtures.accounts.accountA.id,
      requestId: isolationSeedIds.requestIds.accountA,
      filename: "contractor-visible.txt",
    });
    await seedStorageObject(path);

    const { client } = await signInAsFixtureUser("contractorA1");

    const signed = await client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toContain(BUCKET);

    const uploadPath = attachmentPath({
      accountId: isolationFixtures.accounts.accountA.id,
      requestId: isolationSeedIds.requestIds.accountA,
      filename: "contractor-upload-denied.txt",
    });
    const upload = await client.storage.from(BUCKET).upload(uploadPath, attachmentBlob("denied"), {
      contentType: "text/plain",
      upsert: false,
    });
    expectStorageDenied(upload);

    const removed = await client.storage.from(BUCKET).remove([path]);
    expect(removed.error).toBeNull();
    expect(removed.data).toEqual([]);

    const stillExists = await admin.storage.from(BUCKET).download(path);
    expect(stillExists.error).toBeNull();
  });

  it("denies tenant access to foreign request attachments and closed-request uploads", async () => {
    const foreignPath = attachmentPath({
      accountId: isolationFixtures.accounts.accountB.id,
      requestId: isolationSeedIds.requestIds.accountB,
      filename: "foreign-request.txt",
    });
    await seedStorageObject(foreignPath);

    const closedRequestId = await createClosedTenantRequest();
    const closedPath = attachmentPath({
      accountId: isolationFixtures.accounts.accountA.id,
      requestId: closedRequestId,
      filename: "closed-request.txt",
    });

    const { client } = await signInAsFixtureUser("tenantA1");

    const foreignSigned = await client.storage.from(BUCKET).createSignedUrl(foreignPath, 60);
    expectStorageDenied(foreignSigned);

    const foreignUpload = await client.storage
      .from(BUCKET)
      .upload(foreignPath.replace("foreign-request.txt", "foreign-upload-denied.txt"), attachmentBlob("foreign"), {
        contentType: "text/plain",
        upsert: false,
      });
    expectStorageDenied(foreignUpload);

    const closedUpload = await client.storage.from(BUCKET).upload(closedPath, attachmentBlob("closed"), {
      contentType: "text/plain",
      upsert: false,
    });
    expectStorageDenied(closedUpload);
  });

  it("denies malformed attachment paths even for in-account managers", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const malformedPath =
      `account/${isolationFixtures.accounts.accountA.id}/maintenance_requests/not-a-uuid/malformed.txt`;

    const upload = await client.storage.from(BUCKET).upload(malformedPath, attachmentBlob("malformed"), {
      contentType: "text/plain",
      upsert: false,
    });

    expectStorageDenied(upload);
  });
});
