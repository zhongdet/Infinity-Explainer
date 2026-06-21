# Infinity-Explainer

An infinite canvas-based text glossary explorer that reveals nested explanations of technical terms. When clicking on a highlighted term, a new explanation card extends from it with a smooth animated line, and those explanations can contain more clickable terms—creating an infinitely explorable knowledge graph.

## The Problem

When asking AI about domain-specific topics (e.g., audio signal processing, music production, machine learning), responses often contain numerous technical terms without context. Terms like "MFCC", "beat tracking", or "novelty curve" interrupt reading flow and require leaving the conversation to search for definitions.

## The Solution

Infinity-Explainer brings the "dictionary inside the text" paradigm to AI conversations. On an infinite canvas built with react-flow, text blocks display with highlighted clickable terms. Clicking a term creates a new explanation card connected by an animated edge. Those explanations can contain their own highlighted terms—enabling unlimited depth exploration.

## Current Stage: UI MVP

The project has completed its **UI skeleton MVP**:

- Graph/Canvas interface powered by react-flow
- Custom `ExplainerNode` component for text cards with highlighted terms
- Custom `AnimatedEdge` component with CSS animations connecting nodes
- Smart positioning algorithm that finds collision-free positions around source nodes
- Interactive term highlighting with hover states
- Click-to-expand interaction that spawns new explanation nodes

All explanations are currently **hardcoded** for demonstration. The real AI-powered explanation generation is the next phase.

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** for build tooling
- **react-flow** for the graph/canvas engine

## Project Structure

```
src/
├── App.tsx                  # Main app with react-flow setup
├── components/               # UI Components (Nodes, Edges, Popovers)
│   ├── AnimatedEdge.tsx     # Custom edge component
│   ├── ExplainerNode.tsx    # Custom node component for text cards
│   ├── LLMConfigPanel.tsx  # Configuration panel for AI settings
│   └── SelectionPopover.tsx # Tooltip/popover for marking terms
├── core/                    # Core logic (Registry, Tokenizer, Types)
├── services/                # External service integrations (LLM, Persistence)
└── dictionary.ts            # Hardcoded term definitions (placeholder)
```

## Key Implementation Details

### ExplainerNode

Renders text cards with regex-matched highlighted terms. Handles click events to spawn new nodes and edges. Uses collision detection logic for positioning.

### AnimatedEdge

Connects nodes using animated paths creating a "drawing" effect when connections are established. Curves update dynamically when nodes are moved. Hover states highlight connections.

## TODO

- Research and implement NLP technology for automatic term recognition
- Integrate LLM service API (Ollama / OpenRouter) for dynamic explanation generation
- Strip unnecessary react-flow UI elements for a cleaner reading experience

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` to see the infinite canvas with the sample text about audio feature extraction.

## Future Roadmap

1. **NLP Pipeline** — Implement term detection using spaCy, Hugging Face Transformers, or similar
2. **LLM Integration** — Connect to Ollama (local) or OpenRouter (cloud) for generating explanations on-demand
3. **UI Polish** — Customize react-flow UI chrome, add dark mode, improve mobile experience
4. **Persistence** — Save/load exploration state, export knowledge graphs
