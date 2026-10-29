## 2025-05-18 - Repeated Card Control Accessibility
**Learning:** In list views with multiple card components, identical action buttons ("Mark as applied", "View original listing") create ambiguous control announcements for screen reader users navigating by links/buttons.
**Action:** Always provide explicit `aria-label` attributes with item-specific context (e.g., job title and company) on repetitive interactive controls and indicate external window target behavior (`opens in new tab`).
