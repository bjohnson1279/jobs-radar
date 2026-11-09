## 2025-05-18 - Repeated Card Control Accessibility
**Learning:** In list views with multiple card components, identical action buttons ("Mark as applied", "View original listing") create ambiguous control announcements for screen reader users navigating by links/buttons.
**Action:** Always provide explicit `aria-label` attributes with item-specific context (e.g., job title and company) on repetitive interactive controls and indicate external window target behavior (`opens in new tab`).

## 2026-10-30 - Descriptive ARIA labels for repetitive actions in list cards
**Learning:** Action buttons and inputs in repeating card structures (such as 'Mark as applied' or 'Update application date') lack context for screen reader users when multiple cards are rendered.
**Action:** Always include contextual item details (job title, company) in `aria-label` attributes for buttons, inputs, and links within repeating list components.

## 2026-11-04 - Action Feedback and Validation Focus in Card Controls
**Learning:** In repeating card actions, simply disabling action buttons during asynchronous updates leaves users uncertain whether their input registered; additionally, relying solely on a distant global status bar for field validation fails to guide keyboard and screen reader users to the erroneous input.
**Action:** Always pair `disabled` state with `aria-busy="true"` and an active progress label (e.g., 'Saving…' / 'Removing…') on the triggered button, and call `element.reportValidity()` and `element.focus()` on invalid inputs before initiating network actions.

## 2026-11-06 - Search Filter Autofill and Keyboard Reset Ergonomics
**Learning:** In real-time client-side filtered dashboards, browser autofill dropdowns on generic search inputs obscure top results and adjacent dropdown controls; furthermore, users expecting standard desktop search interaction often hit Escape to quickly dismiss queries without manually backspacing.
**Action:** Add `autocomplete="off"` to client-side real-time filter inputs and attach an `Escape` key event listener that clears the value and triggers re-render while retaining focus.

## 2026-11-07 - Empty State Call to Action and Filter Reset Announcements
**Learning:** Leaving the primary content container empty prior to the first user search leaves keyboard and screen reader users navigating an empty landmark without a clear primary call to action; additionally, clearing empty filter states silently leaves users unaware of how many items were restored.
**Action:** Populate empty state containers with an informative message and an accessible primary action button matching the main workflow, and update polite live status regions with clear feedback when filters are cleared.

## 2026-11-08 - Region Landmark Exposure and Quick-Search Ergonomics
**Learning:** A generic container with `aria-label` is not announced as a landmark region by screen readers unless given `role="region"`, and card `<article>` elements announced without `aria-labelledby` fail to convey their subject during landmark navigation. Additionally, power users and keyboard navigators expect a standard `/` hotkey to focus the primary filter from anywhere on the page without modifying form contents.
**Action:** Always assign `role="region"` to custom labelled containers and connect `<article>` cards to their heading IDs via `aria-labelledby`. Support `/` keyboard navigation with `aria-keyshortcuts="/"` while ignoring key events originating from active form inputs.

## 2026-11-09 - Accessible Naming on Composite Score Badges
**Learning:** Generic `div` elements with `aria-label` but without an explicit ARIA role have `role="generic"`, leading screen readers and assistive technologies to disregard the accessible name and read raw, fragmented badge text (such as '85 FIT / 100').
**Action:** Assign `role="img"` to styled badge/score containers when providing an `aria-label` so assistive tech recognizes the component as an informative graphic and reliably announces its full composite description.

## 2026-11-10 - Search Filter Clear Ergonomics and State Announcements
**Learning:** Native `type="search"` cancel decorations render inconsistently across browsers and lack screen reader announcements when cleared; relying solely on keyboard shortcuts (`Escape`) leaves pointer and assistive tech users without a clear, accessible trigger to clear search terms.
**Action:** Suppress inconsistent native cancel decorations (`::-webkit-search-cancel-button`), provide an explicit button with `aria-label="Clear search input"`, retain keyboard focus on the input upon clearing, and announce query reset status to live regions.
