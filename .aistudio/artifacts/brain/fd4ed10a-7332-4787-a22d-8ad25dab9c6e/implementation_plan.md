# Implementation Plan: .docx Import & Secure Document Sharing

Add robust Word (`.docx`) file import capabilities and secure document sharing with link generation and collaboration access control to **Docs & Notes**.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Client-Side .docx Parsing**: Using the `mammoth` library to extract clean text/Markdown from uploaded `.docx` files instantly in the browser without server roundtrips.
> - **Secure Document Sharing**: Generate unique shareable links (`/docs?doc=ID`) and add collaborator emails/UIDs to the document's `sharedWith` array in Firestore, granting read & edit access in accordance with `firestore.rules`.

- **Confirmed Decision 1**: Client-side `.docx` parsing using `mammoth`.
- **Confirmed Decision 2**: Read & Edit collaboration for shared users via `sharedWith` permissions.

---

## 1. Overview & Core Features

1. **Word (.docx) Import**:
   - Add **"Import .docx"** button in the Docs sidebar or top header.
   - File picker filtering `.docx` files.
   - Parses the document text using `mammoth` and appends or replaces the note content.
2. **Document Sharing & Collaboration**:
   - Add **"Share"** button in the document header.
   - Share Modal:
     - Copy direct shareable link (`window.location.origin/docs?doc=ID`).
     - Add collaborator email/UID to grant access.
     - Manage `sharedWith` array stored in Firestore.
   - Security: Firestore rules already validate `docData.ownerId == request.auth.uid || request.auth.uid in docData.sharedWith`.

---

## 2. Technical Architecture & Implementation Steps

1. **Install Dependencies**:
   - Install `mammoth` for parsing `.docx` files.
2. **Update Firestore Schema for Documents**:
   - Ensure `sharedWith` (array of strings / emails or UIDs) is included when saving documents.
3. **Upgrade `DocsNotes.tsx`**:
   - Add `.docx` file input handler and `mammoth.extractRawText` parser.
   - Add Share Modal with link copying and collaborator management.
   - Support URL query parameter `?doc=ID` to auto-open shared documents.
4. **Compile & Lint Verification**:
   - Verify build and TypeScript checks pass.
