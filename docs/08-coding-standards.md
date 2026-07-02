# REZNO Coding Standards

## Purpose

This document defines the coding standards for the REZNO platform.

All code must follow these principles to ensure consistency, maintainability, scalability, and long-term reliability.

---

# General Principles

Every line of code should be:

- Readable
- Simple
- Predictable
- Reusable
- Maintainable
- Production Ready

Code is written for humans first, computers second.

---

# Code Quality

Always prefer:

- Clarity over cleverness
- Simplicity over complexity
- Reusability over duplication
- Long-term maintainability over short-term speed

Avoid unnecessary abstractions.

---

# TypeScript

Strict TypeScript is mandatory.

Rules:

- Never use `any`
- Prefer explicit types
- Reuse existing types
- Create interfaces when appropriate
- Avoid unsafe type assertions

Type safety should never be sacrificed.

---

# Naming

Use meaningful names.

Avoid abbreviations unless they are widely understood.

Names should clearly describe their purpose.

Keep naming consistent throughout the project.

---

# Components

Components should:

- Have one responsibility
- Be reusable
- Be easy to understand
- Remain small whenever possible

Avoid large monolithic components.

---

# Functions

Functions should:

- Do one thing well
- Be easy to read
- Avoid side effects whenever possible

Break large functions into smaller ones.

---

# Files

Keep files organized.

Avoid extremely large files.

Related functionality should remain together.

---

# Comments

Write self-explanatory code.

Comments should explain **why**, not **what**.

Avoid unnecessary comments.

---

# Error Handling

Handle expected failures gracefully.

Provide meaningful user-friendly error messages.

Never expose sensitive information.

---

# Validation

Validate all external input.

Never trust client-side validation alone.

Always validate on the server.

---

# Security

Always assume user input is untrusted.

Protect sensitive operations.

Never expose secrets.

Always verify permissions.

---

# Performance

Avoid unnecessary rendering.

Reuse existing logic.

Optimize database queries.

Keep pages lightweight.

Optimize only when needed.

---

# Accessibility

Maintain accessible interfaces.

Use semantic HTML.

Support keyboard navigation.

Provide proper labels.

---

# Internationalization

Never hardcode UI text.

Every string should support:

- Arabic
- Kurdish
- English

RTL and LTR must always work correctly.

---

# Progressive Web App

Keep every implementation compatible with the PWA experience.

Avoid browser-specific solutions that reduce compatibility.

---

# Testing

Before considering work complete:

- TypeScript passes
- ESLint passes
- Production build passes

Completed code should be stable before moving to the next task.

---

# Refactoring

Improve code only when it provides measurable benefits.

Avoid unnecessary rewrites.

Preserve existing functionality.

---

# Final Principle

Always leave the codebase in a better state than you found it.

Small improvements made consistently produce great software over time.