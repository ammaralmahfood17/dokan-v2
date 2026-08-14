# Security Policy

Dokan v2 is designed for multi-tenant production environments where data isolation is critical.

## 🛡 Security Model

### 1. Data Isolation (RLS)
We use PostgreSQL Row Level Security (RLS) as the primary defense. 
- Every table containing tenant data has a `project_id` column.
- Policies ensure that users can only access data belonging to projects where they have a valid entry in the `staff_members` table.
- Access is verified at the database level, meaning even a compromised API key cannot leak data across tenants.

### 2. Pricing Integrity
To prevent "price tampering" (where a user modifies the price in the browser before checkout):
- **Server-Side Recalculation:** The client sends only the `product_id` and `quantity`.
- **Atomic RPCs:** Total price, taxes, and discounts are calculated inside a PostgreSQL function (RPC) using the latest database prices.
- The client never dictates the final price.

### 3. Authentication & Authorization
- **JWT-based Auth:** Powered by Supabase Auth.
- **Role-Based Access (RBAC):** Permissions are gated by roles (`owner`, `manager`, `cashier`, `kitchen`) checked via middleware and RLS.
- **Service Role Isolation:** The `service_role` key is used exclusively in server-side actions and is never exposed to the browser.

## 🐛 Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public issue. Instead:
1. Email the maintainer directly.
2. Provide a detailed description of the flaw and a Proof of Concept (PoC).
3. Allow a reasonable time for a fix before public disclosure.

## 🛠 Hygiene
- **Dependabot:** Enabled to track and patch vulnerable dependencies.
- **CI Integration:** `npm audit` is integrated into our build pipeline to catch known vulnerabilities early.
