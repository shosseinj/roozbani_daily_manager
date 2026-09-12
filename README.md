# Roozbani Daily Manager

A full-stack daily-management application developed as a software-engineering project. The repository includes the application layer, database schema/migrations, modular business logic, environment templates, and supporting documentation.

## Structure

- `app/` — application routes and UI
- `modules/` — feature modules
- `lib/` — shared utilities
- `db/` and `drizzle/` — database integration and migrations
- `docs/` — project documentation

## Engineering Focus

The project demonstrates application architecture, typed database access, environment-specific configuration, modular feature development, and deployment-oriented organization.

## Setup

Use the example environment files as templates, install the Node.js dependencies, configure the database, and follow the project scripts defined in `package.json`.

## Portfolio Context

This repository is included to show broader software-engineering experience alongside my AI and computer-vision research projects.


## Goal

The application brings recurring daily work, persistence, and operational configuration into one modular web project suitable for local use and Cloudflare deployment.

## Installation

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Fill the local variables with development-only values. Production credentials belong in Cloudflare secrets rather than tracked files.

## Working with the Repository

Routes and UI live under `app/`, feature logic under `modules/`, shared code under `lib/`, and schema/migrations under `db/` and `drizzle/`. Use `npm run typecheck`, `npm run lint`, and `npm test` before deployment. Remote migrations and `npm run deploy` affect the configured Cloudflare account, so verify `wrangler.jsonc` and the target D1 database first.
