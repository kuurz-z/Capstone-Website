# Billing Workspace Redesign

Date: 2026-04-03
Status: Approved for planning
Scope: Admin billing UI and UX redesign for the billing workspace, with emphasis on tables and workflow clarity

## Goal

Redesign the admin billing experience into a minimalist, professional, modern workspace that is easier to scan, easier to operate, and less visually dense than the current implementation.

The redesign must improve:
- Room and invoice workflow clarity
- Table readability and scan speed
- Action discoverability
- Status visibility
- Mobile responsiveness

The redesign must preserve existing billing behavior and API flows unless a visual or interaction adjustment is required to support the new workspace.

## In Scope

- [web/src/features/admin/components/billing/UtilityBillingTab.jsx](D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web\src\features\admin\components\billing\UtilityBillingTab.jsx)
- [web/src/features/admin/components/billing/UtilityBillingTab.css](D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web\src\features\admin\components\billing\UtilityBillingTab.css)
- [web/src/features/admin/components/billing/InvoicePublishTab.jsx](D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web\src\features\admin\components\billing\InvoicePublishTab.jsx)
- [web/src/features/admin/components/billing/InvoicePublishTab.css](D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web\src\features\admin\components\billing\InvoicePublishTab.css)
- Shared billing presentation components if needed
- Supporting admin billing page layout and styles if needed

## Out Of Scope

- Billing computation changes
- Backend schema changes
- Invoice generation logic changes
- Payment logic changes
- New billing rules or business settings

## Design Direction

The billing area becomes a full workspace rather than a collection of stacked panels and raw tables.

Core design principles:
- Minimalist: fewer lines, less chrome, more spacing
- Professional: calm palette, consistent hierarchy, strong typography
- Modern: intentional layout, sticky context, polished interaction states
- User-friendly: clear next actions, lower cognitive load, better empty/loading states

The redesign should avoid generic dashboard clutter. It should feel like an operations console for billing work.

## Primary UX Model

### 1. Persistent Left Rail

The left side acts as a work queue.

It contains:
- Search
- Branch filter when applicable
- Room or invoice groups
- Clear queue states such as `Needs setup`, `Open cycle`, `Ready to send`, `Blocked`, and `Sent`

The left rail remains stable while the detail workspace updates on selection.

### 2. Sticky Top Summary Bar

The main workspace starts with a sticky context strip containing:
- Current utility or billing mode
- Active branch
- Current cycle or billing window
- Summary counts such as ready, blocked, active, and sent
- Primary action for the current context

This bar keeps orientation and key actions visible even during long table scrolls.

### 3. Right-Side Detail Canvas

The main panel becomes a modular workspace with cards or sections instead of uninterrupted table blocks.

Expected sections:
- Overview
- Cycle Details
- Readings
- Tenant Split
- Publish Readiness
- History

Not every mode needs every section, but the overall structure must stay predictable.

## Table Strategy

Tables remain important, but they must become curated data surfaces instead of raw dumps.

### Table Requirements

- Sticky headers where scrolling is expected
- Stronger row spacing and cleaner alignment
- Softer borders and reduced grid noise
- Tabular number alignment for usage, rates, and totals
- Clear column hierarchy with subdued secondary metadata
- Hover and selected states that are visible but restrained
- One clear primary action per row, with secondary actions grouped

### Content Restructuring

Important cells should be structured:
- Room cell: room name first, metadata below
- Status cell: compact modern badge
- Amount cell: bold value, muted supporting context
- Action cell: one primary action plus ghost or menu-based secondary actions

Dense detail should move out of the main row into:
- Expandable detail panels
- Side detail cards
- Secondary metadata lines

### Mobile Behavior

On smaller screens:
- Large tables collapse into stacked records
- Each record becomes a label-value card
- Critical status and actions stay visible without horizontal scrolling where possible

## Utility Billing Tab Redesign

### Layout

`UtilityBillingTab` should become a two-layer workspace:
- Left rail for room queue and billing status
- Right detail canvas for the selected room

### Functional Sections

The selected room view should contain:
- Room header with branch, room type, cycle state, and primary actions
- Overview card with latest reading, open period state, and quick metrics
- Readings section with a refined operational table
- Billing periods section with selectable history
- Tenant split section with cleaner financial presentation
- Segment details section that is visually secondary and easier to parse

### Interaction Changes

- Primary actions like open, close, export, and revise must stay prominent
- Destructive actions like delete should move into quieter secondary controls
- Selected billing cycle should remain obvious while viewing details
- Empty states should guide the next action instead of only describing absence

## Invoice Publish Tab Redesign

### Layout

`InvoicePublishTab` should feel like a shipping queue rather than a plain grouped list.

### Functional Sections

- Sticky top summary for ready rooms, blocked rooms, and sent rooms
- Grouped work queues
- Expandable room readiness details
- Cleaner publish actions with better confirmation framing

### Visual Behavior

- Ready items should feel actionable and calm
- Blocked items should show the reason clearly without dominating the layout
- Sent items should be visually complete but still reviewable

## Visual System

### Tone

Use a restrained, premium admin palette:
- Soft stone, ivory, or muted neutral surfaces
- Dark slate text
- Controlled accent for active or selected states
- Minimal saturation in status colors

### Components

Use:
- Rounded cards
- Soft shadows
- Thin dividers
- Quiet badges
- Clean input and filter controls

Avoid:
- Heavy gradients
- Loud badge colors everywhere
- Thick borders
- Over-decorated controls

## Motion

Motion should be subtle and purposeful:
- Room selection transitions
- Expand and collapse transitions
- Sticky header elevation on scroll
- Hover emphasis on actionable rows

No decorative motion should distract from data work.

## Accessibility

The redesign must support:
- Clear selected states
- High text contrast
- Large enough action targets
- Keyboard focus visibility
- Understandable status labeling
- Mobile readability

## Error, Loading, And Empty States

These states must be intentionally designed.

Requirements:
- Loading states should use skeletons or structured placeholders
- Empty states should explain what action to take next
- Blocked states should explain why work cannot proceed
- Error states should preserve context and offer retry or fallback actions

## Technical Constraints

- Preserve existing React and project patterns
- Prefer styling through existing billing CSS files unless a shared extraction is clearly justified
- Follow current admin billing routing structure
- Avoid introducing new heavy UI dependencies unless absolutely necessary

## Testing Expectations

Implementation should include:
- Visual verification of the main billing flows on desktop and mobile widths
- Regression checks for room selection, billing cycle selection, publish actions, and table interactions
- Build verification for touched frontend surfaces if the environment allows it

## Success Criteria

The redesign is successful when:
- Admins can identify status and next actions faster
- Tables are cleaner and easier to scan
- The billing area feels like one cohesive workspace
- The publish queue is easier to understand
- The UI looks modern and production-grade without feeling noisy

## Implementation Notes

Implementation should prioritize:
1. Workspace structure and hierarchy
2. Table redesign and data presentation
3. Action clarity and status presentation
4. Responsive adaptation
5. Final visual polish
