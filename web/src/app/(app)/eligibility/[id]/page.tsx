import { redirect } from "next/navigation";

/** The checklist lives on the product page's Eligibility Checker tab. */
export default async function EligibilityChecklist({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/products/${encodeURIComponent(id)}?tab=eligibility`);
}
