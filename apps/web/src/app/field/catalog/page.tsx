import type { Metadata } from "next";
import { CatalogBrowse } from "@/components/field/sale/catalog-browse";

export const metadata: Metadata = { title: "Catalog" };
export default function CatalogPage() { return <CatalogBrowse />; }
