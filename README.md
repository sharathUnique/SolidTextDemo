# LiquidNote 📄

A LiquidText-style research annotation app built with React + Vite.

## Features

- 📂 **Upload documents** — PDF, TXT, or DOCX
- 🖊 **Inline highlighting** — 6 colour options (Yellow, Green, Blue, Pink, Orange, Purple)
- ✂️ **Extract to workspace** — pull quotes onto the canvas
- ✋ **Drag & drop** — drag selected text directly onto the workspace
- ↩ **Go to source** — click any card to jump back to its paragraph
- 🔗 **Connect cards** — draw visual links between related excerpts
- 📝 **Annotate** — add notes to any card
- 🔍 **Zoom & pan** — navigate the workspace canvas freely

## Getting Started

\`\`\`bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
\`\`\`

## Usage

1. **Upload** a PDF, TXT, or DOCX file using the left panel
2. **Select text** in the document → choose a highlight colour or click "Extract to workspace"
3. **Drag** selected text directly onto the right canvas
4. Click **"Go to source"** on any card to jump back to the original paragraph
5. Use **Connect** mode to draw links between related cards
6. Click **+ note** on any card to add annotations

## Tech Stack

- React 18
- Vite 5
- PDF.js (CDN) for PDF parsing
- Mammoth.js (CDN) for DOCX parsing
- Pure CSS-in-JS styling (no UI library)
