import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowse } from "@/components/field/sale/catalog-browse";

export const metadata: Metadata = { title: "Catalog" };
export default function CatalogPage() { return <Suspense><CatalogBrowse /></Suspense>; }
