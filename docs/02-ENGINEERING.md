# REZNO Engineering Principles

## Purpose

This document defines the engineering principles and software development standards that must be followed throughout the REZNO project.

Every implementation should align with these principles to ensure the platform remains scalable, maintainable, secure, and production-ready.

---

# Engineering Mindset

REZNO is not a prototype.

It is a long-term SaaS platform.

Every implementation should be designed to support future growth without major architectural changes.

Think beyond the current feature.

Always consider how today's decisions will affect the platform years from now.

---

# Development Priorities

When making engineering decisions, always prioritize:

1. Scalability
2. Maintainability
3. Security
4. Performance
5. Reliability
6. Developer Experience
7. User Experience

Never sacrifice long-term quality for short-term convenience.

---

# Clean Code

Every piece of code should be:

- Simple
- Readable
- Reusable
- Modular
- Predictable
- Easy to maintain

Avoid unnecessary complexity.

Avoid duplicate logic.

Keep functions and components focused on a single responsibility.

---

# Architecture Principles

The platform should follow:

- Feature-based organization
- Clean Architecture
- Separation of Concerns
- Modular Design
- Reusable Components

Business logic should never be tightly coupled with the UI.

---

# Next.js Best Practices

Always prefer:

- Server Components
- Server Actions
- Route Groups
- Layouts
- Streaming where appropriate
- Suspense where appropriate

Client Components should only be used when required.

---

# TypeScript

Strict TypeScript is mandatory.

Rules:

- Never use `any`.
- Prefer explicit types.
- Create reusable interfaces.
- Keep type definitions organized.
- Maximize compile-time safety.

---

# Component Design

Components should be:

- Small
- Reusable
- Independent
- Easy to test

Avoid creating components that try to solve multiple unrelated problems.

---

# State Management

Prefer the simplest solution possible.

Recommended order:

1. Server Components
2. URL State
3. Local Component State
4. Context (only when necessary)

Avoid unnecessary global state.

---

# Database Access

Database logic should remain organized and easy to maintain.

Avoid duplicated queries.

Always optimize for readability and future maintenance.

---

# Error Handling

Errors should never expose sensitive information.

Provide meaningful error messages for users.

Log technical details where appropriate.

Always handle expected failure cases.

---

# Validation

Validate all user input.

Never trust client-side validation alone.

Server-side validation is required.

---

# Security

Security is mandatory.

Protect all sensitive routes.

Validate permissions.

Never expose secrets.

Never trust client input.

---

# Performance

Optimize for:

- Fast page loads
- Minimal JavaScript
- Efficient database queries
- Responsive UI
- Small bundle sizes

Performance should be considered during development, not after it.

---

# Accessibility

The platform should be usable by everyone.

Follow accessibility best practices whenever possible.

Use semantic HTML.

Ensure keyboard navigation works correctly.

---

# Responsive Design

Every screen should work correctly on:

- Mobile
- Tablet
- Desktop

Mobile experience is a first-class priority.

---

# Internationalization

Every feature must support:

- Arabic
- Kurdish
- English

Never hardcode user-facing strings.

Support both RTL and LTR layouts.

---

# Progressive Web App

Every new feature should remain compatible with the PWA experience.

Do not implement features that negatively affect installability or mobile usability.

---

# Quality Standards

Before considering any feature complete:

- The code should compile successfully.
- TypeScript should pass without errors.
- ESLint should pass.
- The production build should succeed.

Code quality is never optional.

---

# AI Development Note

When implementation details are not explicitly documented:

- Make the best production-grade engineering decision.
- Stay consistent with the existing architecture.
- Avoid unnecessary complexity.
- Prefer long-term maintainability.
- Explain major architectural decisions before implementing them.