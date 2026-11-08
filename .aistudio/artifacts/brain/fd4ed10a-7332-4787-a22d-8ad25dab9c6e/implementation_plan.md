# Implementation Plan: Custom Domain for Shareable Links (rfnsyhmi.dpdns.org)

Configure `https://rfnsyhmi.dpdns.org` as the base domain for generated shareable document links in **Docs & Notes**, while retaining fallback options.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Custom Base URL**: Shareable links generated via the "Kongsi Dokumen" modal will use `https://rfnsyhmi.dpdns.org/docs?doc=ID` as requested.
> - **Fallback & Environment Support**: If deployed on another domain or preview URL, it can dynamically fall back or use `https://rfnsyhmi.dpdns.org` as the primary custom domain base.

- **Confirmed Decision**: Use `https://rfnsyhmi.dpdns.org` as the default base URL for generated shareable document links.

---

## 1. Overview & Core Changes

1. **Update Share Modal in `DocsNotes.tsx`**:
   - Change the shareable link generator to prefix with `https://rfnsyhmi.dpdns.org/docs?doc=ID`.
   - Provide a toggle or quick view showing the custom domain URL.

---

## 2. Implementation Steps

1. **Update `src/pages/DocsNotes.tsx`**:
   - Define custom domain constant `const CUSTOM_DOMAIN = "https://rfnsyhmi.dpdns.org";`.
   - Update the read-only input and clipboard copy action in the share modal to use `https://rfnsyhmi.dpdns.org/docs?doc=${selectedDocId}`.
2. **Compile & Lint Verification**:
   - Verify build and TypeScript checks pass.
