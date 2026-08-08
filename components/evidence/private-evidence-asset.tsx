"use client";

import { ExternalLink, FileImage, FileText, LoaderCircle, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatEvidenceFileSize } from "@/lib/evidence/file-capture";
import { createPrivateEvidenceAssetUrl } from "@/lib/research/repository";
import type { EvidenceAsset } from "@/lib/types";

export function PrivateEvidenceAsset({ asset }: { asset: EvidenceAsset }) {
  const [signedUrl, setSignedUrl] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const loadSignedUrl = useCallback(async () => {
    setStatus((current) => current === "ready" ? current : "loading");
    try {
      setSignedUrl(await createPrivateEvidenceAssetUrl(asset));
      setStatus("ready");
    } catch {
      setSignedUrl("");
      setStatus("error");
    }
  }, [asset]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadSignedUrl(), 0);
    const refreshTimer = window.setInterval(() => void loadSignedUrl(), 4 * 60 * 1_000);
    return () => {
      window.clearTimeout(loadTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadSignedUrl]);

  const safeBackgroundUrl = signedUrl.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

  return (
    <div className="private-evidence-asset">
      {asset.kind === "image" && signedUrl ? (
        <a
          className="private-evidence-asset__preview"
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open private image ${asset.originalFilename}`}
          style={{ backgroundImage: `url("${safeBackgroundUrl}")` }}
        />
      ) : (
        <span className="private-evidence-asset__file">
          {status === "loading" ? <LoaderCircle className="spin" size={19} /> : asset.kind === "image" ? <FileImage size={19} /> : <FileText size={19} />}
        </span>
      )}
      <div>
        <strong>{asset.originalFilename}</strong>
        <small>{formatEvidenceFileSize(asset.byteSize)} · Private {asset.kind}</small>
      </div>
      {signedUrl ? (
        <a className="private-evidence-asset__open" href={signedUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open file</a>
      ) : status === "error" ? (
        <button className="private-evidence-asset__open" type="button" onClick={() => void loadSignedUrl()}><RotateCw size={13} />Retry</button>
      ) : <span className="private-evidence-asset__loading">Preparing…</span>}
    </div>
  );
}
