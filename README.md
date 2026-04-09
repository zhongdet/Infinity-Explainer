# Infinity-Explainer

An infinite canvas-based text glossary explorer that reveals nested explanations of technical terms. When clicking on a highlighted term, a new explanation card extends from it with a smooth animated line, and those explanations can contain more clickable terms—creating an infinitely explorable knowledge graph.

## The Problem

When asking AI about domain-specific topics (e.g., audio signal processing, music production, machine learning), responses often contain numerous technical terms without context. Terms like "MFCC", "beat tracking", or "novelty curve" interrupt reading flow and require leaving the conversation to search for definitions.

## The Solution

Infinity-Explainer brings the "dictionary inside the text" paradigm to AI conversations. On an infinite canvas built with tldraw, text blocks display with highlighted clickable terms. Clicking a term creates a new explanation card connected by an animated bezier curve. Those explanations can contain their own highlighted terms—enabling unlimited depth exploration.

## Current Stage: UI MVP

The project has completed its **UI skeleton MVP**:

- Infinite canvas powered by tldraw
- Custom `ExplainerShape` component for text cards with highlighted terms
- Custom `AnimatedLineShape` component with CSS-animated bezier curves connecting cards
- Smart positioning algorithm (`SectorSearch`) that finds collision-free positions around source cards
- Interactive term highlighting with hover states
- Click-to-expand interaction that spawns new explanation cards

All explanations are currently **hardcoded** for demonstration. The real AI-powered explanation generation is the next phase.

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** for build tooling
- **tldraw v4** for the infinite canvas engine

## Project Structure

```
src/
├── App.tsx                  # Main app with tldraw setup
├── ExplainerShapeUtil.tsx   # Custom tldraw shape for text cards
├── AnimatedLineShapeUtil.tsx # Custom tldraw shape for connecting lines
├── dictionary.ts            # Hardcoded term definitions (placeholder)
└── index.css / App.css      # Styles
```

## Key Implementation Details

### ExplainerShapeUtil

Renders text cards with regex-matched highlighted terms. Handles click events to spawn new cards and lines. Uses `SectorSearch` class for collision-aware positioning.

### AnimatedLineShapeUtil

SVG-based connector with CSS `stroke-dashoffset` animation for the "drawing" effect. Curves update dynamically when cards are moved. Hover states highlight connections.

### SectorSearch

Spiral-based search algorithm that finds valid positions around source cards while avoiding collisions with existing shapes.

## TODO

- Research and implement NLP technology for automatic term recognition
- Integrate LLM service API (Ollama / OpenRouter) for dynamic explanation generation
- Strip unnecessary tldraw UI elements for a cleaner reading experience

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` to see the infinite canvas with the sample text about audio feature extraction.

## Future Roadmap

1. **NLP Pipeline** — Implement term detection using spaCy, Hugging Face Transformers, or similar
2. **LLM Integration** — Connect to Ollama (local) or OpenRouter (cloud) for generating explanations on-demand
3. **UI Polish** — Customize tldraw's UI chrome, add dark mode, improve mobile experience
4. **Persistence** — Save/load exploration state, export knowledge graphs