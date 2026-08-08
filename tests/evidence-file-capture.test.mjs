import assert from "node:assert/strict";
import test from "node:test";
import {
  createEvidenceStoragePath,
  EVIDENCE_ASSET_BUCKET,
  formatEvidenceFileSize,
  MAX_EVIDENCE_FILE_BYTES,
  validateEvidenceFile,
} from "../lib/evidence/file-capture.ts";

test("private evidence accepts only the supported file allowlist", () => {
  assert.deepEqual(validateEvidenceFile({ name: "signal.png", type: "image/png", size: 1_024 }), {
    ok: true,
    mimeType: "image/png",
    kind: "image",
  });
  assert.deepEqual(validateEvidenceFile({ name: "report.pdf", type: "application/pdf", size: 2_048 }), {
    ok: true,
    mimeType: "application/pdf",
    kind: "document",
  });
  assert.equal(validateEvidenceFile({ name: "vector.svg", type: "image/svg+xml", size: 512 }).ok, false);
  assert.equal(validateEvidenceFile({ name: "movie.mp4", type: "video/mp4", size: 512 }).ok, false);
});

test("private evidence rejects empty and oversized files", () => {
  assert.equal(validateEvidenceFile({ name: "empty.png", type: "image/png", size: 0 }).ok, false);
  assert.equal(validateEvidenceFile({ name: "large.pdf", type: "application/pdf", size: MAX_EVIDENCE_FILE_BYTES + 1 }).ok, false);
});

test("storage paths are uploader and project scoped without retaining unsafe filename characters", () => {
  const path = createEvidenceStoragePath({
    userId: "user-id",
    projectId: "project-id",
    researchClientRef: "research-id",
    filename: "Cultural tension (final) #2.PNG",
    mimeType: "image/png",
    randomUuid: () => "asset-id",
  });

  assert.equal(EVIDENCE_ASSET_BUCKET, "evidence-assets");
  assert.equal(path, "user-id/project-id/research-id/asset-id-Cultural-tension-final-2.png");
  assert.equal(formatEvidenceFileSize(1_048_576), "1.0 MB");
});
