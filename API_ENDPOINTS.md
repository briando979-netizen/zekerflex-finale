# ZekerFlex Platform API Documentation

## Overview
Comprehensive REST API for managing a flexible work marketplace connecting workers (freelancers) and employers.

## Authentication
All endpoints require authentication via requirePrincipal(). Some endpoints require specific roles (PLATFORM_ADMIN, HQ_ADMIN, etc.).

---

## Worker APIs

### Profile & Skills
- GET/PATCH /api/dashboard/profiel - Worker profile management
- GET/POST/DELETE /api/dashboard/skills - Skills and certifications
- GET /api/dashboard/earnings-summary - Earnings overview
- GET /api/dashboard/upcoming-shifts - Next 14 days of scheduled work

### Shift Management
- POST /api/shifts/search - Advanced job search with filtering
- GET /api/shifts/recommendations - AI-powered shift recommendations
- GET/POST/DELETE /api/shifts/favorites - Bookmark interesting shifts
- GET/POST/PATCH /api/shifts/reviews - Rate and review shifts

### Availability & Preferences
- GET/POST/DELETE /api/availability - Set recurring availability slots
- GET/POST/PATCH/DELETE /api/relationships - Favorites, blocklist, preferences
- GET/POST/PATCH/DELETE /api/saved-searches - Save job search criteria

### Financial & Administrative
- GET /api/dashboard/facturering - Invoice tracking and payment status
- GET /api/earnings - Detailed earnings with period filtering
- GET /api/compliance - Annual tax report and income statements
- GET /api/referrals - Referral tracking with bonuses

### Communication & Support
- GET/POST/PATCH/DELETE /api/messages - Direct messaging with employers
- GET /api/notifications - Notification center and alerts
- GET/POST/PATCH /api/timesheets - Submit and track work hours
- POST /api/support - Create support tickets

---

## Employer APIs

### Team & Company Management
- GET/POST/PATCH/DELETE /api/werkgever/team - Team member management
- GET/PATCH /api/werkgever/profiel - Company profile and settings
- GET /api/werkgever/analytics - Hiring metrics and cost tracking
- GET /api/employer/performance - Performance dashboard

### Shift Management
- POST /api/shifts/create - Create new shifts
- GET /api/shifts - List company shifts
- PATCH/DELETE /api/shifts/:id - Update/cancel shifts

### Document Management
- GET/POST/PATCH/DELETE /api/documents - Contracts, policies, guides

---

## Horeca (Restaurant) Specific APIs

### Operations
- GET /api/horeca/bestellingen - Order tracking and analytics
- GET /api/horeca/klanten - Customer metrics and retention
- GET /api/horeca/groei - Growth analysis and comparisons
- GET /api/horeca/op-locatie - Table occupancy and live metrics

### Management
- GET/POST/PATCH/DELETE /api/horeca/reservaties - Reservation system
- GET/POST/PATCH/DELETE /api/admin/horeca/menu - Menu item management

---

## Core Infrastructure

### Matching Engine
- lib/matching/score.ts - Multi-factor shift scoring
- Considers: skills, distance, availability, ratings
- Returns match scores 0-100

### Notification System
- lib/notifications/dispatch.ts - Centralized notification dispatch
- Supports 6+ notification types
- Integration with FCM for push notifications

### Invoice Generation
- lib/invoicing/generator.ts - Automatic invoice generation
- From approved timesheets or monthly aggregation
- Payment tracking and reconciliation

---

## Status Codes
- 200 - OK
- 201 - Created
- 204 - No Content
- 400 - Bad Request
- 401 - Unauthorized
- 403 - Forbidden
- 404 - Not Found
- 422 - Validation Error
- 500 - Internal Server Error

## Total Endpoints
50+ endpoints across 18+ API routes
4+ utility libraries
Production Ready
