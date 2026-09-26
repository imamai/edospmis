"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setTenantLogo } from "./actions";

const BUCKET = "edospmis-branding";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Real upload, replacing the old plain-text "Logo URL" field. The browser
 * uploads straight to Supabase Storage (server actions aren't built for
 * binary payloads); a fixed per-tenant filename (`logo.<ext>`, upsert:true)
 * means re-uploading replaces the old one instead of accumulating orphans.
 * The bucket is public — lib/export/document.ts's fetchLogoDataUrl() does a
 * plain unauthenticated fetch(url) when it builds a PDF, so the URL has to
 * be fetchable without a session.
 */
export function LogoUpload({ tenantId, currentUrl }: { tenantId: string; currentUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Logo must be a PNG or JPEG image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Keep the logo under 2MB.");
      return;
    }
    setUploading(true);
    setError(null);

    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${tenantId}/logo.${ext}`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Cache-bust: the filename is fixed, so a re-upload needs a fresh query
    // string or the browser (and fetchLogoDataUrl's own fetch) keeps the old
    // cached bytes under the same URL.
    const bustedUrl = `${data.publicUrl}?v=${Date.now()}`;

    startTransition(async () => {
      const result = await setTenantLogo(bustedUrl);
      setUploading(false);
      if (result.error) return setError(result.error);
      setPreview(bustedUrl);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink">Logo</label>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-sunk">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Tenant logo" className="h-full w-full object-contain" />
          ) : (
            <ImageUp className="h-5 w-5 text-ink-faint" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="w-fit cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand hover:text-brand">
            {uploading ? "Uploading…" : preview ? "Change logo" : "Upload logo"}
            <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={onFileChange} disabled={uploading} className="hidden" />
          </label>
          <p className="text-xs text-ink-faint">PNG or JPEG, up to 2MB. Printed on generated POs, invoices and contracts.</p>
          {error && <p className="text-xs text-critical">{error}</p>}
        </div>
      </div>
    </div>
  );
}
