# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial monorepo structure with Turborepo + pnpm workspace
- Studio: AI workflow builder (web, desktop, and backend)
- Community: knowledge sharing and discussion platform
- Site: product-facing landing page and content site
- Admin: unified dashboard with backend services
- Crawler: data collection and ingestion pipeline
- Stats Service: usage analytics and metrics aggregation
- Docker Compose development environment
- Studio: external service health-check probing with auto-fallback (stats + community)
- Community: production deployment on Vercel
- Community: comment and reaction support

### Fixed
- Community: undefined token reference in home page
- Community: NEXT_PUBLIC_BRIDGE_API_URL DNS resolution in Docker environment
- Community: TypeScript implicit any type in topic list filter
- Community: section tabs flicker when navigating back from topic detail
- Site: stats URL type error in analytics provider
- Studio: CORS false-negative in external service health probes
- Docker: community-frontend bridge API URL now uses localhost for browser access

### Changed
- Documentation: replaced "Butler" with individual Crawler and Stats services
- README: updated Quick Start with community-backend migration and frontend env setup
- Frontend env configuration standardized across all packages
- Studio: stats and community URLs configurable via env vars (VITE_PROD_*)

[Unreleased]: https://github.com/laishiwen/sven-family
