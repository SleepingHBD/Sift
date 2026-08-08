import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceDestinationFromDatabase,
  evidenceDestinationToDatabase,
  evidenceLinkFromRow,
} from "../lib/radar/annotation-model.ts";

const mention = {
  id: "monitor-local:youtube:video-1",
  cloudId: "cloud-mention",
  cloudProjectId: "cloud-project",
};

test("Radar annotation destinations use explicit database vocabulary", () => {
  assert.equal(evidenceDestinationToDatabase("insight"), "insight_evidence");
  assert.equal(evidenceDestinationToDatabase("new-insight"), "insight_seed");
  assert.equal(evidenceDestinationFromDatabase("insight_evidence"), "insight");
  assert.equal(evidenceDestinationFromDatabase("insight_seed"), "new-insight");
  assert.equal(evidenceDestinationFromDatabase("saved"), null);
});

test("saved evidence rows hydrate stable client and cloud references", () => {
  const link = evidenceLinkFromRow({
    id: "saved-row",
    project_id: "cloud-project",
    item_id: "cloud-mention",
    destination: "research",
    destination_id: "cloud-research",
    note: "A useful behaviour signal.",
    source_excerpt: "Conversation excerpt",
    metadata: {
      destination_label: "Community research",
      destination_client_ref: "research-local",
    },
    created_at: "2026-08-08T06:00:00.000Z",
  }, mention);

  assert.deepEqual(link, {
    id: "saved-row",
    cloudId: "saved-row",
    mentionId: "monitor-local:youtube:video-1",
    destination: "research",
    destinationId: "research-local",
    destinationCloudId: "cloud-research",
    destinationLabel: "Community research",
    note: "A useful behaviour signal.",
    createdAt: "2026-08-08T06:00:00.000Z",
  });
});
