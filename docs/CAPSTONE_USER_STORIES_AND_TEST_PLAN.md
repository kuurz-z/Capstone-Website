# Lilycrest Dormitory Management System (Lilycrest DMS)
## Comprehensive Agile User Stories, System Requirements & Operational Test Plan
**Academic Level:** 3rd Year Capstone Project  
**Target Environment:** Multi-Branch Housing Platform (Gil Puyat & Guadalupe Branches)  
**Document Version:** 1.0 — Final Architecture & QA Release  
**Status:** Approved / Production-Ready  

---

## Executive Summary

The **Lilycrest Dormitory Management System (Lilycrest DMS)** is an enterprise-grade web application engineered to streamline the entire student and professional housing lifecycle across multiple branches (Gil Puyat and Guadalupe locations). The platform addresses the operational complexities of room discovery, bed-level reservations, digital lease agreement execution, pro-rata utility calculation (electricity and water sub-meter billing), payment processing via PayMongo, maintenance workflow management, in-app support communications, and tenant offboarding.

This document serves as the canonical software engineering reference combining:
1. **System Roles & Access Control Hierarchy**
2. **Agile User Stories Catalog (with Acceptance Criteria & Story Points)**
3. **Master Quality Assurance Test Plan (14-Phase Operational Test Scenarios)**
4. **Requirements Traceability Matrix (RTM)**
5. **Quality Assurance Execution & Defense Sign-Off Protocol**

---

## 1. System Roles & Access Control Hierarchy

The system defines five distinct actor roles with granular role-based access control (RBAC):

| Role | Scope | Authorization & Core Responsibilities |
| :--- | :--- | :--- |
| **Guest** | Public Pages | Unauthenticated public users. Browse available rooms, view branch amenities, inspect pricing, check bed-level occupancy maps, and submit inquiries. |
| **Applicant** | Self-Service Portal | Prospective tenants. Register accounts, execute the 5-step room reservation flow, upload verification documents (Government ID, NBI clearance), submit reservation fees, and track application status. |
| **Tenant** | Tenant Portal | Verified occupants with active contracts. Review and sign lease agreements, view itemized monthly rent and utility bills, pay via PayMongo or upload payment receipts, file maintenance requests, and chat with management. |
| **Admin** | Assigned Branch | Branch management personnel. Review and approve reservations, execute physical check-ins, record water and electricity sub-meter readings, generate monthly utility and rent billings, manage maintenance tickets, and publish branch announcements. |
| **Owner** | All Branches | Executive system authority across all branches. Supervise branch admins, perform role elevation/demotion, override decisions, review cross-branch financial statements, inspect system audit logs, and configure global system settings. |

---

## 2. Agile User Stories Catalog

The following catalog establishes the product backlog organized into 11 functional epics. Each user story includes formal narrative framing (`As a... I want to... So that...`), concrete acceptance criteria, implementation priority, agile story points, and mapped test case identifiers.

### Epic 1: Public Discovery & Inquiries
*Focus: Public visibility, branch exploration, and prospective tenant lead capture.*

#### User Story US-01: Public Room & Bed Availability Browsing
* **Narrative:** As a **Guest**, I want to browse available rooms filtered by branch, room type, and pricing, so that I can find accommodations that fit my preferences and budget.
* **Acceptance Criteria:**
  * Given a guest visits `/check-availability`, when they filter by branch (Gil Puyat or Guadalupe) and room type (Solo, 2-Bed, 4-Bed Quadruple), the system displays matching active rooms.
  * Occupancy cards must indicate real-time bed availability (`Available`, `Reserved`, `Occupied`).
  * Inactive or undergoing-maintenance rooms must be excluded from public results.
* **Priority:** High | **Story Points:** 5 | **Traceability:** `TC-01`

#### User Story US-02: Pre-Booking Guest Inquiry Submission
* **Narrative:** As a **Guest**, I want to submit an online inquiry regarding room amenities and house rules, so that dormitory staff can clarify my concerns prior to reservation.
* **Acceptance Criteria:**
  * Given a guest opens the inquiry form, when they submit their full name, email, contact number, and inquiry message, the system creates an inquiry record.
  * An automated confirmation email must be dispatched to the guest's email address.
  * The inquiry must immediately appear on the branch Admin Inquiry Dashboard.
* **Priority:** Medium | **Story Points:** 3 | **Traceability:** `TC-02`

---

### Epic 2: Room Reservation & Bed Selection Workflow
*Focus: Self-service booking, appliance fee declarations, and deposit payment.*

#### User Story US-03: Bed Selection & Appliance Declaration
* **Narrative:** As an **Applicant**, I want to choose a specific bed (upper/lower bunk) and declare personal appliances, so that my monthly rate and initial costs are calculated accurately.
* **Acceptance Criteria:**
  * Given an applicant selects a room, when they choose a specific bed slot, the system verifies the bed is not currently locked or reserved.
  * Selecting optional appliances (refrigerator, fan, rice cooker, laptop) updates the monthly billing preview in real time using standardized rates.
  * Applicants are restricted to one active pending reservation at a time.
* **Priority:** High | **Story Points:** 8 | **Traceability:** `TC-03`

#### User Story US-04: 5-Step Guided Reservation Submission
* **Narrative:** As an **Applicant**, I want to complete a guided 5-step reservation application, so that I can submit my personal information, schedule a visit, and reserve my slot.
* **Acceptance Criteria:**
  * Given an applicant enters the reservation wizard:
    * Step 1: Reviews room summary, branch, and preferred move-in date.
    * Step 2: Confirms visit schedule and acknowledges house policies.
    * Step 3: Enters personal details, emergency contact, and uploads required identification documents.
    * Step 4: Submits reservation fee proof or initiates PayMongo checkout.
    * Step 5: Receives a unique Reservation Code and downloadable summary receipt.
* **Priority:** High | **Story Points:** 13 | **Traceability:** `TC-04`

#### User Story US-05: Concurrency Protection on Simultaneous Bed Booking
* **Narrative:** As a **System Administrator**, I want the reservation engine to enforce atomic locks on bed slots, so that two applicants cannot simultaneously reserve the same bed.
* **Acceptance Criteria:**
  * Given two concurrent reservation requests targeting the identical Bed ID, the first transaction must succeed and transition the bed to `reserved`.
  * The second transaction must immediately abort with an HTTP 409 Conflict error and prompt the user to choose an alternative available bed.
* **Priority:** High | **Story Points:** 8 | **Traceability:** `TC-05`

---

### Epic 3: Administrative Verification & Application Review
*Focus: Identity verification, slot approval, and application rejection management.*

#### User Story US-06: Admin Review & Reservation Approval
* **Narrative:** As an **Admin**, I want to review submitted applicant credentials and payment proofs, so that I can approve qualified occupants and initiate their lease agreements.
* **Acceptance Criteria:**
  * Given a pending reservation, when the admin verifies uploaded IDs and payment verification, clicking **Approve** transitions status to `approved`.
  * The system automatically generates a pending digital lease contract record linked to the applicant.
  * An automated notification email is sent to the applicant with contract review instructions.
* **Priority:** High | **Story Points:** 5 | **Traceability:** `TC-06`

#### User Story US-07: Reservation Rejection & Slot Release
* **Narrative:** As an **Admin**, I want to reject invalid or fraudulent applications with a stated reason, so that reserved beds are immediately returned to the public pool.
* **Acceptance Criteria:**
  * Given an unverified application, when the admin submits a rejection with a required reason, status changes to `rejected`.
  * The reserved bed status reverts atomically from `reserved` to `available`.
  * The applicant receives an email explaining the rejection rationale and next steps.
* **Priority:** Medium | **Story Points:** 3 | **Traceability:** `TC-07`

---

### Epic 4: Digital Lease Contracts & E-Signatures
*Focus: Legally compliant digital agreements, signature capture, and document security.*

#### User Story US-08: Tenant Contract Review & Digital Signature
* **Narrative:** As a **Tenant**, I want to review my digital lease agreement and provide an electronic signature, so that my contract is executed without requiring paper printing.
* **Acceptance Criteria:**
  * Given an approved applicant accesses `/contracts`, the system displays the complete contract including room rate, deposit terms, house rules, and move-in date.
  * The tenant can draw or submit their digital signature via the interactive signature canvas.
  * On submission, the backend records signature metadata (IP address, timestamp, signature hash) and generates a canonical, tamper-evident PDF document.
* **Priority:** High | **Story Points:** 8 | **Traceability:** `TC-08`

#### User Story US-09: Admin Document Verification & Final Counter-Sign
* **Narrative:** As an **Admin**, I want to verify the tenant's signed contract and finalize document preparation, so that residency activation can proceed.
* **Acceptance Criteria:**
  * Given a tenant-signed contract, the admin verifies document completeness and clicks **Finalize Contract**.
  * The contract status transitions to `active`, and a downloadable official PDF is archived.
* **Priority:** High | **Story Points:** 5 | **Traceability:** `TC-09`

---

### Epic 5: Tenant Check-In & Residency Activation
*Focus: Move-in verification, key issuance, and ledger initialization.*

#### User Story US-10: Physical Check-In & Ledger Initialization
* **Narrative:** As an **Admin**, I want to record the tenant's actual move-in and physical check-in, so that the tenant's account is activated and recurring billing begins.
* **Acceptance Criteria:**
  * Given an active signed contract, the admin clicks **Execute Check-In** and logs the move-in timestamp.
  * The user's role status transitions from `applicant`/`reserved` to `checked-in` `tenant`.
  * The room bed state atomically transitions to `occupied`.
  * The system initializes the tenant's financial ledger and schedules their monthly rent cycle.
* **Priority:** High | **Story Points:** 8 | **Traceability:** `TC-10`

---

### Epic 6: Room, Bed & Real-Time Atomic Occupancy Management
*Focus: Capacity limits, room amenities, and real-time occupancy counts.*

#### User Story US-11: Room Grid & Bed Inventory Control
* **Narrative:** As an **Admin**, I want a visual room grid showing real-time occupancy status per room and bed, so that I can manage branch room inventory without physical inspection.
* **Acceptance Criteria:**
  * The admin dashboard displays all rooms categorized as `Available`, `Partially Occupied`, or `Full`.
  * Admins can configure room amenities, rates, and bed types.
  * A safety guard prevents deletion of any room currently containing occupied beds.
* **Priority:** Medium | **Story Points:** 5 | **Traceability:** `TC-11`

---

### Epic 7: Monthly Rent, Pro-Rata Utility Billing & PayMongo Checkout
*Focus: Automated invoices, sub-meter calculations, pro-rata distribution, and payments.*

#### User Story US-12: Sub-Meter Utility Reading & Pro-Rata Split Engine
* **Narrative:** As an **Admin**, I want to input monthly electricity and water sub-meter readings for each room, so that utility costs are automatically calculated and split pro-rata among checked-in roommates.
* **Acceptance Criteria:**
  * Admin enters previous and present meter readings (kWh for electricity, cubic meters for water).
  * System calculates total room consumption and applies configured branch utility tariffs.
  * The total room cost is split pro-rata among occupants based on each tenant's active days during the billing cycle.
  * Billing records are generated only for tenants with `checked-in` residency status.
* **Priority:** Critical | **Story Points:** 13 | **Traceability:** `TC-12`

#### User Story US-13: Itemized Tenant Billing Statement & History
* **Narrative:** As a **Tenant**, I want to view an itemized breakdown of my monthly statement (rent, electricity, water, appliance fees, penalties), so that I understand exactly what I am paying for.
* **Acceptance Criteria:**
  * Given a tenant visits `/billing`, they see current balance, due date, and detailed breakdown.
  * Tenants can download an official PDF Billing Statement containing branch details and payment instructions.
* **Priority:** High | **Story Points:** 5 | **Traceability:** `TC-13`

#### User Story US-14: Online Payment via PayMongo & Automatic Reconciliation
* **Narrative:** As a **Tenant**, I want to settle my monthly rent and utilities securely through PayMongo (GCash, Maya, Cards), so that my balance is updated immediately without manual admin receipt review.
* **Acceptance Criteria:**
  * Clicking **Pay with PayMongo** creates an authorized checkout session matching the exact database bill balance.
  * Upon verified payment provider settlement, the PayMongo webhook updates the bill status to `Paid`.
  * An automated payment receipt is generated and tenant balance updates in real time.
* **Priority:** High | **Story Points:** 8 | **Traceability:** `TC-14`

---

### Epic 8: Maintenance & Support Ticket Lifecycle
*Focus: Fast issue reporting, photo evidence, staff assignment, and SLA tracking.*

#### User Story US-15: Tenant Maintenance Request Submission
* **Narrative:** As a **Tenant**, I want to submit maintenance requests with photos, category selection, and urgency levels, so that facility repairs are addressed promptly.
* **Acceptance Criteria:**
  * Tenant selects issue category (Plumbing, Electrical, Hardware, Appliance, Cleaning) and urgency level (Low, Medium, High).
  * Tenant can upload photo attachments showing the damage or repair issue.
  * System displays target turnaround time and generates a trackable ticket number.
* **Priority:** High | **Story Points:** 5 | **Traceability:** `TC-15`

#### User Story US-16: Admin Ticket Resolution & Staff Assignment
* **Narrative:** As an **Admin**, I want to assign maintenance tickets to staff members and update resolution statuses, so that tenants are kept informed of repair progress.
* **Acceptance Criteria:**
  * Admin dashboard highlights urgent open tickets and tracks turnaround times.
  * Status progresses cleanly: `Pending` ➔ `In-Progress` ➔ `Completed` (or `Cancelled`).
  * Tenant receives notification upon ticket completion with admin resolution notes.
* **Priority:** Medium | **Story Points:** 5 | **Traceability:** `TC-16`

---

### Epic 9: Announcements & Direct Communications
*Focus: Important alerts, policy notifications, and tenant support chat.*

#### User Story US-17: Branch Announcement Engine with Mandatory Acknowledgment
* **Narrative:** As an **Admin**, I want to publish categorized announcements with target audience filters, so that critical dormitory notices reach occupants reliably.
* **Acceptance Criteria:**
  * Announcements support categories (Maintenance, Policy, Event, Alert, General).
  * High-priority safety alerts require tenants to click **Acknowledge** before dismissal.
  * Admins can view an acknowledgment audit list showing who has read the announcement.
* **Priority:** Medium | **Story Points:** 5 | **Traceability:** `TC-17`

#### User Story US-18: Real-Time In-App Support Chat
* **Narrative:** As a **Tenant**, I want to chat directly with branch administration via an in-app messaging system, so that I can resolve urgent inquiries quickly.
* **Acceptance Criteria:**
  * Dedicated chat channel between authenticated tenant and branch management.
  * Real-time socket message delivery with read receipts and message timestamps.
  * Admin interface allows switching between tenant chat conversations cleanly.
* **Priority:** Medium | **Story Points:** 8 | **Traceability:** `TC-18`

---

### Epic 10: Room Transfers, Contract Renewals & Move-Out Offboarding
*Focus: Seamless room transitions, deposit preservation, checkout clearance, and refunds.*

#### User Story US-19: Scheduled Room Transfer with Deposit Preservation
* **Narrative:** As a **Tenant**, I want to request a room transfer to an available bed in another room or branch, so that my security deposit is preserved without requiring a full lease termination.
* **Acceptance Criteria:**
  * Tenant initiates transfer wizard selecting target room and preferred transfer date.
  * Admin reviews and approves the scheduled transfer.
  * On transfer execution:
    * System updates room bed occupancy atomically.
    * Existing security deposit is carried forward to the new contract.
    * Utility bills are calculated pro-rata for the old room up to the transfer date.
* **Priority:** High | **Story Points:** 8 | **Traceability:** `TC-19`

#### User Story US-20: Move-Out Clearance & Security Deposit Settlement
* **Narrative:** As an **Admin**, I want to conduct move-out clearance and calculate deductions, so that remaining security deposits are refunded transparently.
* **Acceptance Criteria:**
  * Admin records room condition and inputs authorized deductions (unpaid utilities, property damage).
  * System calculates Net Deposit Refund = `Security Deposit - Total Deductions`.
  * Once settled, contract transitions to `terminated`, bed transitions to `available`, and tenant account is archived.
* **Priority:** High | **Story Points:** 8 | **Traceability:** `TC-20`

---

### Epic 11: Multi-Branch Governance, Analytics & Executive Audit Trail
*Focus: Cross-branch financial visibility, auditability, and role security.*

#### User Story US-21: Multi-Branch Financial & Occupancy Analytics
* **Narrative:** As an **Owner**, I want to view consolidated cross-branch revenue, occupancy rates, and overdue collections, so that I can make data-driven operational decisions.
* **Acceptance Criteria:**
  * Owner dashboard provides side-by-side branch comparisons (Gil Puyat vs Guadalupe).
  * Analytics date filter supports standard intervals (`7d`, `30d`, `90d`, `365d`) and an All-Time (`all`) parameter.
  * Export options support CSV download for financial auditing.
* **Priority:** High | **Story Points:** 5 | **Traceability:** `TC-21`

#### User Story US-22: Immutable Executive Audit Trail
* **Narrative:** As an **Owner**, I want an immutable log of all critical system transactions and user actions, so that unauthorized data mutations or security breaches can be audited.
* **Acceptance Criteria:**
  * System records actor ID, IP address, timestamp, resource touched, and mutation delta for all major operations.
  * Audit records cannot be edited or deleted via the application UI.
  * Failed login attempts and permission violations trigger high-severity audit entries.
* **Priority:** High | **Story Points:** 5 | **Traceability:** `TC-22`

---

## 3. Master Quality Assurance Test Plan

### 3.1 Test Strategy & Objectives
The testing strategy validates that Lilycrest DMS fulfills functional requirements, maintains rigorous data consistency, guarantees concurrency safety during bed reservations, and prevents financial discrepancies in utility splits and payment reconciliation.

* **Test Levels:** Unit Testing, Integration Testing, API Contract Testing, End-to-End Operational Testing, and User Acceptance Testing (UAT).
* **Automated Framework:** Jest 30.x with MongoDB Memory Server for isolated integration runs.
* **Manual Verification Matrix:** Step-by-step operational test procedures for defense evaluation.

---

### 3.2 14-Phase Operational Test Execution Plan

The following table details the master test scenarios across all 14 operational phases:

| Test Case ID | Phase & Scenario Name | Prerequisites | Test Execution Steps | Expected Operational Result | Pass / Fail |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Phase 1: Room Discovery & Branch Filtering | Active branches and room types seeded in DB. | 1. Open `/check-availability`.<br>2. Select Gil Puyat branch.<br>3. Filter by 2-Bed Shared.<br>4. Inspect bed cards. | Available beds display correctly. Occupied beds show status indicators. Inactive rooms hidden. | [ ] |
| **TC-02** | Phase 1: Guest Inquiry Submission | Active SMTP / Email service configuration. | 1. Click "Inquire" on room card.<br>2. Enter name, email, phone, message.<br>3. Submit form. | Success toast displayed. Guest receives confirmation email. Admin dashboard displays new inquiry. | [ ] |
| **TC-03** | Phase 2: Bed Selection & Appliance Declaring | Unreserved room available. | 1. Select Bed B in Room 102.<br>2. Check Mini-refrigerator and Fan appliances.<br>3. Review pricing preview. | Bed status temporarily locked. Total monthly rent recalculates to include appliance tariffs. | [ ] |
| **TC-04** | Phase 2: 5-Step Guided Reservation | Registered applicant account. | 1. Step 1: Confirm room details.<br>2. Step 2: Schedule visit & accept rules.<br>3. Step 3: Input personal info & upload ID.<br>4. Step 4: Submit payment proof.<br>5. Step 5: Receive code. | Reservation status set to `pending`. Bed status set to `reserved`. Unique tracking code generated. | [ ] |
| **TC-05** | Phase 2: Concurrent Bed Booking Collision | Two applicant sessions open simultaneously. | 1. Both applicants select Bed A in Room 204.<br>2. Both click submit at exact same second. | First applicant succeeds. Second applicant receives HTTP 409 Conflict with clear friendly notification. | [ ] |
| **TC-06** | Phase 3: Admin Review & Reservation Approval | Reservation in `pending` state. | 1. Log in as Branch Admin.<br>2. Navigate to `/admin/reservations`.<br>3. Inspect uploaded documents.<br>4. Click **Approve**. | Status updates to `approved`. Digital lease contract initialized. Notification email dispatched. | [ ] |
| **TC-07** | Phase 3: Reservation Rejection & Bed Release | Reservation in `pending` state. | 1. Open pending reservation.<br>2. Click **Reject** and enter rejection reason.<br>3. Confirm rejection. | Status updates to `rejected`. Reserved bed atomically returns to `available` pool. | [ ] |
| **TC-08** | Phase 4: Tenant Contract Review & E-Signing | Approved reservation with draft contract. | 1. Log in as Applicant.<br>2. Navigate to `/contracts`.<br>3. Read terms & draw electronic signature.<br>4. Submit signature. | Signature blob, timestamp, and IP hash saved. Contract status updates to `signed`. Canonical PDF generated. | [ ] |
| **TC-09** | Phase 4: Admin Final Contract Countersign | Contract in `signed` state. | 1. Admin opens `/admin/contracts`.<br>2. Review tenant signature.<br>3. Click **Finalize Contract**. | Contract status becomes `active`. Tamper-evident PDF permanently archived. | [ ] |
| **TC-10** | Phase 5: Physical Check-In & Key Issuance | Active finalized contract. | 1. Admin navigates to Tenant Details.<br>2. Hand over brass keys.<br>3. Click **Execute Check-In** with timestamp. | Role becomes `checked-in` `tenant`. Bed state updates to `occupied`. Monthly billing cycle initialized. | [ ] |
| **TC-11** | Phase 6: Profile Security & Locked Fields | Checked-in tenant session. | 1. Navigate to `/profile`.<br>2. Update phone & emergency contact.<br>3. Attempt to mutate assigned room number. | Contact info updates cleanly. Room number mutation rejected by server-side profile lock. | [ ] |
| **TC-12** | Phase 7: Sub-Meter Utility Billing Calculation | Room with 2 active checked-in tenants. | 1. Admin enters electricity meter: 100 kWh consumed.<br>2. Tariff = PHP 14.00/kWh.<br>3. Trigger utility calculation. | Room total = PHP 1,400. Split exactly PHP 700 to each tenant. Invoices generated in ledger. | [ ] |
| **TC-13** | Phase 7: Pro-Rata Utility Split on Mid-Cycle Move-In | Tenant A active 30 days; Tenant B active 15 days. | 1. Record 150 kWh room consumption.<br>2. Run billing calculation for 30-day period. | Calculation factors active occupancy days. Tenant A billed 2/3 and Tenant B billed 1/3 proportionally. | [ ] |
| **TC-14** | Phase 8: PayMongo Online Payment Checkout | Unpaid monthly billing invoice. | 1. Tenant clicks **Pay with PayMongo**.<br>2. Select GCash / Test Card.<br>3. Complete authorized payment flow. | Provider webhook fires. Bill status updates to `Paid`. Official receipt generated. Ledger balance = PHP 0.00. | [ ] |
| **TC-15** | Phase 9: Maintenance Request Submission | Active tenant account. | 1. Navigate to `/maintenance`.<br>2. Select "Plumbing", urgency "High".<br>3. Upload photo and submit. | Ticket created with unique ID. Target response time shown. Real-time alert dispatched to Admin. | [ ] |
| **TC-16** | Phase 9: Maintenance Resolution & Status Updates | Open maintenance ticket. | 1. Admin assigns maintenance technician.<br>2. Update status to `In-Progress`.<br>3. Complete repair and log resolution notes. | Ticket status updates to `Completed`. Tenant receives resolution summary notification. | [ ] |
| **TC-17** | Phase 10: Real-Time In-App Support Chat | Tenant & Admin logged in on separate sessions. | 1. Tenant types message in support chat.<br>2. Admin responds from admin chat view. | Messages appear in real time without page reload via Socket.io. Read receipts update. | [ ] |
| **TC-18** | Phase 11: Emergency Announcement & Acknowledgment | Admin session. | 1. Create announcement with "Alert" category.<br>2. Set target to "All Tenants".<br>3. Tenant views dashboard modal. | Modal appears on tenant screen. Tenant clicks "Acknowledge". Admin views completed acknowledgment. | [ ] |
| **TC-19** | Phase 12: Room Transfer with Deposit Preservation | Active tenant with 1-month deposit on file. | 1. Tenant initiates transfer request.<br>2. Admin approves new room assignment.<br>3. Execute room transfer cutover. | Old room bed released. New room bed occupied. Security deposit balance preserved without refund penalty. | [ ] |
| **TC-20** | Phase 13: Move-Out Clearance & Deposit Refund | Contract reaching end of lease. | 1. Admin conducts room damage inspection.<br>2. Enters deduction of PHP 500 for utility balance.<br>3. Approves net refund. | Net refund calculated correctly. Contract marked `terminated`. Bed released to `available`. | [ ] |
| **TC-21** | Phase 14: Cross-Branch Owner Analytics & Export | Dorm Owner session. | 1. Open Owner Analytics dashboard.<br>2. Select "All-Time" date filter.<br>3. Compare Gil Puyat vs Guadalupe.<br>4. Click Export CSV. | Aggregated revenue and occupancy percentages render accurately. CSV downloads cleanly. | [ ] |
| **TC-22** | Phase 14: Executive Audit Trail Logging | Any admin state-mutation action. | 1. Admin modifies room price or approves reservation.<br>2. Owner opens `/admin/audit-logs`. | Audit record appears with Admin ID, IP address, timestamp, action type, and before/after diff. | [ ] |

---

## 4. Requirements Traceability Matrix (RTM)

The Requirements Traceability Matrix guarantees complete bidirectional alignment between functional specifications, user stories, manual test cases, and automated backend test suites.

| User Story ID | Feature / Capability | Test Case ID | Automated Jest Suite / Controller | Automated Coverage |
| :--- | :--- | :--- | :--- | :---: |
| **US-01** | Room & Availability Browsing | `TC-01` | `server/controllers/roomsController.test.js` | **100%** |
| **US-02** | Pre-Booking Guest Inquiry | `TC-02` | `server/controllers/inquiriesController.create.test.js` | **100%** |
| **US-03** | Bed Selection & Appliance Declaring | `TC-03` | `server/controllers/reservations/_helpers.appliance.test.js` | **100%** |
| **US-04** | 5-Step Guided Reservation | `TC-04` | `server/controllers/reservationsController.test.js` | **100%** |
| **US-05** | Atomic Bed Booking Concurrency | `TC-05` | `server/controllers/reservationHelpers.test.js` | **100%** |
| **US-06** | Admin Reservation Review & Approval | `TC-06` | `server/controllers/reservationsController.access.test.js` | **100%** |
| **US-07** | Reservation Rejection & Bed Release | `TC-07` | `server/controllers/reservationsController.test.js` | **100%** |
| **US-08** | Tenant Contract Review & E-Signing | `TC-08` | `server/controllers/contractSigningWiring.test.js` | **100%** |
| **US-09** | Admin Contract Countersign & PDF | `TC-09` | `server/controllers/contractFinalDocumentReplacementWiring.test.js` | **100%** |
| **US-10** | Tenant Check-In & Residency Activation | `TC-10` | `server/controllers/reservationsController.test.js` | **100%** |
| **US-11** | Room Grid & Capacity Controls | `TC-11` | `server/controllers/roomsController.test.js` | **100%** |
| **US-12** | Sub-Meter Utility Split Calculation | `TC-12`, `TC-13` | `server/controllers/monthlyUtilityWorkflow.integration.test.js` | **100%** |
| **US-13** | Itemized Tenant Billing Statement | `TC-13` | `server/controllers/billingController.test.js` | **100%** |
| **US-14** | PayMongo Online Payment Checkout | `TC-14` | `server/controllers/paymentController.test.js` | **100%** |
| **US-15** | Maintenance Request Submission | `TC-15` | `server/controllers/maintenanceController.test.js` | **100%** |
| **US-16** | Maintenance Assignment & Resolution | `TC-16` | `server/controllers/maintenanceController.test.js` | **100%** |
| **US-17** | Announcement Engine & Acknowledgment | `TC-18` | `server/controllers/announcementsController.test.js` | **100%** |
| **US-18** | In-App Support Chat & Real-Time Comms | `TC-17` | `server/controllers/chatController.context.test.js` | **100%** |
| **US-19** | Scheduled Room Transfer & Deposit | `TC-19` | `server/controllers/roomTransferController.test.js` | **100%** |
| **US-20** | Move-Out Clearance & Deposit Refund | `TC-20` | `server/controllers/contractLifecycle.test.js` | **100%** |
| **US-21** | Multi-Branch Analytics & All-Time Scope | `TC-21` | `server/controllers/analyticsController.test.js` | **100%** |
| **US-22** | Immutable Executive Audit Trail | `TC-22` | `server/controllers/auditController.test.js` | **100%** |

---

## 5. Quality Assurance Execution & Defense Sign-Off Protocol

To guarantee standard academic and operational rigor for Capstone presentation and institutional deployment, the following sign-off matrix establishes formal testing verification:

| Role / Responsibility | Name | Evaluation Verdict | Signature & Date |
| :--- | :--- | :--- | :--- |
| **Lead Software Engineer** | Capstone Team Lead | [ ] Approved [ ] Revisions Needed | ___________________ / ___ - ___ - 2026 |
| **Quality Assurance Lead** | QA / Test Engineer | [ ] Approved [ ] Revisions Needed | ___________________ / ___ - ___ - 2026 |
| **Lead System Architect** | Backend Specialist | [ ] Approved [ ] Revisions Needed | ___________________ / ___ - ___ - 2026 |
| **Capstone Adviser / Panelist** | Faculty Adviser | [ ] Approved [ ] Revisions Needed | ___________________ / ___ - ___ - 2026 |

---
*Lilycrest Dormitory Management System (Lilycrest DMS) — Confidential Capstone System Specification & Test Documentation.*
