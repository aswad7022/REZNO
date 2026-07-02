# REZNO UI/UX Design Guidelines

## Purpose

This document defines the design philosophy and user experience principles for the REZNO platform.

The goal is to create a modern, intuitive, and consistent experience across all screens and devices.

---

# Design Philosophy

The interface should feel:

- Modern
- Clean
- Professional
- Fast
- Friendly
- Minimal
- Consistent

Every screen should focus on helping users complete their tasks with the fewest possible steps.

Avoid unnecessary visual complexity.

---

# User Experience

Users should never feel confused.

Navigation should always be clear.

Important actions should always be easy to find.

Every workflow should reduce friction.

The interface should guide users naturally without requiring explanations.

---

# Design Inspiration

The design language should take inspiration from modern SaaS platforms such as:

- Fresha
- Stripe
- Notion
- Linear
- Vercel
- Airbnb

The goal is inspiration, not imitation.

---

# Design System

Use the existing project design system.

Prefer:

- shadcn/ui
- Tailwind CSS
- Lucide Icons

Avoid introducing unnecessary UI libraries.

---

# Responsive Design

The platform must work perfectly on:

- Mobile
- Tablet
- Desktop

Mobile users are considered first-class users.

---

# Progressive Web App

The interface should feel like a native application.

Transitions should be smooth.

Touch interactions should feel natural.

The platform should work beautifully when installed from the browser.

---

# Layout Consistency

Navigation should remain consistent throughout the platform.

Shared layouts should be reused whenever possible.

Avoid redesigning similar screens differently.

Consistency improves usability.

---

# Forms

Forms should be:

- Simple
- Clear
- Easy to complete

Validation messages should be helpful.

Required fields should be obvious.

---

# Tables

Tables should support:

- Sorting
- Filtering
- Searching
- Pagination where necessary

Large datasets should remain easy to navigate.

---

# Search

Search should be available wherever it improves usability.

Results should be fast and relevant.

---

# Empty States

Every module should provide meaningful empty states.

Guide users toward the next action instead of displaying blank pages.

---

# Loading States

Every asynchronous operation should include appropriate loading indicators.

Avoid sudden layout shifts.

---

# Error States

Errors should be understandable.

Never expose technical details to end users.

Always suggest a possible next step.

---

# Accessibility

Accessibility should always be considered.

Support:

- Keyboard navigation
- Screen readers where possible
- Sufficient color contrast
- Clear focus states

---

# Internationalization

Every interface must fully support:

- Arabic
- Kurdish
- English

Layouts must work correctly in both RTL and LTR modes.

---

# Dark Mode

Dark mode should be supported across the entire platform.

The experience should remain visually consistent.

---

# Animations

Animations should be subtle.

Use motion only when it improves usability.

Avoid excessive animations.

---

# General Principle

Every screen should answer one question:

"Can the user complete their task quickly and confidently?"

If the answer is no, the design should be improved.

---

# AI Development Note

When creating or modifying UI:

- Reuse existing components.
- Maintain visual consistency.
- Keep interfaces clean.
- Prioritize usability over decoration.
- Design for long-term scalability.