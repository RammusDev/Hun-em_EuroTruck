# Hun-em — European Road Diary & Automated Travel Journal

[繁體中文](README.md) | **English**

An ongoing travel simulation following Hun-em, an entirely black cat wearing his signature yellow scarf, as he delivers cargo and explores Europe. Completed activities become multilingual diary entries, illustrations, and travel collections.

This personal project was developed with AI assistance. It combines an event-driven simulation, persistent cloud storage, and AI content workflows to keep the journey moving even when nobody visits the website, while keeping travel events, expenses, stories, and publication timing consistent.

[Live website](https://hun-em-europe.rammus-shigoto.chatgpt.site/journey) · [Portfolio notes](docs/PORTFOLIO.md) · [Architecture and engineering cases](docs/ENGINEERING.md) · [Development guide](docs/DEVELOPMENT.md)

> The live website requires Google identity verification and owner approval. This repository contains the website source, but excludes production world data, cloud images, and some shared modules and tools from the full workspace. A standalone clone is not a complete, ready-to-run development environment. The linked supporting documents are currently in Traditional Chinese.

## Features

- **A continuing European journey:** deliveries, ferries, refueling, meal breaks, accommodation, and sightseeing follow shared daily routines. The destination catalog covers **591 cities across 19 countries**; these are available destinations, not completed visits.
- **Interactive journey map:** Google Maps displays the character's simulated position, routes, and completed landmark visits, with a Leaflet/OpenStreetMap fallback.
- **Four-language journals:** Traditional Chinese, English, German, and Japanese entries draw on the same archived daily events and include language-learning material.
- **Illustrated travel collections:** landmarks, regional meals, and soft drinks appear in albums and collection journals. Images are prepared privately after selection and become public only after the corresponding activity is completed.
- **Identity and reader approval:** the website verifies Google identity and checks viewing permission. Approved readers enter the journey; new readers are directed to an application page. Submitting an application triggers a Gmail API notification to the owner for manual review.
- **Owner administration:** access approval, rejection and revocation, protected settings, snapshot restoration, task status, diagnostic exports with sensitive fields masked, and email alerts for operational issues.

## Tech stack

**JavaScript, TypeScript, React, Cloudflare Workers, Durable Objects, Cloudflare D1, Cloudflare R2, Google Maps JavaScript API, Google Identity Services, Gmail API, OAuth 2.0, Model Context Protocol (MCP).**

| Area | Implementation |
| --- | --- |
| Application | React, Next.js App Router structure, vinext/Vite, and vanilla JavaScript/CSS for the journey and collection interfaces |
| Backend and scheduling | Cloudflare Workers and Durable Objects with persistent alarms |
| Persistence | D1 for structured state and access records; R2 for image assets and stored snapshots |
| Maps | Google Maps JavaScript API; Leaflet/OpenStreetMap fallback |
| Identity and notifications | Google Identity Services for identity verification; OAuth 2.0-authorized Gmail API for owner notifications |
| AI workflows | MCP tools and event subscriptions, image generation, multilingual writing packages, and content validation |
| Verification | Node.js tests, Miniflare D1/R2 integration checks, TypeScript checks, and application builds |
| Hosting | Cloudflare-backed deployment managed through Sites |

## Engineering decisions

| Challenge | Approach |
| --- | --- |
| Continue the world without an open browser | Persist the next events and use Durable Object alarms, with health checks for missing or overdue work |
| Avoid duplicate expenses, visits, and publication on retries | Stable event IDs, version checks, D1 leases, and persisted commit receipts |
| Keep planned activities separate from completed facts | Separate future plans, due-event settlement, and reader-facing projections; state GET requests remain read-only |
| Handle unpredictable AI completion times | Separate notification, validated asset storage, and activity-gated publication |
| Control access independently of Google identity | Maintain application and approval states in D1 and enforce permissions on the server |
| Keep mobile updates stable | Preserve existing page elements and images during position updates, pause reads in hidden tabs, and use smaller preview images |

The daily journal workflow archives the day's facts at 23:00 Europe/Berlin and schedules AI writing and illustration work at 23:05. Content validation and publication rules handle incomplete output; generation and delivery failures can still require manual recovery.

## Validation and limitations

Before release 139 on November 8, 2026, **202 website tests, 191 shared-module tests, and 3 tooling tests** passed, along with TypeScript checks and the website build. These are historical release results, not a claim that GitHub CI is configured. Shared-module and tooling tests are not all included in this repository.

One mobile image-preview comparison reduced an image from approximately 90 KB to 36 KB, about 60%. This describes that image sample, not an overall website speed improvement. Production observations also confirmed event progression after a fix for stalled background work.

AI writing and illustration can fail because of reference availability, task startup, generation, or asset handoff issues. Long-running unattended operation, cross-day/daylight-saving behavior, and complete disaster recovery remain areas for continued validation. No uptime or failure-free operation guarantee is claimed.

## Development and repository scope

The project uses AI tools to assist with code, writing, and illustrations. The portfolio documents product decisions, workflow design, diagnosis, verification, and release management as part of that development process.

This repository corresponds to `footprints-checkout/` in the full workspace. Some shared source modules, catalogs, operational instructions, and fixed check runners live outside this checkout. Production D1/R2 data and images are managed separately. Installing dependencies alone does not reproduce the live system.

Read the [development guide](docs/DEVELOPMENT.md) before maintenance work. The portfolio documentation does not replace production operating instructions.
