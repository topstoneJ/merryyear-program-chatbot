"use client";
import { useEffect, useState } from "react";
import { BRAND_IMAGE_MAX_BYTES, BRAND_IMAGE_TYPES } from "@/app/branding";

export default function BrandImageUpload({ title, hint, currentUrl, value, onChange, disabled, wide = false, onDefault, onReset, generating = false }: {
  title: string; hint: string; currentUrl: string; value: File | null; onChange: (file: File | null) => void; disabled: boolean; wide?: boolean; onDefault?: () => void; onReset?: () => void; generating?: boolean;
}) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!value) { setPreview(""); return; }
    const url = URL.createObjectURL(value); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  return <div className={`brand-image-field ${wide ? "brand-image-wide" : ""}`}>
    <label className="field"><span className="sr-only">{title}</span><small className="field-help">{hint}</small>
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!BRAND_IMAGE_TYPES.includes(file.type) || file.size > BRAND_IMAGE_MAX_BYTES || !file.size) {
          setError("3MB 이하의 PNG·JPG·WEBP 이미지 파일을 선택해 주세요."); event.target.value = ""; return;
        }
        setError(""); onChange(file); event.target.value = "";
      }} />
    </label>
    <div className="brand-image-preview"><img src={preview || currentUrl} alt={`${title} 미리보기`} /><span>{value?.name || "현재 이미지"}</span></div>
    {onDefault && <div className="default-social-action"><button type="button" className="cancel-button" disabled={disabled} onClick={onDefault}>{generating ? "생성·등록 중…" : "기본 이미지"}</button><small className="field-help">흰색 배경 중앙에 기관 로고를 배치한 이미지를 생성해 바로 등록합니다.</small></div>}
    {onReset && <button type="button" className="cancel-button design-reset-button" disabled={disabled} onClick={onReset}>초기화</button>}
    {value && <button type="button" className="cancel-button" disabled={disabled} onClick={() => { onChange(null); setError(""); }}>선택 취소</button>}
    {error && <p className="answer-settings-error" role="alert">{error}</p>}
  </div>;
}
