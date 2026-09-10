"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Brand = { organizationName: string; logoUrl: string };

const DEFAULT_BRAND: Brand = {
  organizationName: "기관명 미설정",
  logoUrl: "/default-organization-logo.svg",
};

export default function BrandLink({ className = "brand brand-logo" }: { className?: string }) {
  const [brand, setBrand] = useState(DEFAULT_BRAND);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("settings_load_failed")))
      .then(payload => payload.settings && setBrand({
        organizationName: payload.settings.organizationName || DEFAULT_BRAND.organizationName,
        logoUrl: payload.settings.logoUrl || DEFAULT_BRAND.logoUrl,
      }))
      .catch(() => undefined);
  }, []);

  return <Link className={className} href="/" aria-label={`${brand.organizationName} 사업 안내 챗봇 홈`}>
    <img src={brand.logoUrl} alt={brand.organizationName} width={210} height={53} />
    <b>사업 안내 챗봇</b>
  </Link>;
}
