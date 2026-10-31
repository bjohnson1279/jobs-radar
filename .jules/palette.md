## 2025-05-18 - Repeated Card Control Accessibility
**Learning:** In list views with multiple card components, identical action buttons ("Mark as applied", "View original listing") create ambiguous control announcements for screen reader users navigating by links/buttons.
**Action:** Always provide explicit `aria-label` attributes with item-specific context (e.g., job title and company) on repetitive interactive controls and indicate external window target behavior (`opens in new tab`).

## 2026-10-30 - Descriptive ARIA labels for repetitive actions in list cards
**Learning:** Action buttons and inputs in repeating card structures (such as 'Mark as applied' or 'Update application date') lack context for screen reader users when multiple cards are rendered.
**Action:** Always include contextual item details (job title, company) in `aria-label` attributes for buttons, inputs, and links within repeating list components.
